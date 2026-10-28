"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { NoteWithAnchor, Persona } from "@/types";
import type { NoteGroups } from "@/hooks/useNotes";
import { LensChips, PRIORITY_STYLES, lensChipsForNote } from "./lens-chips";

interface NotesListProps {
  groups: NoteGroups;
  personas: Persona[];
  activeId: number | null;
  loading: boolean;
  error: string | null;
  onSelect: (id: number) => void;
  /** Offered in the empty state. */
  onConsult?: () => void;
  /** Reload the notes after a failed load. */
  onRetry?: () => void;
}

function NoteRow({
  note,
  personas,
  active,
  onSelect,
}: {
  note: NoteWithAnchor;
  personas: Persona[];
  active: boolean;
  onSelect: () => void;
}) {
  const priority = PRIORITY_STYLES[note.priority];
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={`w-full text-left rounded-xl px-3 py-2.5 space-y-1.5 transition-colors ${
          active ? "bg-white shadow-sm" : "hover:bg-white/70"
        }`}
      >
        <span className="flex items-start gap-2">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${priority.dot}`} aria-hidden="true" />
          <span className="sr-only">{priority.label}.</span>
          <span className="text-xs leading-snug text-stone-800 line-clamp-3">{note.issue}</span>
        </span>
        <span className="block pl-3.5 text-[11px] italic text-stone-500 truncate">“{note.anchorText}”</span>
        <span className="block pl-3.5">
          <LensChips chips={lensChipsForNote(note, personas)} compact />
        </span>
      </button>
    </li>
  );
}

function Group({
  title,
  hint,
  notes,
  personas,
  activeId,
  onSelect,
  defaultOpen,
}: {
  title: string;
  hint?: string;
  notes: NoteWithAnchor[];
  personas: Persona[];
  activeId: number | null;
  onSelect: (id: number) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (notes.length === 0) return null;
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <section className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-1 py-1 text-[10px] font-bold tracking-widest uppercase text-stone-600 hover:text-stone-900"
        style={{ fontFamily: "var(--font-inter)" }}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        <span>{title}</span>
        <span className="ml-auto font-semibold text-stone-500">{notes.length}</span>
      </button>
      {open && hint && <p className="px-1 text-[11px] text-stone-500">{hint}</p>}
      {open && (
        <ul className="space-y-0.5">
          {notes.map((n) => (
            <NoteRow key={n.id} note={n} personas={personas} active={n.id === activeId} onSelect={() => onSelect(n.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** A failed notes load; when notes are already shown, they stay and are marked possibly out of date. */
function LoadError({ error, stale, onRetry }: { error: string; stale: boolean; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800 space-y-1">
      <p>
        {stale ? "Couldn’t refresh notes" : "Couldn’t load notes"}: {error}
      </p>
      {stale && <p>The notes below may be out of date.</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="font-semibold text-rose-900 underline underline-offset-2 hover:text-rose-950"
        >
          Try again
        </button>
      )}
    </div>
  );
}

/** Council notes grouped by what the writer has done with them. */
export function NotesList({ groups, personas, activeId, loading, error, onSelect, onConsult, onRetry }: NotesListProps) {
  const total = groups.open.length + groups.addressed.length + groups.dismissed.length;

  if (error && total === 0) {
    return <LoadError error={error} stale={false} onRetry={onRetry} />;
  }
  if (loading && total === 0) {
    return <p className="px-1 text-xs text-stone-500">Loading notes…</p>;
  }
  if (total === 0) {
    return (
      <div className="rounded-xl bg-white/70 px-3 py-3 space-y-2">
        <p className="text-xs text-stone-600 leading-relaxed">
          No notes yet. The council reads your draft through each lens and marks the passages that aren&apos;t
          working yet. Your words stay yours.
        </p>
        {onConsult && (
          <button
            type="button"
            onClick={onConsult}
            className="text-xs font-semibold text-stone-800 underline underline-offset-4 hover:text-stone-950"
          >
            Consult the council
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <LoadError error={error} stale onRetry={onRetry} />}
      <Group title="Open" notes={groups.open} personas={personas} activeId={activeId} onSelect={onSelect} defaultOpen />
      <Group
        title="Addressed since last pass"
        hint="Their passage changed or you marked them addressed. The next council run checks them again."
        notes={groups.addressed}
        personas={personas}
        activeId={activeId}
        onSelect={onSelect}
        defaultOpen
      />
      <Group
        title="Dismissed"
        notes={groups.dismissed}
        personas={personas}
        activeId={activeId}
        onSelect={onSelect}
        defaultOpen={false}
      />
    </div>
  );
}
