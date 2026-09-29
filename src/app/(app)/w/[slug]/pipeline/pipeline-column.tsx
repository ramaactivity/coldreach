"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, Mail, MessageCircle } from "lucide-react";
import { Badge, toast } from "@/components/ui";
import type { PipelineStage } from "@/lib/workspace-constants";
import type { PipelineContact } from "./page";
import { moveContactStage } from "./actions";

export function PipelineColumn({
  slug,
  stage,
  allStages,
  items,
  maxCards,
}: {
  slug: string;
  stage: PipelineStage;
  allStages: PipelineStage[];
  items: PipelineContact[];
  maxCards: number;
}) {
  const truncated = items.length > maxCards;
  const visible = items.slice(0, maxCards);

  return (
    <div className="flex w-[300px] shrink-0 flex-col rounded-lg border border-border bg-bg-base">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className="inline-block size-2 shrink-0 rounded-full"
            style={{ backgroundColor: stage.color }}
          />
          <span className="text-[15px] font-semibold text-ink">
            {stage.name}
          </span>
        </div>
        <Badge variant="neutral">{items.length}</Badge>
      </div>

      <div className="flex max-h-[calc(100vh-220px)] flex-col gap-2 overflow-y-auto p-2">
        {visible.length === 0 && (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border text-xs text-faint">
            Kosong
          </div>
        )}
        {visible.map((item) => (
          <ContactCard
            key={item.contact_id}
            slug={slug}
            item={item}
            currentStage={stage}
            allStages={allStages}
          />
        ))}
        {truncated && (
          <p className="px-2 py-1.5 text-center text-[11px] text-muted">
            +{items.length - maxCards} more
          </p>
        )}
      </div>
    </div>
  );
}

function ContactCard({
  slug,
  item,
  currentStage,
  allStages,
}: {
  slug: string;
  item: PipelineContact;
  currentStage: PipelineStage;
  allStages: PipelineStage[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);

  const fullName =
    [item.contact.first_name, item.contact.last_name]
      .filter(Boolean)
      .join(" ") || item.contact.email;

  const otherStages = allStages.filter((s) => s.id !== currentStage.id);

  function handleMove(stageId: string) {
    setMenuOpen(false);
    startTransition(async () => {
      const res = await moveContactStage(slug, item.contact_id, stageId);
      if (res?.error) {
        toast.error("Gagal memindahkan kontak", { description: res.error });
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="group relative rounded-lg border border-border bg-surface p-3 transition-colors hover:border-border-strong">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/w/${slug}/contacts/${item.contact.id}`}
          className="min-w-0 flex-1"
        >
          <p className="truncate text-[15px] font-semibold text-ink">
            {fullName}
          </p>
          {item.contact.company && (
            <p className="mt-0.5 truncate text-[13px] text-muted">
              {item.contact.company}
              {item.contact.position && ` · ${item.contact.position}`}
            </p>
          )}
        </Link>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            disabled={pending}
            className="rounded-md p-1 text-faint transition-colors hover:bg-surface-hover hover:text-ink disabled:opacity-50"
            aria-label="Move to stage"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-surface p-1 text-xs shadow-[var(--shadow-md)]">
              <p className="label-eyebrow px-2 pb-1 pt-1.5">Move to</p>
              {otherStages.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleMove(s.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink"
                >
                  <span
                    className="inline-block size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="flex-1 truncate">{s.name}</span>
                  {s.id === currentStage.id && <Check className="h-3 w-3" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {(item.last_contacted_at || item.last_replied_at) && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {item.last_replied_at && (
            <Badge variant="info" className="gap-1 px-1.5">
              <MessageCircle className="h-2.5 w-2.5" />
              {new Date(item.last_replied_at).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
                timeZone: "Asia/Jakarta",
              })}
            </Badge>
          )}
          {item.last_contacted_at && !item.last_replied_at && (
            <Badge variant="neutral" className="gap-1 px-1.5">
              <Mail className="h-2.5 w-2.5" />
              {new Date(item.last_contacted_at).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
                timeZone: "Asia/Jakarta",
              })}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
