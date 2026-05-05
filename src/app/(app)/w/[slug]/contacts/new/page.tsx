import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { ContactForm } from "../contact-form";
import { createContact, type ContactFormState } from "../actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";

export default async function NewContactPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  async function action(_prev: ContactFormState, formData: FormData) {
    "use server";
    const result = await createContact(slug, _prev, formData);
    if (result.success) {
      redirect(`/w/${slug}/contacts`);
    }
    return result;
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link
        href={`/w/${slug}/contacts`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to contacts
      </Link>
      <PageHeader
        title="New Contact"
        description="Tambah kontak baru ke database. Kontak otomatis terhubung ke workspace ini."
      />
      <Card className="p-6">
        <ContactForm
          pipelineStages={workspace.pipeline_stages}
          action={action}
          submitLabel="Buat Contact"
        />
      </Card>
    </div>
  );
}
