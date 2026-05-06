"use client";

import { useActionState, useState } from "react";
import { Eye, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, FieldLabel, Textarea } from "@/components/ui/input";
import { updateWorkspaceSignature, type FormState } from "./actions";

const INITIAL: FormState = {};

const PRESETS = [
  {
    label: "Tiska Catering",
    value:
      "Salam hangat,\nMuhamad Ramadan Saputra\nSales Manager — Tiska Catering Bogor\nworkwithrama98@gmail.com\n+62 812-XXXX-XXXX\nwww.tiskacatering.com",
  },
  {
    label: "Tetra Photobooth",
    value:
      "Best regards,\nTetra Photobooth Team\nworkwithrama98@gmail.com\n+62 812-XXXX-XXXX\nIG: @tetraphotobooth",
  },
  {
    label: "Visual Tetra",
    value:
      "Cheers,\nVisual Tetra — Design Studio\nworkwithrama98@gmail.com\nIG: @visualtetra",
  },
];

export function SignatureForm({
  slug,
  initial,
}: {
  slug: string;
  initial: { signature: string | null };
}) {
  const [state, action, pending] = useActionState(
    updateWorkspaceSignature.bind(null, slug),
    INITIAL,
  );
  const [value, setValue] = useState(initial.signature ?? "");
  const [view, setView] = useState<"edit" | "preview">("edit");

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Default Signature
        </h3>
        <div className="flex gap-1 rounded-lg border border-zinc-200/80 bg-zinc-50/50 p-0.5 dark:border-zinc-800 dark:bg-zinc-900/50">
          <button
            type="button"
            onClick={() => setView("edit")}
            className={`inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors ${
              view === "edit"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <Code className="h-3 w-3" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => setView("preview")}
            className={`inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors ${
              view === "preview"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <Eye className="h-3 w-3" />
            Preview
          </button>
        </div>
      </div>

      <form action={action} className="space-y-4 p-5">
        <div>
          <FieldLabel htmlFor="signature" hint="appended ke setiap email kirim">
            Signature
          </FieldLabel>

          {view === "edit" ? (
            <Textarea
              id="signature"
              name="signature"
              rows={7}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Salam hangat,&#10;Nama Anda&#10;Title — Workspace Name&#10;email@example.com&#10;+62 8xx-xxxx-xxxx"
              className="font-mono text-xs"
            />
          ) : (
            <>
              <input type="hidden" name="signature" value={value} />
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Begini muncul di email lu
                </p>
                {value.trim() ? (
                  <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-700 dark:text-zinc-300">
                    [body email...]
                    {"\n\n"}
                    -- {"\n"}
                    {value}
                  </pre>
                ) : (
                  <p className="text-sm italic text-zinc-400">
                    (signature kosong — gak akan ada apa-apa di-append)
                  </p>
                )}
              </div>
            </>
          )}

          <FieldError>{state.fieldErrors?.signature}</FieldError>
          <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            Signature otomatis dipisah dari body pakai{" "}
            <code className="rounded bg-zinc-100 px-1 font-mono text-[10px] dark:bg-zinc-800">
              --
            </code>{" "}
            (RFC 3676) supaya Gmail bisa collapse otomatis.
          </p>
        </div>

        {/* Preset chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Quick start:
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setValue(p.value);
                setView("edit");
              }}
              className="inline-flex h-7 items-center rounded-full border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {p.label}
            </button>
          ))}
          {value && (
            <button
              type="button"
              onClick={() => setValue("")}
              className="inline-flex h-7 items-center rounded-full px-2.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
            >
              Clear
            </button>
          )}
        </div>

        {state.error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400">
            ✓ Tersimpan — semua email berikutnya pakai signature ini
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" loading={pending} disabled={pending} size="sm">
            {pending ? "Menyimpan..." : "Save Signature"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
