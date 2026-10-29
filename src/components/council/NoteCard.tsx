"use client";

import { Check, CircleHelp, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NoteWithAnchor, Persona } from "@/types";
import { LensChips, PRIORITY_STYLES, categoryLabel, lensChipsForNote } from "./lens-chips";

interface NoteCardProps {
  note: NoteWithAnchor;
  personas: Persona[];
  onAddress: () => void;
  onDismiss: () => void;
  onReopen: () => void;
  onClose: () => void;
}

/**
 * A council note on the writer's own passage: what isn't working, why, and
 * optionally a question. It never offers wording; the only actions are about
 * the note itself.
 */
export function NoteCard({ note, personas, onAddress, onDismiss, onReopen, onClose }: NoteCardProps) {
  const priority = PRIORITY_STYLES[note.priority];
  const chips = lensChipsForNote(note, personas);

  return (
    <article
      className="w-[22.5rem] max-w-full rounded-2xl border border-stone-200 bg-white/95 p-4 space-y-3 text-stone-800 shadow-lg shadow-stone-900/5 backdrop-blur-xl"
      style={{ fontFamily: "var(--font-switzer)" }}
    >
      <header className="flex items-start gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 flex-1 min-w-0">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${priority.text}`}>
            <span className={`h-2 w-2 rounded-full ${priority.dot}`} aria-hidden="true" />
            {priority.label}
          </span>
          <span className="text-[11px] text-stone-500">· {categoryLabel(note.category)}</span>
          {note.status !== "open" && (
            <span className="text-[11px] text-stone-500">· {note.status === "addressed" ? "Addressed" : "Dismissed"}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-stone-500 hover:text-stone-800 -mr-1 -mt-1"
          onClick={onClose}
          aria-label="Close note"
        >
          <X />
        </Button>
      </header>

      {note.isStale && note.status === "open" && (
        <p className="rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600">
          This passage has changed since the council read it. If you dealt with the note, mark it addressed.
        </p>
      )}

      <blockquote className="border-l-2 border-stone-300 pl-3 text-xs italic text-stone-600 line-clamp-3">
        {note.anchorText}
      </blockquote>

      <div className="space-y-2">
        <p className="text-sm leading-relaxed text-stone-900">{note.issue}</p>
        {note.why && <p className="text-xs leading-relaxed text-stone-600">{note.why}</p>}
        {note.question && (
          <p className="flex gap-1.5 text-xs leading-relaxed text-stone-700">
            <CircleHelp className="h-3.5 w-3.5 mt-0.5 shrink-0 text-stone-500" aria-hidden="true" />
            <span>{note.question}</span>
          </p>
        )}
      </div>

      <LensChips chips={chips} />

      <div className="flex gap-2 pt-1">
        {note.status === "open" ? (
          <>
            <Button
              size="sm"
              className="h-7 text-xs gap-1.5 rounded-lg bg-stone-800 text-white hover:bg-stone-900"
              onClick={onAddress}
            >
              <Check className="h-3 w-3" />
              Mark addressed
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5 rounded-lg border-stone-300 text-stone-700 hover:text-stone-900"
              onClick={onDismiss}
            >
              <X className="h-3 w-3" />
              Dismiss
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 rounded-lg border-stone-300 text-stone-700 hover:text-stone-900"
            onClick={onReopen}
          >
            <RotateCcw className="h-3 w-3" />
            Reopen
          </Button>
        )}
      </div>
    </article>
  );
}
