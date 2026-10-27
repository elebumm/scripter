"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Clock, BarChart3, MessageSquare, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MasterSummaryCard } from "./MasterSummaryCard";
import { CritiqueCard } from "./CritiqueCard";
import { EvaluationHistory } from "./EvaluationHistory";
import { ScoreTrendChart } from "./ScoreTrendChart";
import type { ModelEvalState } from "@/types";

interface SynthesisPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelStates: Record<string, ModelEvalState>;
  masterSummary: ModelEvalState;
  isRunning: boolean;
  completedCount: number;
  totalCount: number;
  onRetryModel: (modelId: string) => void;
  onReEvaluate: () => void;
  scriptId: number | null;
}

export function SynthesisPanel({
  open,
  onOpenChange,
  modelStates,
  masterSummary,
  isRunning,
  completedCount,
  totalCount,
  onRetryModel,
  onReEvaluate,
  scriptId,
}: SynthesisPanelProps) {
  const [view, setView] = useState<"current" | "history" | "trends">("current");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // Auto-refresh history when eval completes
  const prevRunningRef = useRef(isRunning);
  useEffect(() => {
    if (prevRunningRef.current && !isRunning) {
      setHistoryRefreshKey((k) => k + 1);
    }
    prevRunningRef.current = isRunning;
  }, [isRunning]);

  // Switch back to current when a new eval starts
  useEffect(() => {
    if (isRunning) setView("current");
  }, [isRunning]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  const models = Object.values(modelStates);
  const isSummarizing = masterSummary.status === "streaming";
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const hasResults = models.some((m) => m.status !== "idle") || masterSummary.status !== "idle";

  const handleBack = useCallback(() => setView("current"), []);

  return (
    <div
      ref={panelRef}
      className={`fixed top-6 bottom-6 right-6 w-[400px] z-40 glass-panel flex flex-col transition-transform duration-300 ease-out ${
        open ? "translate-x-0" : "translate-x-[calc(100%+24px)]"
      }`}
      style={{ fontFamily: "var(--font-switzer)" }}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <MessageSquare className="h-5 w-5 text-stone-500" />
            <h2 className="text-base font-semibold text-stone-800">The Synthesis</h2>
          </div>
          <div className="flex items-center gap-1">
            {view === "current" && scriptId && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-stone-400 hover:text-stone-600"
                  onClick={() => setView("trends")}
                  title="Score trends"
                >
                  <BarChart3 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-stone-400 hover:text-stone-600"
                  onClick={() => setView("history")}
                  title="History"
                >
                  <Clock className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-stone-400 hover:text-stone-600"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        {isRunning && view === "current" && (
          <div className="flex items-center gap-2 mt-3">
            <Progress value={progressPercent} className="h-1.5 flex-1" />
            <span className="text-[11px] text-stone-400 whitespace-nowrap">
              {isSummarizing
                ? "Synthesizing..."
                : `${completedCount}/${totalCount} models`}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      {view === "history" ? (
        <EvaluationHistory
          scriptId={scriptId}
          onBack={handleBack}
          refreshKey={historyRefreshKey}
        />
      ) : view === "trends" ? (
        <ScrollArea className="flex-1 min-h-0">
          <ScoreTrendChart scriptId={scriptId} onBack={handleBack} />
        </ScrollArea>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          {!hasResults ? (
            <div className="flex items-center justify-center h-64 text-sm text-stone-400">
              Run an evaluation to see results
            </div>
          ) : (
            <div className="px-4 pb-4 space-y-3">
              {/* Master Summary */}
              <MasterSummaryCard summary={masterSummary} />

              {/* Council Critiques */}
              {models.length > 0 && (
                <>
                  <div className="pt-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                      Council Critiques
                    </span>
                  </div>
                  {models.map((m) => (
                    <CritiqueCard
                      key={m.modelId}
                      state={m}
                      onRetry={onRetryModel}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </ScrollArea>
      )}

      {/* Footer */}
      {view === "current" && hasResults && !isRunning && (
        <div className="px-4 py-3 shrink-0">
          <Button
            onClick={onReEvaluate}
            variant="outline"
            className="w-full gap-2 rounded-xl border-stone-200 text-stone-600 hover:text-stone-800 hover:bg-stone-50"
          >
            <RotateCcw className="h-4 w-4" />
            Re-consult Council
          </Button>
        </div>
      )}
    </div>
  );
}
