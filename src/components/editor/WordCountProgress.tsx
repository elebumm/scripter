"use client";

import { Progress } from "@/components/ui/progress";

interface WordCountProgressProps {
  wordCount: number;
  targetLength: number | null;
}

export function WordCountProgress({
  wordCount,
  targetLength,
}: WordCountProgressProps) {
  if (!targetLength) return null;

  const percent = Math.round((wordCount / targetLength) * 100);
  const clampedPercent = Math.min(percent, 100);

  let colorClass: string;
  if (percent > 120) {
    colorClass = "[&_[data-slot=progress-indicator]]:bg-red-500";
  } else if (percent >= 90) {
    colorClass = "[&_[data-slot=progress-indicator]]:bg-green-500";
  } else {
    colorClass = "[&_[data-slot=progress-indicator]]:bg-yellow-500";
  }

  return (
    <div className="flex items-center gap-2">
      <Progress
        value={clampedPercent}
        className={`h-1.5 w-20 ${colorClass}`}
      />
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {wordCount} / {targetLength} words ({percent}%)
      </span>
    </div>
  );
}
