"use client";

import { ArrowLeft, History, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { RunSummary } from "@/lib/api";
import type { Synthesis } from "@/types/review";
import { buildRunListItem } from "./view-model";
import { ScorePill } from "./ScoreBits";
import { SynthesisView } from "./SynthesisView";

interface RunHistoryProps {
  runs: RunSummary[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
  selectedRunId: string | null;
  onSelect: (runId: string | null) => void;
  selectedRun: Synthesis | null;
  runLoading: boolean;
  runError: string | null;
  /** The run shown on the Synthesis tab, labelled "Latest". */
  latestRunId: string | null;
  now: Date;
  /** Offered on the selected run when its synthesis is missing and can be written now. */
  synthesize?: { onSynthesize: () => void; disabled?: boolean };
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading past runs">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}

/** Past council runs; selecting one shows its saved synthesis read-only. */
export function RunHistory(props: RunHistoryProps) {
  const { runs, loading, error, onReload, selectedRunId, onSelect, selectedRun, runLoading, runError, latestRunId, now, synthesize } = props;

  if (selectedRunId) {
    const summary = runs.find((r) => r.runId === selectedRunId);
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 gap-1.5 text-stone-700 hover:text-stone-900"
          onClick={() => onSelect(null)}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All runs
        </Button>
        {runLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading run">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        ) : runError ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{runError}</p>
        ) : selectedRun ? (
          <>
            {synthesize && (
              <div className="flex items-start gap-3 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-stone-200/70">
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-stone-700">
                  This run&apos;s synthesis didn&apos;t finish. It can be made now from the lenses that finished; no lens is
                  run again.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 gap-1 rounded-lg border-stone-300 text-xs text-stone-700"
                  disabled={synthesize.disabled}
                  onClick={synthesize.onSynthesize}
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  Synthesize this run
                </Button>
              </div>
            )}
            <SynthesisView synthesis={selectedRun} now={now} />
          </>
        ) : (
          <p className="rounded-xl bg-white/70 px-4 py-3 text-sm text-stone-600 ring-1 ring-stone-200/70">
            No synthesis was saved for {summary ? `this ${summary.sectionOnly ? "section review" : "run"} of v${summary.versionNumber}` : "this run"}.
            Older runs only kept their scores.
          </p>
        )}
      </div>
    );
  }

  if (loading) return <ListSkeleton />;

  if (error) {
    return (
      <div className="space-y-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
        <p>{error}</p>
        <Button size="sm" variant="outline" className="h-7 border-red-200 text-xs text-red-800" onClick={onReload}>
          Try again
        </Button>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <History className="h-6 w-6 text-stone-500" aria-hidden="true" />
        <p className="text-sm font-medium text-stone-800">No council runs yet</p>
        <p className="text-xs text-stone-600">Every time you consult the council, the run is kept here with its scores and cost.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-1.5" aria-label="Past council runs">
      {runs.map((run) => {
        const item = buildRunListItem(run, now);
        const isLatest = run.runId === latestRunId;
        return (
          <li key={run.runId}>
            <button
              type="button"
              onClick={() => onSelect(run.runId)}
              className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left shadow-sm ring-1 ring-stone-200/70 transition-colors hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold text-stone-900">{item.versionLabel}</span>
                  <span className="text-xs text-stone-600">{item.relative}</span>
                  {item.section && (
                    <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                      Section
                    </span>
                  )}
                  {isLatest && (
                    <span className="rounded bg-stone-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Latest
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-600">
                  {item.lenses}
                  {item.failed > 0 && <span className="text-red-800">{` · ${item.failed} failed`}</span>}
                  {item.cost && ` · ${item.cost}`}
                </p>
              </div>
              <ScorePill score={item.overallValue} context={`${item.versionLabel} overall average`} size="lg" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
