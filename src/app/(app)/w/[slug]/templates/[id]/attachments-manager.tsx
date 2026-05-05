"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TemplateAttachment } from "@/lib/template-helpers";
import { uploadAttachment, deleteAttachment } from "../actions";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function AttachmentsManager({
  templateId,
  slug,
  attachments,
}: {
  templateId: string;
  slug: string;
  attachments: TemplateAttachment[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleUpload(file: File) {
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      const res = await uploadAttachment(templateId, slug, formData);
      if (res.error) {
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleDelete(attachmentId: string) {
    setError(null);
    if (!confirm("Hapus attachment ini?")) return;
    startTransition(async () => {
      const res = await deleteAttachment(attachmentId, templateId, slug);
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="mt-4 space-y-3">
      {attachments.length === 0 ? (
        <p className="text-sm text-zinc-500">Belum ada attachment.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between py-3 text-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-lg">
                  {a.mime_type === "application/pdf" ? "📄" : "🖼️"}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                    {a.filename}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatBytes(a.size_bytes)} · {a.mime_type}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDelete(a.id)}
                disabled={pending}
                className="rounded-md border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center transition hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:border-zinc-500 dark:hover:bg-zinc-800/50">
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="sr-only"
          disabled={pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleUpload(file);
              e.target.value = ""; // reset for re-upload of same name
            }
          }}
        />
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {pending ? "Uploading..." : "+ Upload Attachment"}
        </span>
        <span className="mt-1 text-xs text-zinc-500">
          PDF, JPEG, PNG · Max 5 MB
        </span>
      </label>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
