"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ModelStatusBadge } from "@/components/evaluation/ModelStatusBadge";
import { MarkdownPreview } from "@/components/editor/MarkdownPreview";
import { Skeleton } from "@/components/ui/skeleton";
import type { FactCheckModelState } from "@/types";

interface FactCheckModelCollapsibleProps {
  state: FactCheckModelState;
  defaultOpen?: boolean;
}

export function FactCheckModelCollapsible({
  state,
  defaultOpen = false,
}: FactCheckModelCollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="font-medium truncate">{state.modelName}</span>
        <div className="ml-auto flex items-center gap-2">
          {state.durationMs && (
            <span className="text-xs text-muted-foreground">
              {(state.durationMs / 1000).toFixed(1)}s
            </span>
          )}
          <ModelStatusBadge status={state.status} />
        </div>
      </button>
      {open && (
        <div className="px-4 pb-3">
          {state.status === "idle" && (
            <p className="text-sm text-muted-foreground py-2">
              Waiting for fact check...
            </p>
          )}
          {state.status === "pending" && (
            <div className="space-y-3 py-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
          {(state.status === "streaming" || state.status === "complete") && (
            <MarkdownPreview content={state.text} />
          )}
          {state.status === "error" && (
            <div className="py-2 text-sm text-destructive">
              <p className="font-medium">Error</p>
              <p className="text-muted-foreground">{state.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
