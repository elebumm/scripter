"use client";

import { useState } from "react";
import { Check, Loader2, Plus, RotateCcw, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Beat } from "@/types/review";
import type { SuggestState } from "@/hooks/useBeats";
import { formatSeconds, isOnSheet, proposalItems, replaceableAiBeats, type ProposalItem } from "./beat-utils";
import { FONT_CABINET, btnIcon, btnPrimary, btnSecondary, btnText, labelCaps } from "./styles";

interface BeatProposalProps {
  suggestion: SuggestState;
  beats: Beat[];
  onAdd: (item: ProposalItem) => Promise<unknown>;
  /** Replace planned AI beats with these items; resolves true on success. */
  onUseAll: (items: ProposalItem[]) => Promise<boolean>;
  onStop: () => void;
  onDismiss: () => void;
  onRetry: () => void;
}

/** A streamed beat proposal: a plan to write toward, never script text. */
export function BeatProposal({ suggestion, beats, onAdd, onUseAll, onStop, onDismiss, onRetry }: BeatProposalProps) {
  const [pending, setPending] = useState<number | "all" | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const streaming = suggestion.status === "streaming";
  // Once stopped or failed, the half-written last beat is left out.
  const items = proposalItems(suggestion.proposal, suggestion.status !== "done").filter((i) => streaming || i.settled);
  const settled = items.filter((i) => i.settled);
  const toReplace = replaceableAiBeats(beats);
  const replaceable = toReplace.length;
  const rationale = suggestion.proposal?.rationale?.trim();

  const add = async (item: ProposalItem) => {
    setPending(item.index);
    try {
      await onAdd(item);
    } finally {
      setPending(null);
    }
  };

  const adoptAll = async () => {
    if (replaceable > 0 && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    setConfirmReplace(false);
    setPending("all");
    try {
      await onUseAll(settled);
    } finally {
      setPending(null);
    }
  };

  return (
    <section
      aria-label="Proposed beats"
      aria-busy={streaming}
      className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className={labelCaps}>Proposed plan</h4>
        {streaming ? (
          <button type="button" className={btnText} onClick={onStop} aria-label="Stop suggesting beats">
            <Square className="h-3 w-3" />
            Stop
          </button>
        ) : (
          <button type="button" className={cn(btnIcon, "h-6 w-6")} onClick={onDismiss} aria-label="Dismiss the proposal">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-stone-500">
        A structure to write toward, not script text. Each beat says what a part must do; the words stay yours.
      </p>

      {rationale && <p className="mt-2 text-xs leading-relaxed text-stone-600">{rationale}</p>}

      {items.length > 0 && (
        <ol className="mt-3 space-y-2">
          {items.map((item) => {
            const onSheet = isOnSheet(item.title, beats);
            return (
              <li key={item.index} className={cn("flex items-start gap-2", !item.settled && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-stone-800" style={FONT_CABINET}>
                    {item.title}
                    {item.targetSeconds ? (
                      <span className="ml-1.5 text-[10px] font-semibold tabular-nums text-stone-500">
                        ~{formatSeconds(item.targetSeconds)}
                      </span>
                    ) : null}
                  </p>
                  {item.purpose && <p className="text-xs leading-snug text-stone-600">{item.purpose}</p>}
                </div>
                {item.settled &&
                  (onSheet ? (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                      <Check className="h-3 w-3" />
                      Added
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={btnText}
                      onClick={() => add(item)}
                      disabled={pending !== null}
                      aria-label={`Add beat: ${item.title}`}
                    >
                      {pending === item.index ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      Add
                    </button>
                  ))}
              </li>
            );
          })}
        </ol>
      )}

      <div aria-live="polite" className="text-[11px] text-stone-500">
        {streaming && (
          <p className="mt-3 inline-flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            {items.length === 0 ? "Reading your brief…" : `Planning beat ${items.length}…`}
          </p>
        )}
        {suggestion.status === "stopped" && <p className="mt-3">Stopped. Unfinished beats were left out.</p>}
      </div>

      {suggestion.status === "error" && (
        <div role="alert" className="mt-3 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] text-red-800">
          <p>Couldn&apos;t suggest beats: {suggestion.error}</p>
          <button type="button" className={cn(btnText, "mt-1 text-red-800 hover:bg-red-100")} onClick={onRetry}>
            <RotateCcw className="h-3 w-3" />
            Try again
          </button>
        </div>
      )}

      {!streaming && suggestion.status !== "error" && settled.length === 0 && (
        <button type="button" className={cn(btnText, "mt-2")} onClick={onRetry}>
          <RotateCcw className="h-3 w-3" />
          Suggest again
        </button>
      )}

      {!streaming && settled.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-stone-200 pt-3">
          {confirmReplace ? (
            <div role="group" aria-label="Replace suggested beats?" className="rounded-lg bg-white p-2.5 ring-1 ring-stone-200">
              <p className="text-[11px] leading-snug text-stone-700">
                This replaces {replaceable} suggested {replaceable === 1 ? "beat" : "beats"} still marked planned. Your own
                beats, and anything drafted or cut, stay.
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-stone-600">
                {toReplace.slice(0, 5).map((b) => (
                  <li key={b.id}>{b.title}</li>
                ))}
                {replaceable > 5 && <li>and {replaceable - 5} more</li>}
              </ul>
              <div className="mt-2 flex gap-2">
                <button type="button" className={btnPrimary} onClick={adoptAll} disabled={pending !== null}>
                  {pending === "all" && <Loader2 className="h-3 w-3 animate-spin" />}
                  Replace
                </button>
                <button type="button" className={btnSecondary} onClick={() => setConfirmReplace(false)} autoFocus>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={btnPrimary} onClick={adoptAll} disabled={pending !== null}>
                {pending === "all" && <Loader2 className="h-3 w-3 animate-spin" />}
                Use these beats
              </button>
              <button type="button" className={btnText} onClick={onRetry} disabled={pending !== null}>
                <RotateCcw className="h-3 w-3" />
                Suggest again
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
