"use client";

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { buildDiffView, formatDiffStats, type DiffBlock, type DiffPart } from "@/lib/utils/diff";
import { cn } from "@/lib/utils";

interface VersionDiffProps {
  /** The older text. */
  before: string;
  /** The newer text. */
  after: string;
  beforeLabel: string;
  afterLabel: string;
  className?: string;
}

const stripTrailingNewline = (text: string) => text.replace(/\n$/, "");

function Part({ part, last }: { part: DiffPart; last: boolean }) {
  const text = last ? stripTrailingNewline(part.text) : part.text;
  if (part.kind === "added") {
    return (
      <ins className="rounded-sm bg-emerald-100 text-emerald-950 no-underline">
        <span className="sr-only">[added: </span>
        {text}
        <span className="sr-only">]</span>
      </ins>
    );
  }
  if (part.kind === "removed") {
    return (
      <del className="rounded-sm bg-red-100 text-red-900 decoration-red-500">
        <span className="sr-only">[removed: </span>
        {text}
        <span className="sr-only">]</span>
      </del>
    );
  }
  return <span>{text}</span>;
}

function Block({ block, expanded, onExpand }: { block: DiffBlock; expanded: boolean; onExpand: () => void }) {
  switch (block.kind) {
    case "same":
      return <div className="text-stone-600">{stripTrailingNewline(block.text)}</div>;
    case "fold":
      return expanded ? (
        <div className="text-stone-600">{stripTrailingNewline(block.text)}</div>
      ) : (
        <button
          type="button"
          onClick={onExpand}
          className="my-1 w-full rounded-md bg-stone-100 py-1 text-center font-sans text-xs text-stone-600 hover:bg-stone-200 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-700"
        >
          Show {block.lines} unchanged {block.lines === 1 ? "line" : "lines"}
        </button>
      );
    case "added":
      return (
        <ins className="block border-l-2 border-emerald-500 bg-emerald-50 pl-2 text-emerald-950 no-underline">
          <span className="sr-only">Added: </span>
          {stripTrailingNewline(block.text)}
        </ins>
      );
    case "removed":
      return (
        <del className="block border-l-2 border-red-400 bg-red-50 pl-2 text-red-900 decoration-red-400">
          <span className="sr-only">Removed: </span>
          {stripTrailingNewline(block.text)}
        </del>
      );
    case "changed":
      return (
        <div className="border-l-2 border-amber-400 pl-2 text-stone-900">
          {block.parts.map((p, i) => (
            <Part key={i} part={p} last={i === block.parts.length - 1} />
          ))}
        </div>
      );
  }
}

/**
 * Readable diff between two texts: edited paragraphs show word-level changes
 * inline, long unchanged stretches fold away. Give it a `key` that changes with
 * the compared pair so expanded folds reset.
 */
export function VersionDiff({ before, after, beforeLabel, afterLabel, className }: VersionDiffProps) {
  const view = useMemo(() => buildDiffView(before, after), [before, after]);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-stone-800">
          {beforeLabel}
          <ArrowRight className="h-3.5 w-3.5 text-stone-500" aria-label="to" />
          {afterLabel}
        </span>
        <span className="text-stone-600">{formatDiffStats(view.stats)}</span>
      </div>

      {view.stats.identical ? (
        <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-stone-600 ring-1 ring-stone-200/70">
          These two texts are identical.
        </p>
      ) : (
        <div
          className="min-h-0 flex-1 overflow-auto rounded-xl bg-white px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap break-words ring-1 ring-stone-200/70"
          aria-label={`Changes from ${beforeLabel} to ${afterLabel}`}
          role="region"
          tabIndex={0}
        >
          <div className="space-y-0.5">
            {view.blocks.map((block, i) => (
              <Block
                key={i}
                block={block}
                expanded={expanded.has(i)}
                onExpand={() => setExpanded((prev) => new Set(prev).add(i))}
              />
            ))}
          </div>
        </div>
      )}

      <p className="flex gap-3 text-[11px] text-stone-600" aria-hidden="true">
        <span>
          <del className="rounded-sm bg-red-100 px-1 text-red-900">removed</del>
        </span>
        <span>
          <ins className="rounded-sm bg-emerald-100 px-1 text-emerald-950 no-underline">added</ins>
        </span>
        <span className="border-l-2 border-amber-400 pl-1.5">edited paragraph</span>
      </p>
    </div>
  );
}
