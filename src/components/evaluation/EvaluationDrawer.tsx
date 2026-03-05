"use client";

import { useState, useEffect, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ModelStatusBadge } from "./ModelStatusBadge";
import { ModelCollapsible } from "./ModelCollapsible";
import { MarkdownPreview } from "@/components/editor/MarkdownPreview";
import { EvaluationHistory } from "./EvaluationHistory";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreTrendChart } from "./ScoreTrendChart";
import { Sparkles, Clock, BarChart3 } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { FactCheckSection } from "@/components/factcheck/FactCheckSection";
import type { ModelEvalState, FactCheckModelState } from "@/types";

interface EvaluationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelStates: Record<string, ModelEvalState>;
  masterSummary: ModelEvalState;
  isRunning: boolean;
  completedCount: number;
  totalCount: number;
  onRetryModel: (modelId: string) => void;
  scriptId: number | null;
  // Fact check
  factCheckModelStates?: Record<string, FactCheckModelState>;
  factCheckSummary?: FactCheckModelState;
  isFactCheckRunning?: boolean;
  factCheckCompletedCount?: number;
  factCheckTotalCount?: number;
}

export function EvaluationDrawer({
  open,
  onOpenChange,
  modelStates,
  masterSummary,
  isRunning,
  completedCount,
  totalCount,
  onRetryModel,
  scriptId,
  factCheckModelStates,
  factCheckSummary,
  isFactCheckRunning,
  factCheckCompletedCount,
  factCheckTotalCount,
}: EvaluationDrawerProps) {
  const { factCheckDrawerView, setFactCheckDrawerView } = useAppStore();
  const [view, setView] = useState<"current" | "history" | "trends">("current");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // Auto-refresh history when an evaluation run completes
  const prevRunningRef = useRef(isRunning);
  useEffect(() => {
    if (prevRunningRef.current && !isRunning) {
      setHistoryRefreshKey((k) => k + 1);
    }
    prevRunningRef.current = isRunning;
  }, [isRunning]);

  // Switch back to current when a new eval starts
  useEffect(() => {
    if (isRunning) {
      setView("current");
    }
  }, [isRunning]);

  const models = Object.values(modelStates);
  const isSummarizing = masterSummary.status === "streaming";
  const progressPercent =
    totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const hasResults =
    models.some((m) => m.status !== "idle") ||
    masterSummary.status !== "idle";

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        showOverlay={false}
        showCloseButton={false}
        side="right"
        className="w-full sm:w-[45vw] sm:min-w-[480px] sm:max-w-[720px] p-0 flex flex-col"
      >
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          {/* Eval / Fact Check toggle */}
          <div className="flex items-center gap-1 mb-2">
            <Button
              variant={factCheckDrawerView === "eval" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => setFactCheckDrawerView("eval")}
            >
              Evaluation
            </Button>
            <Button
              variant={factCheckDrawerView === "factcheck" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => setFactCheckDrawerView("factcheck")}
            >
              Fact Check
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <SheetTitle className="text-base">
              {factCheckDrawerView === "factcheck"
                ? "Fact Check Results"
                : view === "history"
                ? "Evaluation History"
                : view === "trends"
                ? "Score Trends"
                : "Evaluation Results"}
            </SheetTitle>
            {factCheckDrawerView === "eval" && view === "current" && scriptId && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setView("trends")}
                  title="View score trends"
                >
                  <BarChart3 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setView("history")}
                  title="View history"
                >
                  <Clock className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          {factCheckDrawerView === "eval" && isRunning && view === "current" && (
            <div className="flex items-center gap-2 pt-1">
              <Progress value={progressPercent} className="h-1.5 flex-1" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {isSummarizing
                  ? "Generating summary..."
                  : `${completedCount}/${totalCount} models`}
              </span>
            </div>
          )}
        </SheetHeader>

        {factCheckDrawerView === "factcheck" ? (
          <ScrollArea className="flex-1 min-h-0">
            <FactCheckSection
              modelStates={factCheckModelStates ?? {}}
              summary={factCheckSummary ?? {
                modelId: "fact-check-summary",
                modelName: "Fact Check Summary",
                status: "idle",
                text: "",
              }}
              isRunning={isFactCheckRunning ?? false}
              completedCount={factCheckCompletedCount ?? 0}
              totalCount={factCheckTotalCount ?? 0}
            />
          </ScrollArea>
        ) : view === "history" ? (
          <EvaluationHistory
            scriptId={scriptId}
            onBack={() => setView("current")}
            refreshKey={historyRefreshKey}
          />
        ) : view === "trends" ? (
          <ScrollArea className="flex-1 min-h-0">
            <ScoreTrendChart
              scriptId={scriptId}
              onBack={() => setView("current")}
            />
          </ScrollArea>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            {!hasResults ? (
              <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                Run an evaluation to see results
              </div>
            ) : (
              <div className="pb-6">
                {/* Master Summary */}
                {masterSummary.status !== "idle" && (
                  <div className="px-4 pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="h-4 w-4 text-yellow-500" />
                      <h3 className="text-sm font-semibold">Master Summary</h3>
                      <ModelStatusBadge status={masterSummary.status} />
                    </div>
                    {masterSummary.status === "pending" && (
                      <div className="space-y-3">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-4 w-5/6" />
                      </div>
                    )}
                    {(masterSummary.status === "streaming" ||
                      masterSummary.status === "complete") && (
                      <MarkdownPreview content={masterSummary.text} />
                    )}
                    {masterSummary.status === "error" && (
                      <div className="text-sm text-destructive">
                        <p className="font-medium">Error</p>
                        <p className="text-muted-foreground">
                          {masterSummary.error}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Individual Model Results */}
                {models.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <div className="px-4 pb-2">
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Individual Model Results
                      </h3>
                    </div>
                    <div>
                      {models.map((m) => (
                        <ModelCollapsible
                          key={m.modelId}
                          state={m}
                          onRetry={onRetryModel}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
