import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { ContactForm } from "../contact-form";
import { createContact, type ContactFormState } from "../actions";

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
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← Back to contacts
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        New Contact
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Tambah kontak baru ke database. Kontak otomatis terhubung ke workspace ini.
      </p>

      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <ContactForm
          pipelineStages={workspace.pipeline_stages}
          action={action}
          submitLabel="Buat Contact"
        />
      </div>
    </div>
  );
}
