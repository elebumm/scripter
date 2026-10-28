"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, LocateFixed, NotebookPen, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Beat, BeatStatus } from "@/types/review";
import type { BeatPatch } from "@/hooks/useBeats";
import { InlineField } from "./InlineField";
import { formatSeconds, parseDuration } from "./beat-utils";
import { FONT_CABINET, FONT_INTER, btnIcon, btnText, focusRing } from "./styles";

const STATUS_OPTIONS: Array<{ value: BeatStatus; label: string }> = [
  { value: "planned", label: "Planned" },
  { value: "drafted", label: "Drafted" },
  { value: "cut", label: "Cut" },
];

const STATUS_STYLE: Record<BeatStatus, string> = {
  planned: "bg-stone-100 text-stone-600",
  drafted: "bg-emerald-50 text-emerald-800",
  cut: "bg-stone-100 text-stone-600",
};

interface BeatCardProps {
  beat: Beat;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  /** Where the beat's saved anchor stands in the current draft. */
  anchor: "none" | "found" | "changed";
  onUpdate: (patch: BeatPatch) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onJump: () => void;
}

export function BeatCard({ beat, index, isFirst, isLast, anchor, onUpdate, onMove, onDelete, onJump }: BeatCardProps) {
  const n = index + 1;
  const [notesOpen, setNotesOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [targetDraft, setTargetDraft] = useState<string | null>(null);
  const hasNotes = beat.writerNotes.trim().length > 0;
  const showNotes = notesOpen || hasNotes;
  const isCut = beat.status === "cut";

  const targetShown = targetDraft ?? (beat.targetSeconds ? formatSeconds(beat.targetSeconds) : "");
  const targetInvalid = targetDraft !== null && parseDuration(targetDraft) === undefined;

  const commitTarget = () => {
    if (targetDraft === null) return;
    const parsed = parseDuration(targetDraft);
    if (parsed === undefined) return; // keep the draft so the writer can fix it
    setTargetDraft(null);
    if (parsed !== beat.targetSeconds) onUpdate({ targetSeconds: parsed });
  };

  return (
    // A cut beat reads as cut through its struck-through name and muted purpose,
    // not whole-card opacity, so its text keeps AA contrast.
    <li className="group rounded-xl bg-white p-3 ring-1 ring-stone-200/80">
      <div className="flex items-start gap-1.5">
        <span
          className="mt-1.5 w-5 shrink-0 text-[10px] font-bold tabular-nums text-stone-500"
          style={FONT_INTER}
          aria-hidden
        >
          {String(n).padStart(2, "0")}
        </span>

        <div className="min-w-0 flex-1">
          <InlineField
            value={beat.title}
            onCommit={(title) => onUpdate({ title })}
            label={`Beat ${n} title`}
            placeholder="Name this beat"
            required
            maxLength={200}
            className={cn("text-sm font-bold text-stone-800", isCut && "line-through")}
            style={FONT_CABINET}
          />
          <InlineField
            value={beat.purpose}
            onCommit={(purpose) => onUpdate({ purpose })}
            label={`What beat ${n} must do`}
            placeholder="What must this part do for the viewer?"
            multiline
            enterCommits
            maxLength={2000}
            className={cn("mt-0.5 text-xs leading-relaxed", isCut ? "text-stone-500" : "text-stone-600")}
          />
        </div>

        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            className={btnIcon}
            onClick={() => onMove(-1)}
            disabled={isFirst}
            aria-label={`Move beat ${n} up`}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={btnIcon}
            onClick={() => onMove(1)}
            disabled={isLast}
            aria-label={`Move beat ${n} down`}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showNotes && (
        <div className="ml-6 mt-1.5 border-l-2 border-stone-200 pl-2">
          <InlineField
            value={beat.writerNotes}
            onCommit={(writerNotes) => onUpdate({ writerNotes })}
            label={`Your notes for beat ${n}`}
            placeholder="Your notes: sources, shots, ideas…"
            multiline
            autoFocus={notesOpen && !hasNotes}
            maxLength={10000}
            className="text-xs italic leading-relaxed text-stone-600"
          />
        </div>
      )}

      <div className="ml-6 mt-2 flex flex-wrap items-center gap-1.5">
        <label className="sr-only" htmlFor={`beat-${beat.id}-status`}>
          Status of beat {n}
        </label>
        <span className="relative inline-flex">
          <select
            id={`beat-${beat.id}-status`}
            value={beat.status}
            onChange={(e) => onUpdate({ status: e.target.value as BeatStatus })}
            className={cn(
              "h-6 cursor-pointer appearance-none rounded-full pr-5 pl-2 text-[10px] font-semibold tracking-wide uppercase",
              STATUS_STYLE[beat.status],
              focusRing
            )}
            style={FONT_INTER}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1.5 right-1.5 h-3 w-3 opacity-60" aria-hidden />
        </span>

        <input
          type="text"
          value={targetShown}
          placeholder="0:00"
          onChange={(e) => setTargetDraft(e.target.value)}
          onBlur={commitTarget}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTarget();
            } else if (e.key === "Escape" && targetDraft !== null) {
              e.preventDefault();
              e.stopPropagation();
              setTargetDraft(null);
            }
          }}
          aria-label={`Target length of beat ${n} (minutes:seconds)`}
          aria-invalid={targetInvalid || undefined}
          title={targetInvalid ? "Use m:ss, seconds or 2m30s (up to 2 hours)" : "Target length (m:ss)"}
          className={cn(
            "h-6 w-14 rounded-full bg-stone-100 px-2 text-center text-[11px] tabular-nums text-stone-700 placeholder:text-stone-600",
            targetInvalid && "bg-red-50 text-red-700 ring-1 ring-red-300",
            focusRing
          )}
        />

        {beat.source === "ai" && (
          <span
            className="text-[10px] font-semibold tracking-wide text-stone-500 uppercase"
            style={FONT_INTER}
            title="Suggested from your brief. Edit it freely: it's your plan."
          >
            Suggested
          </span>
        )}

        <span className="flex-1" />

        {anchor === "found" && (
          <button type="button" className={btnText} onClick={onJump} aria-label={`Show where beat ${n} happens in the draft`}>
            <LocateFixed className="h-3 w-3" />
            In draft
          </button>
        )}
        {anchor === "changed" && (
          <span
            className="text-[10px] text-stone-500"
            title="The passage the last check found has changed. Check the draft again to find this beat."
          >
            Passage changed
          </span>
        )}

        {!hasNotes && (
          <button
            type="button"
            className={cn(btnIcon, "h-6 w-6", notesOpen && "bg-stone-100 text-stone-800")}
            onClick={() => setNotesOpen((o) => !o)}
            aria-label={`Notes for beat ${n}`}
            aria-expanded={notesOpen}
            title="Your notes for this beat"
          >
            <NotebookPen className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          className={cn(btnIcon, "h-6 w-6 hover:text-red-700")}
          onClick={() => setConfirmDelete(true)}
          aria-label={`Delete beat ${n}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {confirmDelete && (
        <div
          role="group"
          aria-label={`Delete beat ${n}?`}
          className="ml-6 mt-2 flex items-center gap-2 rounded-lg bg-red-50 px-2 py-1.5"
        >
          <span className="flex-1 text-[11px] text-red-800">Delete this beat?</span>
          <button
            type="button"
            className={cn(btnText, "text-red-700 hover:bg-red-100 hover:text-red-900")}
            onClick={() => {
              setConfirmDelete(false);
              onDelete();
            }}
          >
            Delete
          </button>
          <button type="button" className={btnText} onClick={() => setConfirmDelete(false)} autoFocus>
            Keep
          </button>
        </div>
      )}
    </li>
  );
}
