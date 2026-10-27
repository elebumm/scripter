"use client";

import { Layers } from "lucide-react";
import { getCouncilPersona } from "@/lib/design-system";
import type { ModelEvalState } from "@/types";

interface CouncilWidgetProps {
  modelStates: Record<string, ModelEvalState>;
  isRunning: boolean;
  onOpenSynthesis: () => void;
}

export function CouncilWidget({
  modelStates,
  isRunning,
  onOpenSynthesis,
}: CouncilWidgetProps) {
  const models = Object.values(modelStates);
  const readyCount = models.filter(
    (m) => m.status === "complete" || m.status === "idle"
  ).length;

  return (
    <div className="fixed bottom-6 right-[22rem] z-30">
      <button
        onClick={onOpenSynthesis}
        className="glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:shadow-md transition-shadow"
      >
        {/* Agent pills */}
        <div className="flex -space-x-1.5">
          {models.slice(0, 5).map((m) => {
            const persona = getCouncilPersona(m.modelId, m.modelName);
            const isActive =
              m.status === "pending" || m.status === "streaming";
            return (
              <div
                key={m.modelId}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white border-2 border-white ${
                  isActive ? "animate-pulse" : ""
                }`}
                style={{ backgroundColor: persona.color }}
              >
                {persona.initials}
              </div>
            );
          })}
        </div>

        {/* Status text */}
        <span
          className="text-xs text-stone-500"
          style={{ fontFamily: "var(--font-switzer)" }}
        >
          {isRunning ? "Consulting the Council..." : `${readyCount} agents ready`}
        </span>

        {/* Hub button */}
        <Layers className="h-4 w-4 text-stone-400" />
      </button>
    </div>
  );
}
