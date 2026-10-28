"use client";

import type { FactNote } from "@/types/review";
import { Button } from "@/components/ui/button";
import { VerdictBadge } from "./FactNoteCard";
import { describeFactRun, groupFactNotes, truncate, type FactRunCounts } from "./verdicts";

interface FactNotesListProps {
  notes: FactNote[];
  /** Notes whose claim can no longer be found in the current draft. */
  staleIds: Set<number>;
  onSelect: (id: number) => void;
  /** The saved notes are still loading. */
  loading?: boolean;
  /** Why loading the saved notes failed: the list is unknown, not empty. */
  loadError?: string | null;
  onRetry?: () => void;
  /** Counts of a fact-check finished on this page; says what it found even when it kept nothing. */
  lastRun?: FactRunCounts | null;
}

function NoteRow({ note, stale, onSelect }: { note: FactNote; stale: boolean; onSelect: (id: number) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(note.id)}
        className="w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-600"
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <VerdictBadge verdict={note.verdict} />
          {stale && (
            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
              Not in draft
            </span>
          )}
        </span>
        <span className={`mt-1.5 block text-sm leading-snug ${stale ? "text-stone-500" : "text-stone-800"}`}>
          “{truncate(note.claimText, 120)}”
        </span>
      </button>
    </li>
  );
}

function Group({
  title,
  notes,
  staleIds,
  onSelect,
}: {
  title: string;
  notes: FactNote[];
  staleIds: Set<number>;
  onSelect: (id: number) => void;
}) {
  if (notes.length === 0) return null;
  const id = `fact-group-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section aria-labelledby={id}>
      <h4
        id={id}
        className="px-3 text-[11px] font-semibold uppercase tracking-wider text-stone-600"
        style={{ fontFamily: "var(--font-inter)" }}
      >
        {title} <span className="text-stone-500">({notes.length})</span>
      </h4>
      <ul className="mt-1 space-y-0.5">
        {notes.map((n) => (
          <NoteRow key={n.id} note={n} stale={staleIds.has(n.id)} onSelect={onSelect} />
        ))}
      </ul>
    </section>
  );
}

/** Sidebar list of fact notes, most urgent first. Selecting one opens its card. */
export function FactNotesList({
  notes,
  staleIds,
  onSelect,
  loading = false,
  loadError = null,
  onRetry,
  lastRun = null,
}: FactNotesListProps) {
  const status = (
    <>
      {loadError && (
        <div role="alert" className="space-y-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <p>Couldn&apos;t load your saved fact notes: {loadError}</p>
          {onRetry && (
            <Button size="sm" variant="outline" className="h-7 border-rose-200 text-xs text-rose-800" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      )}
      {lastRun && <p className="px-3 text-xs leading-relaxed text-stone-600">{describeFactRun(lastRun)}</p>}
    </>
  );

  if (notes.length === 0) {
    return (
      <div className="space-y-2" style={{ fontFamily: "var(--font-switzer)" }}>
        {status}
        {!loadError &&
          !lastRun &&
          (loading ? (
            <p className="px-3 text-sm text-stone-500">Loading fact notes…</p>
          ) : (
            <p className="px-3 text-sm text-stone-500">
              No fact notes yet. A fact-check saves your draft as a version, searches the web for its claims and reports
              what the sources say.
            </p>
          ))}
      </div>
    );
  }

  const groups = groupFactNotes(notes);

  return (
    <div className="space-y-4" style={{ fontFamily: "var(--font-switzer)" }}>
      {status}
      {groups.toReview.length === 0 && (
        <p className="px-3 text-sm text-stone-600">Nothing left to review.</p>
      )}
      <Group title="To review" notes={groups.toReview} staleIds={staleIds} onSelect={onSelect} />
      <Group title="Verified" notes={groups.verified} staleIds={staleIds} onSelect={onSelect} />
      <Group title="Acknowledged" notes={groups.acknowledged} staleIds={staleIds} onSelect={onSelect} />
      {groups.dismissed.length > 0 && (
        <details>
          <summary className="cursor-pointer rounded-md px-3 text-[11px] font-semibold uppercase tracking-wider text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-600" style={{ fontFamily: "var(--font-inter)" }}>
            Dismissed <span className="text-stone-500">({groups.dismissed.length})</span>
          </summary>
          <ul className="mt-1 space-y-0.5">
            {groups.dismissed.map((n) => (
              <NoteRow key={n.id} note={n} stale={staleIds.has(n.id)} onSelect={onSelect} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
