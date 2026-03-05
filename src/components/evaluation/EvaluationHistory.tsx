"use client";

import { useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ModelCollapsible } from "./ModelCollapsible";
import { MarkdownPreview } from "@/components/editor/MarkdownPreview";
import {
  useEvaluationHistory,
  evalToModelState,
  type HistoryRun,
} from "@/hooks/useEvaluationHistory";

interface EvaluationHistoryProps {
  scriptId: number | null;
  onBack: () => void;
  refreshKey: number;
}

function RunCard({ run }: { run: HistoryRun }) {
  const [open, setOpen] = useState(false);
  const date = new Date(run.timestamp);
  const timeStr = date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <div className="flex flex-col items-start gap-0.5">
          <span className="font-medium">
            Version {run.versionId}
          </span>
          <span className="text-xs text-muted-foreground">{timeStr}</span>
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          {run.modelCount} model{run.modelCount !== 1 ? "s" : ""}
        </div>
      </button>

      {open && (
        <div className="border-t">
          {/* Master Summary */}
          {run.summary && (
            <div className="px-4 pt-3 pb-2">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-yellow-500" />
                <h4 className="text-sm font-semibold">Master Summary</h4>
              </div>
              <MarkdownPreview content={run.summary.result} />
            </div>
          )}

          {/* Individual Models */}
          {run.evaluations.length > 0 && (
            <>
              {run.summary && <Separator />}
              <div className="px-4 py-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Individual Model Results
                </h4>
              </div>
              <div>
                {run.evaluations.map((ev) => (
                  <ModelCollapsible
                    key={ev.id}
                    state={evalToModelState(ev)}
                    onRetry={() => {}}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function EvaluationHistory({
  scriptId,
  onBack,
  refreshKey,
}: EvaluationHistoryProps) {
  const { runs, loading, refresh } = useEvaluationHistory(scriptId);

  // Re-fetch when refreshKey changes (after eval completes)
  // Using a ref to track the last key we fetched for
  const [lastKey, setLastKey] = useState(refreshKey);
  if (refreshKey !== lastKey) {
    setLastKey(refreshKey);
    refresh();
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 -ml-2 text-xs"
          onClick={onBack}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to current
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {loading && runs.length === 0 ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : runs.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
            No past evaluations found
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {runs.map((run) => (
              <RunCard key={`${run.versionId}-${run.timestamp}`} run={run} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
