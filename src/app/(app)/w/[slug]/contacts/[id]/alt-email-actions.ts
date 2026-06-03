"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const EmailSchema = z.string().email();

type Result =
  | { ok: true }
  | { ok: false; error: string };

async function authedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

async function loadContact(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data, error } = await supabase
    .from("contacts")
    .select("id, user_id, email, alt_emails")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return data as {
    id: string;
    user_id: string;
    email: string;
    alt_emails: string[] | null;
  };
}

export async function addAltEmail(
  contactId: string,
  slug: string,
  email: string,
): Promise<Result> {
  const { supabase } = await authedClient();
  const normalized = email.trim().toLowerCase();
  if (!EmailSchema.safeParse(normalized).success) {
    return { ok: false, error: "Format email tidak valid" };
  }

  const contact = await loadContact(supabase, contactId);
  if (!contact) return { ok: false, error: "Kontak tidak ditemukan" };
  if (normalized === contact.email.toLowerCase()) {
    return { ok: false, error: "Email itu udah jadi primary" };
  }
  const current = contact.alt_emails ?? [];
  if (current.includes(normalized)) {
    return { ok: false, error: "Email ini udah terdaftar" };
  }

  const next = [...current, normalized];
  const { error } = await supabase
    .from("contacts")
    .update({ alt_emails: next })
    .eq("id", contactId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/w/${slug}/contacts/${contactId}`);
  revalidatePath(`/w/${slug}/contacts`);
  return { ok: true };
}

export async function removeAltEmail(
  contactId: string,
  slug: string,
  email: string,
): Promise<Result> {
  const { supabase } = await authedClient();
  const normalized = email.trim().toLowerCase();
  const contact = await loadContact(supabase, contactId);
  if (!contact) return { ok: false, error: "Kontak tidak ditemukan" };

  const next = (contact.alt_emails ?? []).filter(
    (e) => e.toLowerCase() !== normalized,
  );
  const { error } = await supabase
    .from("contacts")
    .update({ alt_emails: next })
    .eq("id", contactId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/w/${slug}/contacts/${contactId}`);
  revalidatePath(`/w/${slug}/contacts`);
  return { ok: true };
}

/**
 * Promote an alt email to primary. The current primary becomes an alt
 * (preserved, not lost). Refuses if the alt is already used as another
 * contact's primary email.
 */
export async function swapPrimaryEmail(
  contactId: string,
  slug: string,
  newPrimary: string,
): Promise<Result> {
  const { supabase, userId } = await authedClient();
  const normalized = newPrimary.trim().toLowerCase();
  if (!EmailSchema.safeParse(normalized).success) {
    return { ok: false, error: "Format email tidak valid" };
  }

  const contact = await loadContact(supabase, contactId);
  if (!contact) return { ok: false, error: "Kontak tidak ditemukan" };
  if (normalized === contact.email.toLowerCase()) {
    return { ok: false, error: "Email itu udah jadi primary" };
  }

  // Make sure no other contact owns this email as their primary
  const { data: clash } = await supabase
    .from("contacts")
    .select("id")
    .eq("user_id", userId)
    .eq("email", normalized)
    .is("deleted_at", null)
    .neq("id", contactId)
    .maybeSingle();
  if (clash) {
    return {
      ok: false,
      error: "Email ini udah dipakai kontak lain sebagai primary",
    };
  }

  const oldPrimary = contact.email.toLowerCase();
  const altList = (contact.alt_emails ?? []).map((e) => e.toLowerCase());
  // Remove the new primary from alts (it's being promoted), add the old
  // primary if it isn't already there.
  const nextAlts = altList.filter((e) => e !== normalized);
  if (oldPrimary && !nextAlts.includes(oldPrimary)) {
    nextAlts.push(oldPrimary);
  }

  const { error } = await supabase
    .from("contacts")
    .update({ email: normalized, alt_emails: nextAlts })
    .eq("id", contactId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/w/${slug}/contacts/${contactId}`);
  revalidatePath(`/w/${slug}/contacts`);
  return { ok: true };
}
