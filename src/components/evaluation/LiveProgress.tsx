"use client";

import { AlertTriangle, Check, Circle, Loader2, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownPreview } from "@/components/editor/MarkdownPreview";
import type { LensState } from "@/types/review";
import { lensProgress, lensStatusLabel } from "./view-model";
import { ModelChip, ScorePill, SectionLabel } from "./ScoreBits";

interface LiveProgressProps {
  lenses: LensState[];
  phase: "idle" | "critiquing" | "synthesizing" | "done" | "error";
  isRunning: boolean;
  /** Streamed overview while synthesizing. */
  partialOverview: string | null;
  onStop: () => void;
  onRetry: (personaId: number) => void;
  /** Offered when the run has finished lenses but no saved synthesis. */
  onRetrySynthesis?: () => void;
}

function StatusIcon({ status }: { status: LensState["status"] }) {
  switch (status) {
    case "complete":
      return <Check className="h-4 w-4 text-emerald-700" aria-hidden="true" />;
    case "error":
      return <AlertTriangle className="h-4 w-4 text-red-700" aria-hidden="true" />;
    case "streaming":
      return <Loader2 className="h-4 w-4 text-stone-600 motion-safe:animate-spin" aria-hidden="true" />;
    default:
      return <Circle className="h-4 w-4 text-stone-500" aria-hidden="true" />;
  }
}

/** Per-lens status during a run, then the synthesis as it streams. */
export function LiveProgress({ lenses, phase, isRunning, partialOverview, onStop, onRetry, onRetrySynthesis }: LiveProgressProps) {
  const progress = lensProgress(lenses);
  const synthesizing = phase === "synthesizing";
  const finished = progress.done - progress.failed;
  const headline = synthesizing
    ? "Synthesizing the council’s notes"
    : isRunning
      ? `The council is reading · ${progress.done} of ${progress.total} done`
      : phase === "error"
        ? "The run stopped"
        : `${finished} of ${progress.total} lenses finished`;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-stone-800" aria-live="polite">
            {headline}
          </p>
          {isRunning && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 rounded-lg border-stone-300 text-xs text-stone-700"
              onClick={onStop}
              aria-label="Stop the council"
            >
              <Square className="h-3 w-3" aria-hidden="true" />
              Stop
            </Button>
          )}
        </div>
        <div
          role="progressbar"
          aria-label="Lenses finished"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          className="h-1.5 overflow-hidden rounded-full bg-stone-200"
        >
          <div
            className="h-full rounded-full bg-stone-700 motion-safe:transition-[width] motion-safe:duration-500"
            style={{ width: `${synthesizing ? 100 : progress.percent}%` }}
          />
        </div>
      </div>

      <ul className="space-y-1.5" aria-label="Lenses">
        {lenses.map((lens) => (
          <li key={lens.personaId} className="rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-stone-200/70">
            <div className="flex items-center gap-2.5">
              <StatusIcon status={lens.status} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold text-stone-900">{lens.personaName}</span>
                  <ModelChip name={lens.modelName} />
                </div>
                <p className="text-xs text-stone-600">{lensStatusLabel(lens)}</p>
              </div>
              {lens.status === "complete" && typeof lens.critique?.overallScore === "number" && (
                <ScorePill score={lens.critique.overallScore} context={`${lens.personaName}, overall`} />
              )}
              {lens.status === "error" && !isRunning && lens.personaId > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 rounded-lg border-stone-300 text-xs text-stone-700"
                  onClick={() => onRetry(lens.personaId)}
                  aria-label={`Retry ${lens.personaName}`}
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  Retry
                </Button>
              )}
            </div>
            {lens.status === "error" && lens.error && (
              <p className="mt-1.5 break-words pl-[26px] text-xs text-red-800">{lens.error}</p>
            )}
          </li>
        ))}
      </ul>

      {onRetrySynthesis && !isRunning && finished > 0 && (
        <div className="flex items-start gap-3 rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-stone-200/70">
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-stone-700">
            No synthesis was saved for this run. Retrying it uses the {finished}{" "}
            {finished === 1 ? "lens" : "lenses"} that finished; no lens is run again.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1 rounded-lg border-stone-300 text-xs text-stone-700"
            onClick={onRetrySynthesis}
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Retry synthesis
          </Button>
        </div>
      )}

      {synthesizing && (
        <section className="space-y-2" aria-label="Synthesis in progress">
          <SectionLabel>Overview (writing)</SectionLabel>
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/70" aria-busy="true">
            {partialOverview ? (
              <MarkdownPreview content={partialOverview} />
            ) : (
              <div className="space-y-2 p-4">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3.5 w-5/6" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
