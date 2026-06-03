"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { extractVariables, plainToHtml } from "@/lib/template-helpers";

const TemplateSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter").max(100),
  category: z.string().optional(),
  subject_lines: z.string().min(1, "Minimal 1 subject line"),
  subject_lines_en: z.string().optional(),
  body_plain: z.string().min(10, "Body minimal 10 karakter"),
  body_plain_en: z.string().optional(),
});

export type TemplateFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  templateId?: string;
};

function parseSubjectLines(input: string): string[] {
  return input
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createTemplate(
  slug: string,
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return { error: "Workspace not found" };

  const parsed = TemplateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { fieldErrors };
  }

  const {
    name,
    category,
    subject_lines,
    subject_lines_en,
    body_plain,
    body_plain_en,
  } = parsed.data;
  const subjectArray = parseSubjectLines(subject_lines);
  if (subjectArray.length === 0) {
    return { fieldErrors: { subject_lines: "Minimal 1 subject line" } };
  }
  const subjectEnArray = subject_lines_en
    ? parseSubjectLines(subject_lines_en)
    : [];
  const subjectEn = subjectEnArray.length > 0 ? subjectEnArray : null;
  const variables = extractVariables(body_plain);
  const enBody = body_plain_en?.trim() ? body_plain_en : null;
  const allText = [
    ...subjectArray,
    ...subjectEnArray,
    body_plain,
    enBody ?? "",
  ].join(" ");
  const allVariables = Array.from(
    new Set([...variables, ...extractVariables(allText)]),
  );
  const bodyHtml = plainToHtml(body_plain);

  const { data: template, error } = await supabase
    .from("templates")
    .insert({
      user_id: user.id,
      workspace_id: workspace.id,
      name,
      category: category || null,
      subject_lines: subjectArray,
      subject_lines_en: subjectEn,
      body_plain,
      body_plain_en: enBody,
      body_html: bodyHtml,
      variables_used: allVariables,
    })
    .select("id")
    .single();

  if (error || !template) {
    return { error: error?.message ?? "Gagal membuat template" };
  }

  revalidatePath(`/w/${slug}/templates`);
  return { success: true, templateId: template.id };
}

export async function updateTemplate(
  id: string,
  slug: string,
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return { error: "Workspace not found" };

  const parsed = TemplateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { fieldErrors };
  }

  const {
    name,
    category,
    subject_lines,
    subject_lines_en,
    body_plain,
    body_plain_en,
  } = parsed.data;
  const subjectArray = parseSubjectLines(subject_lines);
  const subjectEnArray = subject_lines_en
    ? parseSubjectLines(subject_lines_en)
    : [];
  const subjectEn = subjectEnArray.length > 0 ? subjectEnArray : null;
  const enBody = body_plain_en?.trim() ? body_plain_en : null;
  const allText = [
    ...subjectArray,
    ...subjectEnArray,
    body_plain,
    enBody ?? "",
  ].join(" ");
  const allVariables = extractVariables(allText);
  const bodyHtml = plainToHtml(body_plain);

  const { error } = await supabase
    .from("templates")
    .update({
      name,
      category: category || null,
      subject_lines: subjectArray,
      subject_lines_en: subjectEn,
      body_plain,
      body_plain_en: enBody,
      body_html: bodyHtml,
      variables_used: allVariables,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/w/${slug}/templates`);
  revalidatePath(`/w/${slug}/templates/${id}`);
  return { success: true, templateId: id };
}

export async function deleteTemplate(id: string, slug: string) {
  const supabase = await createClient();
  await supabase
    .from("templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath(`/w/${slug}/templates`);
  redirect(`/w/${slug}/templates`);
}

const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"];

export async function uploadAttachment(
  templateId: string,
  slug: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return { error: "Workspace not found" };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "File kosong" };

  if (file.size > ATTACHMENT_MAX_BYTES) {
    return { error: `File terlalu besar. Max 5 MB.` };
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return {
      error: `Tipe file gak diizinkan. Hanya PDF, JPEG, PNG. (Detected: ${file.type})`,
    };
  }

  const ext = file.name.split(".").pop() ?? "bin";
  const safeName = file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .slice(0, 50);
  const path = `${user.id}/${workspace.id}/${Date.now()}-${safeName}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("template-attachments")
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) return { error: uploadError.message };

  const { error: dbError } = await supabase.from("template_attachments").insert({
    template_id: templateId,
    user_id: user.id,
    workspace_id: workspace.id,
    filename: file.name,
    storage_path: path,
    size_bytes: file.size,
    mime_type: file.type,
  });

  if (dbError) {
    // Cleanup uploaded file on DB failure
    await supabase.storage.from("template-attachments").remove([path]);
    return { error: dbError.message };
  }

  revalidatePath(`/w/${slug}/templates/${templateId}`);
  return {};
}

export async function deleteAttachment(
  attachmentId: string,
  templateId: string,
  slug: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: attachment } = await supabase
    .from("template_attachments")
    .select("storage_path")
    .eq("id", attachmentId)
    .maybeSingle();

  if (!attachment) return { error: "Attachment not found" };

  await supabase.storage
    .from("template-attachments")
    .remove([attachment.storage_path]);

  await supabase.from("template_attachments").delete().eq("id", attachmentId);

  revalidatePath(`/w/${slug}/templates/${templateId}`);
  return {};
}
