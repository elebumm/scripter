"use client";

import { User } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const MODES = [
  { id: "drafts" as const, label: "Drafts", comingSoon: false },
  { id: "revision" as const, label: "Revision Mode", comingSoon: false },
  { id: "beat-sheet" as const, label: "Beat Sheet", comingSoon: true },
  { id: "orchestrator" as const, label: "Orchestrator", comingSoon: true },
];

interface AppHeaderProps {
  onGoToDrafts?: () => void;
}

export function AppHeader({ onGoToDrafts }: AppHeaderProps) {
  const { activeMode, setActiveMode } = useAppStore();

  return (
    <header className="fixed top-0 left-0 right-0 h-14 z-50 flex items-center px-6 bg-white/80 backdrop-blur-3xl border-b border-stone-100/60">
      {/* Left: Branding */}
      <div className="flex-1">
        <button
          onClick={onGoToDrafts}
          className="text-base font-bold text-stone-900 tracking-tight hover:text-stone-600 transition-colors"
          style={{ fontFamily: "var(--font-cabinet)" }}
        >
          Zen Canvas
        </button>
      </div>

      {/* Center: Mode tabs */}
      <nav className="flex items-center gap-6">
        {MODES.map((mode) => {
          const isActive = activeMode === mode.id;

          if (mode.comingSoon) {
            return (
              <Tooltip key={mode.id}>
                <TooltipTrigger asChild>
                  <span
                    className="text-sm text-stone-400 cursor-default py-1"
                    style={{ fontFamily: "var(--font-switzer)" }}
                  >
                    {mode.label}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Coming soon</p>
                </TooltipContent>
              </Tooltip>
            );
          }

          if (mode.id === "drafts") {
            return (
              <button
                key={mode.id}
                onClick={onGoToDrafts}
                className="text-sm py-1 text-stone-400 hover:text-stone-600 transition-colors"
                style={{ fontFamily: "var(--font-switzer)" }}
              >
                {mode.label}
              </button>
            );
          }

          return (
            <button
              key={mode.id}
              onClick={() => setActiveMode(mode.id)}
              className={`text-sm py-1 transition-colors ${
                isActive
                  ? "text-stone-900 font-semibold border-b-2 border-stone-900"
                  : "text-stone-400 hover:text-stone-600"
              }`}
              style={{ fontFamily: "var(--font-switzer)" }}
            >
              {mode.label}
            </button>
          );
        })}
      </nav>

      {/* Right: Avatar */}
      <div className="flex-1 flex justify-end">
        <div className="w-8 h-8 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center">
          <User className="h-4 w-4 text-stone-500" />
        </div>
      </div>
    </header>
  );
}
