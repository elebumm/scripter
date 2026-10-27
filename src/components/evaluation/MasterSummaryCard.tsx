"use client";

import { Sparkles } from "lucide-react";
import { MarkdownPreview } from "@/components/editor/MarkdownPreview";
import { Skeleton } from "@/components/ui/skeleton";
import { ModelStatusBadge } from "./ModelStatusBadge";
import type { ModelEvalState } from "@/types";

interface MasterSummaryCardProps {
  summary: ModelEvalState;
}

export function MasterSummaryCard({ summary }: MasterSummaryCardProps) {
  if (summary.status === "idle") return null;

  return (
    <div className="rounded-2xl bg-white border border-stone-100 overflow-hidden shadow-sm">
      {/* Left accent bar via border-left */}
      <div className="border-l-4 border-l-stone-400 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-stone-500" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            Master Summary
          </span>
          <ModelStatusBadge status={summary.status} />
        </div>

        {summary.status === "pending" && (
          <div className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        )}

        {(summary.status === "streaming" || summary.status === "complete") && (
          <MarkdownPreview content={summary.text} />
        )}

        {summary.status === "error" && (
          <div className="text-sm text-destructive">
            <p className="font-medium">Error</p>
            <p className="text-muted-foreground mt-1">{summary.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
