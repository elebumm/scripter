"use client";

import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ModelStatusBadge } from "@/components/evaluation/ModelStatusBadge";
import { MarkdownPreview } from "@/components/editor/MarkdownPreview";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchCheck, Sparkles } from "lucide-react";
import type { FactCheckModelState } from "@/types";
import { FactCheckModelCollapsible } from "./FactCheckModelCollapsible";

interface FactCheckSectionProps {
  modelStates: Record<string, FactCheckModelState>;
  summary: FactCheckModelState;
  isRunning: boolean;
  completedCount: number;
  totalCount: number;
}

export function FactCheckSection({
  modelStates,
  summary,
  isRunning,
  completedCount,
  totalCount,
}: FactCheckSectionProps) {
  const models = Object.values(modelStates);
  const isSummarizing = summary.status === "streaming";
  const progressPercent =
    totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const hasResults =
    models.some((m) => m.status !== "idle") ||
    summary.status !== "idle";

  return (
    <div className="pb-6">
      {/* Progress */}
      {isRunning && (
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <Progress value={progressPercent} className="h-1.5 flex-1" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {isSummarizing
                ? "Synthesizing results..."
                : `${completedCount}/${totalCount} agents`}
            </span>
          </div>
        </div>
      )}

      {!hasResults ? (
        <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
          <div className="text-center space-y-2">
            <SearchCheck className="h-8 w-8 mx-auto text-muted-foreground/50" />
            <p>Run a fact check to verify claims</p>
          </div>
        </div>
      ) : (
        <>
          {/* Summary */}
          {summary.status !== "idle" && (
            <div className="px-4 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-blue-500" />
                <h3 className="text-sm font-semibold">
                  Fact Check Summary
                </h3>
                <ModelStatusBadge status={summary.status} />
              </div>
              {summary.status === "pending" && (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              )}
              {(summary.status === "streaming" ||
                summary.status === "complete") && (
                <MarkdownPreview content={summary.text} />
              )}
              {summary.status === "error" && (
                <div className="text-sm text-destructive">
                  <p className="font-medium">Error</p>
                  <p className="text-muted-foreground">{summary.error}</p>
                </div>
              )}
            </div>
          )}

          {/* Individual Agent Results */}
          {models.length > 0 && (
            <>
              <Separator className="my-4" />
              <div className="px-4 pb-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Individual Agent Results
                </h3>
              </div>
              <div>
                {models.map((m) => (
                  <FactCheckModelCollapsible
                    key={m.modelId}
                    state={m}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
