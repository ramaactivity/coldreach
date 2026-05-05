"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, Mail, MessageCircle } from "lucide-react";
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
    <div className="flex w-72 shrink-0 flex-col rounded-xl border border-zinc-200/80 bg-zinc-50/40 dark:border-zinc-800/80 dark:bg-zinc-900/40">
      <div className="flex items-center justify-between border-b border-zinc-200/80 px-3 py-2.5 dark:border-zinc-800/80">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: stage.color }}
          />
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {stage.name}
          </span>
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-zinc-700 ring-1 ring-zinc-200/80 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700">
          {items.length}
        </span>
      </div>

      <div
        className="flex flex-col gap-2 overflow-y-auto p-2"
        style={{ maxHeight: "calc(100vh - 220px)" }}
      >
        {visible.length === 0 && (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-white/40 text-xs text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/40">
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
          <p className="px-2 py-1.5 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
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
      await moveContactStage(slug, item.contact_id, stageId);
      router.refresh();
    });
  }

  return (
    <div className="group relative rounded-lg border border-zinc-200/80 bg-white p-3 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md dark:border-zinc-800/80 dark:bg-zinc-900 dark:hover:border-zinc-700">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/w/${slug}/contacts/${item.contact.id}`}
          className="min-w-0 flex-1"
        >
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {fullName}
          </p>
          {item.contact.company && (
            <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {item.contact.company}
              {item.contact.position && ` · ${item.contact.position}`}
            </p>
          )}
        </Link>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            disabled={pending}
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Move to stage"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-48 overflow-hidden rounded-lg border border-zinc-200/80 bg-white py-1 text-xs shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
              <p className="border-b border-zinc-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800">
                Move to
              </p>
              {otherStages.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleMove(s.id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
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
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
              <MessageCircle className="h-2.5 w-2.5" />
              {new Date(item.last_replied_at).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
              })}
            </span>
          )}
          {item.last_contacted_at && !item.last_replied_at && (
            <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              <Mail className="h-2.5 w-2.5" />
              {new Date(item.last_contacted_at).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
