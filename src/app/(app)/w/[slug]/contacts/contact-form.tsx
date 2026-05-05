"use client";

import { useActionState } from "react";
import type { Contact } from "@/lib/contacts";
import type { PipelineStage } from "@/lib/workspace-constants";
import type { ContactFormState } from "./actions";

type Props = {
  pipelineStages: PipelineStage[];
  initialContact?: Contact;
  initialLeadStageId?: string | null;
  action: (state: ContactFormState, formData: FormData) => Promise<ContactFormState>;
  submitLabel: string;
};

const INITIAL_STATE: ContactFormState = {};

export function ContactForm({
  pipelineStages,
  initialContact,
  initialLeadStageId,
  action,
  submitLabel,
}: Props) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          label="Email *"
          name="email"
          type="email"
          required
          defaultValue={initialContact?.email}
          error={state.fieldErrors?.email}
        />
        <Field
          label="Phone"
          name="phone"
          defaultValue={initialContact?.phone ?? ""}
        />
        <Field
          label="First name"
          name="first_name"
          defaultValue={initialContact?.first_name ?? ""}
        />
        <Field
          label="Last name"
          name="last_name"
          defaultValue={initialContact?.last_name ?? ""}
        />
        <Field
          label="Company"
          name="company"
          defaultValue={initialContact?.company ?? ""}
        />
        <Field
          label="Position"
          name="position"
          defaultValue={initialContact?.position ?? ""}
        />
        <Field
          label="Website"
          name="website"
          type="url"
          placeholder="https://..."
          defaultValue={initialContact?.website ?? ""}
        />
        <div>
          <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Priority
          </label>
          <select
            name="priority"
            defaultValue={initialContact?.priority ?? "medium"}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Lead Stage (di workspace ini)
        </label>
        <select
          name="lead_stage_id"
          defaultValue={initialLeadStageId ?? "new"}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
        >
          {pipelineStages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <Field
        label="Tags (comma-separated)"
        name="tags"
        placeholder="bogor, hr, corporate"
        defaultValue={initialContact?.tags?.join(", ") ?? ""}
      />

      <div>
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
        >
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={initialContact?.notes ?? ""}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
        />
      </div>

      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400">
          ✓ Saved
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-50 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? "Menyimpan..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  required,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
      />
      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
