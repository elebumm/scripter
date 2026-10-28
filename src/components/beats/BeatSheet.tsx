"use client";

import { useMemo } from "react";
import { ListChecks, Loader2, RotateCcw, ScanSearch, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBeats } from "@/hooks/useBeats";
import { useAppStore } from "@/stores/app-store";
import { estimateRuntimeSeconds } from "@/lib/utils/reading-time";
import { findAnchorInText, markdownToPlain } from "@/lib/text/anchor";
import { AddBeatForm } from "./AddBeatForm";
import { BeatCard } from "./BeatCard";
import { BeatCheckPanel } from "./BeatCheckPanel";
import { BeatProposal } from "./BeatProposal";
import { beatTotals, formatSeconds, moveBeat, type BeatTotals } from "./beat-utils";
import { FONT_CABINET, FONT_SWITZER, btnSecondary, btnText, labelCaps } from "./styles";

export interface BeatSheetProps {
  scriptId: number;
  /** Current editor text (markdown). */
  content: string;
  /** Start a suggestion once on mount when the script has no beats. */
  autoSuggest: boolean;
  /** Scroll the editor to this passage of the writer's text. */
  onJumpToAnchor: (anchorText: string) => void;
  /** Save the draft as a version (the check reads a saved version). */
  saveVersion: () => Promise<{ id: number } | null>;
}

/**
 * The Beat Sheet: the writer's plan for the video, beat by beat. Beats say
 * what each part must do; they never supply the script's words.
 */
export function BeatSheet(props: BeatSheetProps) {
  // A new script starts from a clean sheet (state, streams and edits in flight).
  return <BeatSheetBody key={props.scriptId} {...props} />;
}

function BeatSheetBody({ scriptId, content, autoSuggest, onJumpToAnchor, saveVersion }: BeatSheetProps) {
  const beatsApi = useBeats(scriptId, { autoSuggest });
  const { beats, loading, loadError, error, brief, suggestion, check } = beatsApi;
  const wordsPerMinute = useAppStore((s) => s.wordsPerMinute);

  const plain = useMemo(() => markdownToPlain(content), [content]);
  const anchorInDraft = (anchorText: string) => findAnchorInText(plain, markdownToPlain(anchorText)) !== null;

  const targetSeconds = brief?.targetWords ? estimateRuntimeSeconds(brief.targetWords, wordsPerMinute) : null;
  const totals = beatTotals(beats, targetSeconds);

  const suggesting = suggestion.status === "streaming";
  const checking = check.status === "saving" || check.status === "checking";
  const draftEmpty = !content.trim();
  const checkBlockedReason =
    beats.length === 0 ? "Add beats first" : draftEmpty ? "Write some of the draft first" : null;

  const startCheck = () => void beatsApi.runCheck(saveVersion);

  const showEmpty = !loading && !loadError && beats.length === 0 && suggestion.status === "idle";

  return (
    <section aria-label="Beat sheet" className="flex min-h-0 flex-1 flex-col" style={FONT_SWITZER}>
      <header className="space-y-3 px-4 pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className={labelCaps}>Beat sheet</h3>
          {beats.length > 0 && (
            <span className="text-[11px] text-stone-500">
              {totals.activeBeats} {totals.activeBeats === 1 ? "beat" : "beats"} · {totals.draftedBeats} drafted
            </span>
          )}
        </div>

        {beats.length > 0 && <TotalsBar totals={totals} />}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={btnSecondary}
            onClick={() => void beatsApi.suggest()}
            disabled={suggesting}
            title="Propose beats from your brief (and your draft, if there is one). Nothing is added until you choose."
          >
            {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Suggest beats
          </button>
          <button
            type="button"
            className={btnSecondary}
            onClick={startCheck}
            disabled={checking || checkBlockedReason !== null}
            aria-label="Check my draft against beats"
            title={checkBlockedReason ?? "Saves a version, then checks which beats the draft covers"}
          >
            {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
            Check my draft
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-6">
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] text-red-800">
            <p className="flex-1">{error}</p>
            <button
              type="button"
              className="rounded p-0.5 text-red-700 hover:bg-red-100"
              onClick={beatsApi.clearError}
              aria-label="Dismiss error"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {suggestion.status !== "idle" && (
          <BeatProposal
            suggestion={suggestion}
            beats={beats}
            onAdd={(item) =>
              beatsApi.create({ title: item.title, purpose: item.purpose, targetSeconds: item.targetSeconds, source: "ai" })
            }
            onUseAll={async (items) => {
              const ok = await beatsApi.replaceAi(items);
              if (ok) beatsApi.dismissSuggestion();
              return ok;
            }}
            onStop={beatsApi.stopSuggest}
            onDismiss={beatsApi.dismissSuggestion}
            onRetry={() => void beatsApi.suggest()}
          />
        )}

        {check.status !== "idle" && (
          <BeatCheckPanel
            check={check}
            beats={beats}
            anchorInDraft={anchorInDraft}
            onJump={onJumpToAnchor}
            onAddMissing={(item) => beatsApi.create({ title: item.title, purpose: item.purpose, source: "ai" })}
            onStop={beatsApi.stopCheck}
            onDismiss={beatsApi.dismissCheck}
            onRetry={startCheck}
          />
        )}

        {loading && (
          <div className="space-y-2" aria-label="Loading beats">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-stone-100" />
            ))}
          </div>
        )}

        {loadError && (
          <div role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-800">
            <p>Couldn&apos;t load the beats: {loadError}</p>
            <button type="button" className={cn(btnText, "mt-1 text-red-800 hover:bg-red-100")} onClick={beatsApi.reload}>
              <RotateCcw className="h-3 w-3" />
              Try again
            </button>
          </div>
        )}

        {showEmpty && (
          <EmptyState
            hasSource={Boolean(brief?.hasBrief) || !draftEmpty}
            onSuggest={() => void beatsApi.suggest()}
          />
        )}

        {beats.length > 0 && (
          <ol className="space-y-2" aria-label="Beats">
            {beats.map((beat, index) => (
              <BeatCard
                key={beat.id}
                beat={beat}
                index={index}
                isFirst={index === 0}
                isLast={index === beats.length - 1}
                anchor={!beat.anchorText ? "none" : anchorInDraft(beat.anchorText) ? "found" : "changed"}
                onUpdate={(patch) => void beatsApi.update(beat.id, patch)}
                onMove={(direction) => {
                  const next = moveBeat(beats, beat.id, direction);
                  if (next) void beatsApi.reorder(next.map((b) => b.id));
                }}
                onDelete={() => void beatsApi.remove(beat.id)}
                onJump={() => beat.anchorText && onJumpToAnchor(beat.anchorText)}
              />
            ))}
          </ol>
        )}

        {!loading && !loadError && (
          <AddBeatForm
            onAdd={async (data) => (await beatsApi.create({ ...data, source: "writer" })) !== null}
          />
        )}
      </div>
    </section>
  );
}

