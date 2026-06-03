"use client";

import { useActionState, useState } from "react";
import { Pencil, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { updateGmailQuota, type FormState } from "./actions";

const INITIAL: FormState = {};

export function QuotaForm({
  slug,
  accountId,
  initialQuota,
  emailsSentToday,
}: {
  slug: string;
  accountId: string;
  initialQuota: number;
  emailsSentToday: number;
}) {
  const action = updateGmailQuota.bind(null, slug, accountId);
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialQuota);

  if (!editing) {
    return (
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-100">
          {emailsSentToday}{" "}
          <span className="text-base font-normal text-zinc-500">/ {initialQuota}</span>
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-2"
      onSubmit={() => {
        // optimistic close on submit
      }}
    >
      <div className="flex items-center gap-2">
        <input
          type="number"
          name="daily_quota"
          min={1}
          max={500}
          value={value}
          onChange={(e) => setValue(parseInt(e.target.value, 10) || 1)}
          className="h-9 w-24 rounded-lg border border-zinc-200 bg-white px-2 text-sm tabular-nums text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-100"
        />
        <span className="text-xs text-zinc-500 dark:text-zinc-400">/ hari</span>
        <Button
          size="sm"
          type="submit"
          loading={pending}
          disabled={pending}
          className="h-7 text-xs"
        >
          <Check className="h-3 w-3" />
          Save
        </Button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setValue(initialQuota);
          }}
          className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <FieldError>{state.fieldErrors?.daily_quota}</FieldError>
      {state.error && (
        <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state.success && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">✓ Saved</p>
      )}
    </form>
  );
}
