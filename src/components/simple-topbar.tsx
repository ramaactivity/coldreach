import Link from "next/link";
import { Inbox, LogOut, CalendarOff, HeartPulse } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui";

export function SimpleTopbar({ email }: { email: string }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface px-6 py-3">
      <Link
        href="/dashboard"
        prefetch={true}
        className="flex items-center gap-2 text-[15px] font-semibold text-ink transition-opacity hover:opacity-80"
      >
        <span className="inline-block size-2 shrink-0 rounded-full bg-accent" />
        ColdReach
      </Link>
      <div className="flex items-center gap-2">
        <ButtonLink href="/health" prefetch variant="secondary" size="sm">
          <HeartPulse className="h-3.5 w-3.5" />
          <span>Kesehatan</span>
        </ButtonLink>
        <ButtonLink href="/holidays" prefetch variant="secondary" size="sm">
          <CalendarOff className="h-3.5 w-3.5" />
          <span>Libur</span>
        </ButtonLink>
        <ButtonLink href="/inbox" prefetch variant="secondary" size="sm">
          <Inbox className="h-3.5 w-3.5" />
          <span>Inbox</span>
        </ButtonLink>
        <span className="hidden text-[13px] text-muted sm:block">{email}</span>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="secondary" size="sm">
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign out</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