function TotalsBar({ totals }: { totals: BeatTotals }) {
  const { plannedSeconds, targetSeconds, differenceSeconds, beatsWithoutTarget } = totals;
  const ratio = targetSeconds ? Math.min(1, plannedSeconds / targetSeconds) : 0;
  const over = differenceSeconds !== null && targetSeconds !== null && differenceSeconds > targetSeconds * 0.1;

  return (
    <div className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-stone-200/80">
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-stone-600">
        <span>
          Planned <span className="font-semibold tabular-nums text-stone-800">{formatSeconds(plannedSeconds)}</span>
        </span>
        <span>
          {targetSeconds !== null ? (
            <>
              target <span className="font-semibold tabular-nums text-stone-800">~{formatSeconds(targetSeconds)}</span>
            </>
          ) : (
            "no target length (set one in the Brief, in Revision)"
          )}
        </span>
      </div>
      {targetSeconds !== null && (
        <div
          className="mt-1.5 h-1 overflow-hidden rounded-full bg-stone-100"
          role="meter"
          aria-label="Planned beat time against the target length"
          aria-valuemin={0}
          aria-valuemax={targetSeconds}
          aria-valuenow={Math.min(plannedSeconds, targetSeconds)}
          aria-valuetext={`${formatSeconds(plannedSeconds)} of ${formatSeconds(targetSeconds)}`}
        >
          <div
            className={cn("h-full rounded-full", over ? "bg-amber-500" : "bg-stone-600")}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      )}
      {(over || beatsWithoutTarget > 0) && (
        <p className="mt-1.5 text-[10px] leading-snug text-stone-500">
          {over && differenceSeconds !== null && (
            <span className="text-amber-800">{formatSeconds(differenceSeconds)} over the target. </span>
          )}
          {beatsWithoutTarget > 0 &&
            `${beatsWithoutTarget} ${beatsWithoutTarget === 1 ? "beat has" : "beats have"} no target length.`}
        </p>
      )}
    </div>
  );
}

function EmptyState({ hasSource, onSuggest }: { hasSource: boolean; onSuggest: () => void }) {
  return (
    <div className="rounded-xl bg-white/70 p-4 text-center ring-1 ring-stone-200/70">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-stone-100">
        <ListChecks className="h-5 w-5 text-stone-500" />
      </div>
      <p className="mt-3 text-sm font-bold text-stone-800" style={FONT_CABINET}>
        Plan the shape before the words
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-stone-600">
        Beats are the moments your video needs, in order, and what each one must do for the viewer. They guide your
        draft. They never write it.
      </p>
      {!hasSource && (
        <p className="mt-2 text-[11px] leading-snug text-stone-500">
          Suggestions work from your brief and draft. Add a brief in Revision mode for a better plan.
        </p>
      )}
      <button type="button" className={cn(btnText, "mt-3")} onClick={onSuggest}>
        <Sparkles className="h-3 w-3" />
        Suggest beats from my brief
      </button>
    </div>
  );
}
