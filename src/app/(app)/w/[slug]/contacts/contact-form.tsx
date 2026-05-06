"use client";

import { useActionState } from "react";
import type { Contact } from "@/lib/contacts";
import type { PipelineStage, CustomField } from "@/lib/workspace-constants";
import { Button } from "@/components/ui/button";
import {
  FieldLabel,
  FieldError,
  Input,
  Select,
  Textarea,
} from "@/components/ui/input";
import type { ContactFormState } from "./actions";

type Props = {
  pipelineStages: PipelineStage[];
  customFields?: CustomField[];
  initialContact?: Contact;
  initialLeadStageId?: string | null;
  action: (state: ContactFormState, formData: FormData) => Promise<ContactFormState>;
  submitLabel: string;
};

const INITIAL_STATE: ContactFormState = {};

export function ContactForm({
  pipelineStages,
  customFields = [],
  initialContact,
  initialLeadStageId,
  action,
  submitLabel,
}: Props) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const cfValues = (initialContact?.custom_fields ?? {}) as Record<
    string,
    string | number | null
  >;

  return (
    <form action={formAction} className="space-y-6">
      {/* Identity section */}
      <Section title="Contact info">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="email" required>
              Email (primary)
            </FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              required
              defaultValue={initialContact?.email}
            />
            <FieldError>{state.fieldErrors?.email}</FieldError>
          </div>
          <div>
            <FieldLabel htmlFor="phone">Phone</FieldLabel>
            <Input
              id="phone"
              name="phone"
              defaultValue={initialContact?.phone ?? ""}
              placeholder="+62 8xx..."
            />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="alt_emails" hint="comma-separated, optional">
              Email (alternate)
            </FieldLabel>
            <Input
              id="alt_emails"
              name="alt_emails"
              placeholder="email-kedua@example.com, email-ketiga@example.com"
              defaultValue={initialContact?.alt_emails?.join(", ") ?? ""}
            />
            <FieldError>{state.fieldErrors?.alt_emails}</FieldError>
          </div>
          <div>
            <FieldLabel htmlFor="first_name">First name</FieldLabel>
            <Input
              id="first_name"
              name="first_name"
              defaultValue={initialContact?.first_name ?? ""}
            />
          </div>
          <div>
            <FieldLabel htmlFor="last_name">Last name</FieldLabel>
            <Input
              id="last_name"
              name="last_name"
              defaultValue={initialContact?.last_name ?? ""}
            />
          </div>
        </div>
      </Section>

      <Section title="Company">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="company">Company</FieldLabel>
            <Input
              id="company"
              name="company"
              defaultValue={initialContact?.company ?? ""}
            />
          </div>
          <div>
            <FieldLabel htmlFor="position">Position</FieldLabel>
            <Input
              id="position"
              name="position"
              defaultValue={initialContact?.position ?? ""}
            />
          </div>
          <div>
            <FieldLabel htmlFor="website">Website</FieldLabel>
            <Input
              id="website"
              name="website"
              type="url"
              placeholder="https://..."
              defaultValue={initialContact?.website ?? ""}
            />
          </div>
          <div>
            <FieldLabel htmlFor="priority">Priority</FieldLabel>
            <Select
              id="priority"
              name="priority"
              defaultValue={initialContact?.priority ?? "medium"}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </div>
        </div>
      </Section>

      <Section title="Pipeline & tags">
        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="lead_stage_id" hint="di workspace ini">
              Lead Stage
            </FieldLabel>
            <Select
              id="lead_stage_id"
              name="lead_stage_id"
              defaultValue={initialLeadStageId ?? "new"}
            >
              {pipelineStages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="tags" hint="comma-separated">
              Tags
            </FieldLabel>
            <Input
              id="tags"
              name="tags"
              placeholder="bogor, hr, corporate"
              defaultValue={initialContact?.tags?.join(", ") ?? ""}
            />
          </div>
          <div>
            <FieldLabel htmlFor="notes">Notes</FieldLabel>
            <Textarea
              id="notes"
              name="notes"
              rows={4}
              defaultValue={initialContact?.notes ?? ""}
            />
          </div>
        </div>
      </Section>

      {customFields.length > 0 && (
        <Section title="Custom fields">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {customFields.map((f) => {
              const initialValue =
                cfValues[f.id] !== undefined && cfValues[f.id] !== null
                  ? String(cfValues[f.id])
                  : "";
              const inputName = `cf_${f.id}`;
              const inputId = `cf_${f.id}`;
              return (
                <div
                  key={f.id}
                  className={f.type === "textarea" ? "sm:col-span-2" : ""}
                >
                  <FieldLabel
                    htmlFor={inputId}
                    required={f.required}
                    hint={f.hint}
                  >
                    {f.label}
                  </FieldLabel>
                  {f.type === "textarea" ? (
                    <Textarea
                      id={inputId}
                      name={inputName}
                      rows={3}
                      defaultValue={initialValue}
                      required={f.required}
                    />
                  ) : f.type === "select" ? (
                    <Select
                      id={inputId}
                      name={inputName}
                      defaultValue={initialValue}
                      required={f.required}
                    >
                      <option value="">— Pilih —</option>
                      {(f.options ?? []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      id={inputId}
                      name={inputName}
                      type={
                        f.type === "number"
                          ? "number"
                          : f.type === "date"
                            ? "date"
                            : "text"
                      }
                      defaultValue={initialValue}
                      required={f.required}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400">
          ✓ Saved
        </p>
      )}

      <div className="flex justify-end pt-2">
        <Button type="submit" loading={pending} disabled={pending}>
          {pending ? "Menyimpan..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {title}
      </p>
      {children}
    </div>
  );
}
