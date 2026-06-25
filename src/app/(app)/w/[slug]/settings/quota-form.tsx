"use client";

import { useActionState, useState } from "react";
import { Pencil, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input } from "@/components/ui/input";
import { updateGmailQuota, type FormState } from "./actions";

const INITIAL: FormState = {};

export function QuotaForm({
  slug,
  accountId,
  initialQuota,
  emailsSentToday,
  effectiveCap,
  warmupDay = null,
}: {
  slug: string;
  accountId: string;
  /** Configured full daily target (what Edit changes). */
  initialQuota: number;
  emailsSentToday: number;
  /** Cap that actually applies today — equals initialQuota unless warmup is
   *  ramping, in which case it's the lower warmup-stage value. */
  effectiveCap: number;
  /** Current day in the warmup ramp, or null when warmup is off. */
  warmupDay?: number | null;
}) {
  const action = updateGmailQuota.bind(null, slug, accountId);
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialQuota);

  if (!editing) {
    return (
      <div>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-semibold tabular tracking-tight text-ink">
            {emailsSentToday}{" "}
            <span className="text-base font-normal text-muted">
              / {effectiveCap}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        </div>
        {warmupDay !== null && (
          <p className="mt-1 text-[11px] text-muted">
            🔥 Warmup hari ke-{warmupDay} · naik bertahap ke target{" "}
            <span className="tabular font-medium text-ink-secondary">
              {initialQuota}
            </span>
            /hari
          </p>
        )}
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
        <Input
          type="number"
          name="daily_quota"
          min={1}
          max={500}
          value={value}
          onChange={(e) => setValue(parseInt(e.target.value, 10) || 1)}
          className="w-24 tabular"
        />
        <span className="text-xs text-muted">/ hari (target penuh)</span>
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
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted hover:bg-surface-hover"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <FieldError>{state.fieldErrors?.daily_quota}</FieldError>
      {state.error && (
        <p className="text-xs text-danger-text">{state.error}</p>
      )}
      {state.success && (
        <p className="text-xs text-success-text">✓ Saved</p>
      )}
    </form>
  );
}
