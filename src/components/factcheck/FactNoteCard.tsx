"use client";

import { AlertTriangle, Check, ExternalLink, EyeOff, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FactNote } from "@/types/review";
import { STATUS_LABELS, safeHref, sourceLabel, verdictInfo } from "./verdicts";

interface FactNoteCardProps {
  note: FactNote;
  /** The claim can no longer be found in the current draft. */
  isStale: boolean;
  onAcknowledge: () => void;
  onDismiss: () => void;
  /** Back to open (pending), e.g. after a misclicked Dismiss. */
  onReopen: () => void;
  onClose: () => void;
  className?: string;
}

export function VerdictBadge({ verdict, className }: { verdict: string; className?: string }) {
  const info = verdictInfo(verdict);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide",
        info.badgeClass,
        className
      )}
      title={info.description}
      style={{ fontFamily: "var(--font-inter)" }}
    >
      {info.label}
    </span>
  );
}

/**
 * One fact note: the writer's claim, the verdict and what the sources say.
 * It never proposes replacement wording; the writer decides what to change.
 */
export function FactNoteCard({
  note,
  isStale,
  onAcknowledge,
  onDismiss,
  onReopen,
  onClose,
  className,
}: FactNoteCardProps) {
  const info = verdictInfo(note.verdict);
  const titleId = `fact-note-${note.id}-title`;
  const sources = (note.sources ?? [])
    .map((s) => ({ href: safeHref(s.url), label: sourceLabel(s), url: s.url }))
    .filter((s): s is { href: string; label: string; url: string } => s.href !== null);

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "w-80 max-w-full rounded-2xl border border-stone-200 bg-white p-4 shadow-lg shadow-stone-900/5 text-stone-800",
        className
      )}
      style={{ fontFamily: "var(--font-switzer)" }}
    >
      <header className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h3 id={titleId} className="sr-only">
            Fact note: {info.label}
          </h3>
          <VerdictBadge verdict={note.verdict} />
          {note.category && (
            <span className="text-[11px] uppercase tracking-wider text-stone-500" style={{ fontFamily: "var(--font-inter)" }}>
              {note.category}
            </span>
          )}
          {note.status !== "pending" && (
            <span className="text-[11px] text-stone-500">· {STATUS_LABELS[note.status]}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close fact note"
          className="-mr-1 -mt-1 rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-600"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <blockquote className="mt-3 border-l-2 border-amber-400 pl-3 text-sm italic text-stone-700">
        “{note.claimText}”
      </blockquote>

      {isStale && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          This claim no longer appears in your draft. The note refers to the version that was checked.
        </p>
      )}

      <div className="mt-3">
        <p
          className="text-[11px] font-semibold uppercase tracking-wider text-stone-600"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          What the sources say
        </p>
        <p className="mt-1 text-sm leading-relaxed text-stone-800">
          {note.explanation || <span className="text-stone-500">No explanation was returned.</span>}
        </p>
      </div>

      <div className="mt-3">
        <p
          className="text-[11px] font-semibold uppercase tracking-wider text-stone-600"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          Sources
        </p>
        {sources.length > 0 ? (
          <ul className="mt-1 space-y-1">
            {sources.map((s, i) => (
              <li key={`${s.href}-${i}`}>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.url}
                  className="inline-flex max-w-full items-center gap-1 rounded text-sm text-stone-800 underline decoration-stone-300 underline-offset-2 hover:decoration-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-600"
                >
                  <span className="truncate">{s.label}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-stone-500" aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-stone-500">No source links were found for this claim.</p>
        )}
      </div>

      <footer className="mt-4 flex flex-wrap items-center gap-2">
        {note.status !== "pending" && (
          <Button size="sm" variant="outline" onClick={onReopen}>
            <RotateCcw aria-hidden="true" />
            Reopen
          </Button>
        )}
        {note.status !== "acknowledged" && (
          <Button size="sm" variant="outline" onClick={onAcknowledge}>
            <Check aria-hidden="true" />
            Acknowledge
          </Button>
        )}
        {note.status !== "dismissed" && (
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            <EyeOff aria-hidden="true" />
            Dismiss
          </Button>
        )}
      </footer>
    </section>
  );
}
