"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Image as ImageIcon, Upload, Trash2, AlertCircle, Loader2 } from "lucide-react";
import type { TemplateAttachment } from "@/lib/template-helpers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
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
  const confirm = useConfirm();
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

  async function handleDelete(attachmentId: string) {
    setError(null);
    const ok = await confirm({
      title: "Hapus attachment ini?",
      description: "Attachment akan dihapus dari semua send berikutnya.",
      confirmLabel: "Hapus",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteAttachment(attachmentId, templateId, slug);
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {attachments.length > 0 && (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {attachments.map((a) => {
              const isPdf = a.mime_type === "application/pdf";
              const Icon = isPdf ? FileText : ImageIcon;
              return (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        isPdf
                          ? "bg-danger-soft text-danger"
                          : "bg-info-soft text-info"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {a.filename}
                      </p>
                      <p className="text-xs text-muted">
                        {formatBytes(a.size_bytes)}
                        <span className="mx-1.5">·</span>
                        <span className="font-mono">{a.mime_type}</span>
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(a.id)}
                    disabled={pending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <label
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center transition-all ${
          pending
            ? "border-border bg-surface-sunken/50"
            : "border-border-strong bg-surface-sunken/40 hover:border-border-strong hover:bg-surface-sunken/40"
        }`}
      >
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="sr-only"
          disabled={pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleUpload(file);
              e.target.value = "";
            }
          }}
        />
        <div
          className={`mb-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-surface ring-1 ring-border ${pending ? "opacity-50" : ""}`}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted" />
          ) : (
            <Upload className="h-4 w-4 text-muted" />
          )}
        </div>
        <p className="text-sm font-medium text-ink">
          {pending ? "Uploading..." : "Click untuk upload attachment"}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          PDF, JPEG, PNG · Max 5 MB
        </p>
      </label>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-danger-soft bg-danger-soft p-3 text-xs text-danger-text">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
