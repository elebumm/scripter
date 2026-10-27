"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownPreview } from "@/components/editor/MarkdownPreview";
import { Skeleton } from "@/components/ui/skeleton";
import { getCouncilPersona } from "@/lib/design-system";
import type { ModelEvalState } from "@/types";

interface CritiqueCardProps {
  state: ModelEvalState;
  onRetry: (modelId: string) => void;
  defaultOpen?: boolean;
}

export function CritiqueCard({ state, onRetry, defaultOpen = false }: CritiqueCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const persona = getCouncilPersona(state.modelId, state.modelName);

  const isLoading = state.status === "pending";
  const isStreaming = state.status === "streaming";

  return (
    <div className="rounded-2xl bg-white border border-stone-100 overflow-hidden shadow-sm">
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 p-3 text-left hover:bg-stone-50/50 transition-colors"
      >
        {/* Colored avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold"
          style={{ backgroundColor: persona.color }}
        >
          {persona.initials}
        </div>

        {/* Name + model */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-stone-800 truncate">
              {persona.name}
            </span>
            {isStreaming && (
              <Loader2 className="h-3 w-3 animate-spin text-stone-400 shrink-0" />
            )}
          </div>
          <span className="text-[11px] text-stone-400 truncate block">
            {state.modelName}
          </span>
        </div>

        {/* Duration + chevron */}
        <div className="flex items-center gap-2 shrink-0">
          {state.durationMs && (
            <span className="text-[11px] text-stone-400">
              {(state.durationMs / 1000).toFixed(1)}s
            </span>
          )}
          {open ? (
            <ChevronDown className="h-4 w-4 text-stone-300" />
          ) : (
            <ChevronRight className="h-4 w-4 text-stone-300" />
          )}
        </div>
      </button>

      {/* Collapsed preview */}
      {!open && state.text && state.status !== "error" && (
        <div className="px-3 pb-3 -mt-1">
          <p className="text-xs text-stone-500 line-clamp-3 leading-relaxed">
            {state.text.replace(/[#*_`>\-|[\]()]/g, "").slice(0, 250)}
          </p>
        </div>
      )}

      {/* Expanded content */}
      {open && (
        <div className="px-3 pb-3 border-t border-stone-50">
          {state.status === "idle" && (
            <p className="text-sm text-muted-foreground py-3">
              Waiting for evaluation...
            </p>
          )}
          {isLoading && (
            <div className="space-y-3 py-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
          {(isStreaming || state.status === "complete") && (
            <div className="pt-3">
              <MarkdownPreview content={state.text} />
            </div>
          )}
          {state.status === "error" && (
            <div className="py-3 text-sm text-destructive">
              <p className="font-medium">Error</p>
              <p className="text-muted-foreground">{state.error}</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 gap-1 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(state.modelId);
                }}
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
