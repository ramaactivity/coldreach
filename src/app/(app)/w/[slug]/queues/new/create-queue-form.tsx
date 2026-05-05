"use client";

import { useActionState, useState } from "react";
import type { CreateQueueState } from "../actions";

const INITIAL_STATE: CreateQueueState = {};

export function CreateQueueForm({
  action,
  templates,
  tags,
  totalActiveContacts,
  workspaceDefaults,
}: {
  action: (state: CreateQueueState, formData: FormData) => Promise<CreateQueueState>;
  templates: Array<{ id: string; name: string; attachmentCount: number }>;
  tags: string[];
  totalActiveContacts: number;
  workspaceDefaults: {
    schedule_start_time: string;
    schedule_end_time: string;
    daily_target: number;
  };
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const [audienceType, setAudienceType] = useState<"all" | "tag">("all");
  const [selectedTag, setSelectedTag] = useState(tags[0] ?? "");

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
        >
          Nama Queue
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="Bogor HR Cold Outreach Q2"
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
        />
        {state.fieldErrors?.name && (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.name}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="template_id"
          className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
        >
          Template
        </label>
        <select
          id="template_id"
          name="template_id"
          required
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.attachmentCount > 0 ? ` (📎 ${t.attachmentCount})` : ""}
            </option>
          ))}
        </select>
        {state.fieldErrors?.template_id && (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.template_id}</p>
        )}
      </div>

      {/* Audience */}
      <div>
        <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Target Kontak
        </label>
        <div className="mt-2 space-y-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-200 p-3 transition hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500">
            <input
              type="radio"
              name="audience_type"
              value="all"
              checked={audienceType === "all"}
              onChange={() => setAudienceType("all")}
              className="mt-0.5"
            />
            <div className="flex-1 text-sm">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                Semua kontak active ({totalActiveContacts.toLocaleString("id-ID")})
              </p>
              <p className="text-xs text-zinc-500">
                Semua kontak yang status active akan di-target.
              </p>
            </div>
          </label>

          {tags.length > 0 && (
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-200 p-3 transition hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500">
              <input
                type="radio"
                name="audience_type"
                value="tag"
                checked={audienceType === "tag"}
                onChange={() => setAudienceType("tag")}
                className="mt-0.5"
              />
              <div className="flex-1 text-sm">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  Tag tertentu
                </p>
                <p className="text-xs text-zinc-500">
                  Kontak dengan tag spesifik (cth: bogor, hr, q2-import).
                </p>
                <select
                  name="audience_tag"
                  value={selectedTag}
                  onChange={(e) => setSelectedTag(e.target.value)}
                  disabled={audienceType !== "tag"}
                  className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs outline-none disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800"
                >
                  {tags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          )}
        </div>
      </div>

      {/* Schedule */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label
            htmlFor="schedule_start_time"
            className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
          >
            Mulai jam
          </label>
          <input
            id="schedule_start_time"
            name="schedule_start_time"
            type="time"
            defaultValue={workspaceDefaults.schedule_start_time}
            required
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div>
          <label
            htmlFor="schedule_end_time"
            className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
          >
            Sampai jam
          </label>
          <input
            id="schedule_end_time"
            name="schedule_end_time"
            type="time"
            defaultValue={workspaceDefaults.schedule_end_time}
            required
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div>
          <label
            htmlFor="daily_target"
            className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
          >
            Target/hari
          </label>
          <input
            id="daily_target"
            name="daily_target"
            type="number"
            min={1}
            max={500}
            defaultValue={workspaceDefaults.daily_target}
            required
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="use_ai_opener"
            defaultChecked
            className="rounded border-zinc-300 dark:border-zinc-700"
          />
          <span className="text-zinc-900 dark:text-zinc-100">
            Pakai AI personalization (Gemini akan generate opener line per kontak)
          </span>
        </label>
        <p className="ml-6 mt-1 text-xs text-zinc-500">
          Variable <code>{`{ai_opener}`}</code> di template akan di-fill otomatis. Implementation di Fase 7 (sekarang masih kosong).
        </p>
      </div>

      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          {state.error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-50 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? "Membuat queue..." : "Buat Queue"}
        </button>
      </div>
    </form>
  );
}
