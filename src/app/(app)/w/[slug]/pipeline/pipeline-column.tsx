"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
    <div className="flex w-72 shrink-0 flex-col rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: stage.color }}
          />
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {stage.name}
          </span>
        </div>
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          {items.length}
        </span>
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 220px)" }}>
        {visible.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-zinc-400">
            Kosong di stage ini
          </p>
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
          <p className="px-2 py-2 text-center text-xs text-zinc-500">
            +{items.length - maxCards} more (filter or paginate later)
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
    <div className="rounded-md border border-zinc-200 bg-white p-3 text-sm transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/w/${slug}/contacts/${item.contact.id}`}
            className="block min-w-0 truncate font-medium text-zinc-900 hover:underline dark:text-zinc-100"
          >
            {fullName}
          </Link>
          {item.contact.company && (
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {item.contact.company}
              {item.contact.position && ` · ${item.contact.position}`}
            </p>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            disabled={pending}
            className="rounded p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Move to stage"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12h14M12 5l7 7-7 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-md border border-zinc-200 bg-white py-1 text-xs shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
              <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Move to
              </p>
              {otherStages.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleMove(s.id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {(item.last_contacted_at || item.last_replied_at) && (
        <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-zinc-500">
          {item.last_replied_at && (
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">
              ↩ replied {new Date(item.last_replied_at).toLocaleDateString("id-ID")}
            </span>
          )}
          {item.last_contacted_at && !item.last_replied_at && (
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
              📧 sent {new Date(item.last_contacted_at).toLocaleDateString("id-ID")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
