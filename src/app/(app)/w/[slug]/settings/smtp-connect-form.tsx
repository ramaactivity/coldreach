"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel, FieldError, Input } from "@/components/ui/input";
import { connectSmtpAccount, type FormState } from "./actions";

const INITIAL: FormState = {};

/** Connect a custom-domain mailbox over SMTP (send) + IMAP (replies/bounces).
 *  Host defaults are Hostinger's. */
export function SmtpConnectForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(
    connectSmtpAccount.bind(null, slug),
    INITIAL,
  );

  return (
    <details className="w-full rounded-lg border border-border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink">
        Atau connect email domain sendiri (SMTP/IMAP, mis. Hostinger)
      </summary>
      <form action={action} className="space-y-4 border-t border-border p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="smtp-email" required>Email</FieldLabel>
            <Input id="smtp-email" name="email" type="email" required autoComplete="off" />
            <FieldError>{state.fieldErrors?.email}</FieldError>
          </div>
          <div>
            <FieldLabel htmlFor="smtp-password" required>Password email</FieldLabel>
            <Input id="smtp-password" name="password" type="password" required autoComplete="new-password" />
            <FieldError>{state.fieldErrors?.password}</FieldError>
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="smtp-name" hint="Nama pengirim di inbox penerima">
              Display name
            </FieldLabel>
            <Input id="smtp-name" name="display_name" maxLength={80} />
          </div>
          <div>
            <FieldLabel htmlFor="smtp-host">SMTP host</FieldLabel>
            <Input id="smtp-host" name="smtp_host" defaultValue="smtp.hostinger.com" required />
          </div>
          <div>
            <FieldLabel htmlFor="smtp-port">SMTP port</FieldLabel>
            <Input id="smtp-port" name="smtp_port" type="number" defaultValue={465} required />
          </div>
          <div>
            <FieldLabel htmlFor="imap-host">IMAP host</FieldLabel>
            <Input id="imap-host" name="imap_host" defaultValue="imap.hostinger.com" required />
          </div>
          <div>
            <FieldLabel htmlFor="imap-port">IMAP port</FieldLabel>
            <Input id="imap-port" name="imap_port" type="number" defaultValue={993} required />
          </div>
        </div>

        {state.error && (
          <p className="rounded-md border border-danger-soft bg-danger-soft p-3 text-[13px] font-medium text-danger-text">
            {state.error}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" loading={pending} disabled={pending} size="sm">
            {pending ? "Mengecek login..." : "Connect"}
          </Button>
        </div>
      </form>
    </details>
  );
}
