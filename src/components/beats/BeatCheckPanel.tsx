"use client";

import { useState } from "react";
import { Check, CircleDashed, Loader2, LocateFixed, Plus, RotateCcw, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Beat } from "@/types/review";
import type { CheckState } from "@/hooks/useBeats";
import { coverageRows, isOnSheet, missingItems } from "./beat-utils";
import { FONT_CABINET, btnIcon, btnText, focusRing, labelCaps } from "./styles";

interface BeatCheckPanelProps {
  check: CheckState;
  beats: Beat[];
  /** Is this anchor still in the current draft? */
  anchorInDraft: (anchorText: string) => boolean;
  onJump: (anchorText: string) => void;
  onAddMissing: (item: { title: string; purpose: string }) => Promise<unknown>;
  onStop: () => void;
  onDismiss: () => void;
  onRetry: () => void;
}

/** Result of checking the saved draft against the beats: diagnosis only. */
export function BeatCheckPanel({ check, beats, anchorInDraft, onJump, onAddMissing, onStop, onDismiss, onRetry }: BeatCheckPanelProps) {
  const [pending, setPending] = useState<number | null>(null);
  const busy = check.status === "saving" || check.status === "checking";
  const data = check.result ?? check.partial;
  const rows = coverageRows(beats, data);
  const covered = rows.filter((r) => r.covered);
  const notFound = rows.filter((r) => !r.covered);
  const missing = check.status === "done" ? missingItems(check.result) : [];

  const addMissing = async (item: { index: number; title: string; purpose: string }) => {
    setPending(item.index);
    try {
      await onAddMissing(item);
    } finally {
      setPending(null);
    }
  };

  return (
    <section aria-label="Draft check" aria-busy={busy} className="rounded-xl bg-white p-3 ring-1 ring-stone-200">
      <div className="flex items-center justify-between gap-2">
        <h4 className={labelCaps}>Draft check</h4>
        {busy ? (
          <button type="button" className={btnText} onClick={onStop} aria-label="Stop the draft check">
            <Square className="h-3 w-3" />
            Stop
          </button>
        ) : (
          <button type="button" className={cn(btnIcon, "h-6 w-6")} onClick={onDismiss} aria-label="Dismiss the draft check">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div aria-live="polite" className="mt-1 text-[11px] leading-snug text-stone-500">
        {check.status === "saving" && (
          <p className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving a version of your draft…
          </p>
        )}
        {check.status === "checking" && (
          <p className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Reading the draft against {beats.length} {beats.length === 1 ? "beat" : "beats"}
            {rows.length > 0 ? ` (${rows.length} done)` : ""}…
          </p>
        )}
        {check.status === "done" && (
          <p>
            {covered.length} of {rows.length} {rows.length === 1 ? "beat" : "beats"} found in the saved draft.
          </p>
        )}
        {check.status === "stopped" && <p>Check stopped.</p>}
      </div>

      {check.status === "error" && (
        <div role="alert" className="mt-2 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] text-red-800">
          <p>Couldn&apos;t check the draft: {check.error}</p>
          <button type="button" className={cn(btnText, "mt-1 text-red-800 hover:bg-red-100")} onClick={onRetry}>
            <RotateCcw className="h-3 w-3" />
            Try again
          </button>
        </div>
      )}
      {check.status === "stopped" && (
        <button type="button" className={cn(btnText, "mt-1")} onClick={onRetry}>
          <RotateCcw className="h-3 w-3" />
          Check again
        </button>
      )}

      {covered.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-label="Beats found in the draft">
          {covered.map((row) => {
            const anchor = row.anchorText;
            const canJump = !!anchor && anchorInDraft(anchor);
            return (
              <li key={row.beat.id}>
                <button
                  type="button"
                  disabled={!canJump}
                  onClick={() => anchor && onJump(anchor)}
                  className={cn(
                    "group flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left transition-colors enabled:hover:bg-stone-50",
                    focusRing
                  )}
                  title={canJump ? "Show this passage in the editor" : "This passage has changed since the check"}
                >
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-xs font-bold text-stone-800" style={FONT_CABINET}>
                      {row.beat.title}
                      {canJump && <LocateFixed className="h-3 w-3 text-stone-400 group-hover:text-stone-700" aria-hidden />}
                    </span>
                    {row.comment && <span className="block text-[11px] leading-snug text-stone-600">{row.comment}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {notFound.length > 0 && (
        <div className="mt-3">
          <p className={labelCaps}>Not in the draft yet</p>
          <ul className="mt-1.5 space-y-1.5">
            {notFound.map((row) => (
              <li key={row.beat.id} className="flex items-start gap-2 px-1.5">
                <CircleDashed className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-stone-800" style={FONT_CABINET}>
                    {row.beat.title}
                  </span>
                  {row.comment && <span className="block text-[11px] leading-snug text-stone-600">{row.comment}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {missing.length > 0 && (
        <div className="mt-3 rounded-lg border border-dashed border-stone-300 bg-stone-50 p-2.5">
          <p className={labelCaps}>The draft may also need</p>
          <p className="mt-0.5 text-[11px] text-stone-500">Proposed beats, not script text.</p>
          <ul className="mt-2 space-y-2">
            {missing.map((item) => (
              <li key={item.index} className="flex items-start gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-stone-800" style={FONT_CABINET}>
                    {item.title}
                  </span>
                  {item.purpose && <span className="block text-[11px] leading-snug text-stone-600">{item.purpose}</span>}
                </span>
                {isOnSheet(item.title, beats) ? (
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                    <Check className="h-3 w-3" />
                    Added
                  </span>
                ) : (
                  <button
                    type="button"
                    className={btnText}
                    onClick={() => addMissing(item)}
                    disabled={pending !== null}
                    aria-label={`Add beat: ${item.title}`}
                  >
                    {pending === item.index ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    Add
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
