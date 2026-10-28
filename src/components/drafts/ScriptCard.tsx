"use client";

import Link from "next/link";
import { Archive, ArchiveRestore, Download, ExternalLink, MoreVertical, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ScriptSummary } from "@/lib/api";
import { formatRelative } from "@/lib/utils/dates";
import { estimateRuntimeSeconds, formatRuntime } from "@/lib/utils/reading-time";
import { ScriptIcon } from "./ScriptIcon";
import { displayTitle, formatScore, formatWords } from "./drafts-utils";

interface ScriptCardProps {
  script: ScriptSummary;
  /** Reference time for "edited 3 days ago" (never read the clock in render). */
  now: number;
  wordsPerMinute: number;
  archived: boolean;
  onOpen: () => void;
  onExport: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
}

export function ScriptCard({
  script,
  now,
  wordsPerMinute,
  archived,
  onOpen,
  onExport,
  onArchive,
  onUnarchive,
  onDelete,
}: ScriptCardProps) {
  const title = displayTitle(script.title, script.heading);
  const edited = formatRelative(script.updatedAt, new Date(now));
  const score = formatScore(script.lastScore);
  const words = script.spokenWords ?? 0;
  const runtime = words > 0 ? `~${formatRuntime(estimateRuntimeSeconds(words, wordsPerMinute))}` : null;

  return (
    <article className="group relative flex flex-col rounded-2xl has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-stone-600 has-[a:focus-visible]:ring-offset-4 has-[a:focus-visible]:ring-offset-[#f9f9f9]">
      <div
        className={`h-40 rounded-2xl overflow-hidden border border-stone-200/80 transition-shadow group-hover:shadow-md ${
          archived ? "opacity-70" : ""
        }`}
        aria-hidden="true"
      >
        <ScriptIcon icon={script.icon} title={title} size={52} />
      </div>

      <div className="flex items-start gap-2 mt-3 px-1">
        <div className="min-w-0 flex-1">
          <h3
            className="text-sm font-bold text-stone-800 truncate"
            style={{ fontFamily: "var(--font-cabinet)" }}
          >
            {/* Stretched link: the whole card opens the script. */}
            <Link
              href={`/script/${script.id}`}
              className="outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']"
            >
              {title}
            </Link>
          </h3>
          <p
            className="text-[11px] text-stone-500 mt-0.5"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {edited ? `Edited ${edited}` : "Never edited"}
          </p>
          <p
            className="text-[11px] text-stone-500"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {formatWords(words)}
            {runtime && <span title={`Spoken runtime at ${wordsPerMinute} words per minute`}> · {runtime}</span>}
          </p>
        </div>

        {score && (
          <span
            className="shrink-0 mt-0.5 rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-stone-700 tabular-nums"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            <span className="sr-only">Latest council score: </span>
            {score}
            <span className="font-normal text-stone-500">/10</span>
          </span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`More actions for ${title}`}
              className="relative z-10 -mr-1 shrink-0 rounded-md p-1 text-stone-500 hover:text-stone-800 hover:bg-stone-200/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-600"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={onOpen}>
              <ExternalLink className="h-4 w-4" />
              Open
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onExport}>
              <Download className="h-4 w-4" />
              Export markdown
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {archived ? (
              <>
                <DropdownMenuItem onSelect={onUnarchive}>
                  <ArchiveRestore className="h-4 w-4" />
                  Unarchive
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  <Trash2 className="h-4 w-4" />
                  Delete permanently
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onSelect={onArchive}>
                <Archive className="h-4 w-4" />
                Archive
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
