"use client";

import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatScore, scoreBand, scoreToneClass } from "./view-model";

/** The model behind a lens. Always shown next to the persona name. */
export function ModelChip({ name, className }: { name: string; className?: string }) {
  if (!name) return null;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600 ring-1 ring-inset ring-stone-200",
        className
      )}
      title={`Model: ${name}`}
    >
      {name}
    </span>
  );
}

interface ScorePillProps {
  score: number | null | undefined;
  /** Who gave the score, for the tooltip ("Story Architect", "Average"). */
  context?: string;
  size?: "sm" | "lg";
  className?: string;
}

/** A score with its rubric anchor in a tooltip ("7 · Strong: works, …"). */
export function ScorePill({ score, context, size = "sm", className }: ScorePillProps) {
  const band = scoreBand(score);
  const text = formatScore(score);
  const pill = (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md font-semibold tabular-nums",
        size === "lg" ? "min-w-10 px-2 py-1 text-sm" : "min-w-7 px-1.5 py-0.5 text-xs",
        scoreToneClass(score),
        className
      )}
    >
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">
        {context ? `${context}: ` : ""}
        {band ? `${text} out of 10, ${band.label}` : "no score"}
      </span>
    </span>
  );
  if (!band) return pill;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{pill}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 text-left">
        <p className="font-semibold">
          {context ? `${context} · ` : ""}
          {text}/10
        </p>
        <p>{band.meaning}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Small uppercase section label used across the panel. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn("text-[11px] font-semibold uppercase tracking-wider text-stone-500", className)}>{children}</h3>
  );
}
