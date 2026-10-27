"use client";

import { FileText, PenLine, ListChecks, Wand2 } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RevisionSidebarProps {
  scriptTitle?: string;
  pendingSuggestionsCount?: number;
  isRunning?: boolean;
  onGoToDrafts?: () => void;
}

const SIDEBAR_MODES = [
  { id: "drafts" as const, label: "DRAFTS", icon: FileText, comingSoon: false, isDraftsLink: true },
  { id: "revision" as const, label: "REVISION", icon: PenLine, comingSoon: false, isDraftsLink: false },
  { id: "beat-sheet" as const, label: "BEAT SHEET", icon: ListChecks, comingSoon: true, isDraftsLink: false },
  { id: "orchestrator" as const, label: "ORCHESTRATOR", icon: Wand2, comingSoon: true, isDraftsLink: false },
];

export function RevisionSidebar({
  scriptTitle,
  pendingSuggestionsCount = 0,
  isRunning = false,
  onGoToDrafts,
}: RevisionSidebarProps) {
  const { activeMode, setActiveMode } = useAppStore();

  return (
    <aside className="fixed right-0 top-14 bottom-0 w-80 z-30 bg-stone-50/80 backdrop-blur-2xl flex flex-col">
      {/* Project title */}
      <div className="px-6 pt-8 pb-6">
        <h2
          className="text-xs font-bold tracking-widest uppercase text-stone-800"
          style={{ fontFamily: "var(--font-cabinet)" }}
        >
          {scriptTitle || "Untitled Script"}
        </h2>
        <p
          className="text-[11px] text-stone-400 mt-1"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          Zen Canvas Studio
        </p>
      </div>

      {/* Mode navigation */}
      <nav className="px-3 space-y-1">
        {SIDEBAR_MODES.map((mode) => {
          const Icon = mode.icon;
          const isActive = activeMode === mode.id;

          if (mode.comingSoon) {
            return (
              <Tooltip key={mode.id}>
                <TooltipTrigger asChild>
                  <div
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-stone-400 cursor-default"
                  >
                    <Icon className="h-4 w-4" />
                    <span
                      className="text-xs font-medium tracking-wider"
                      style={{ fontFamily: "var(--font-inter)" }}
                    >
                      {mode.label}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p>Coming soon</p>
                </TooltipContent>
              </Tooltip>
            );
          }

          return (
            <button
              key={mode.id}
              onClick={() => {
                if (mode.isDraftsLink && onGoToDrafts) {
                  onGoToDrafts();
                } else {
                  setActiveMode(mode.id);
                }
              }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-colors ${
                isActive && !mode.isDraftsLink
                  ? "bg-stone-800 text-white"
                  : "text-stone-500 hover:bg-stone-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span
                className="text-xs font-medium tracking-wider"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {mode.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Revision Stats card at bottom */}
      {pendingSuggestionsCount > 0 && (
        <div className="px-4 pb-6">
          <div className="rounded-xl bg-white p-4">
            <h3
              className="text-[10px] font-bold tracking-widest uppercase text-stone-500 mb-2"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              Revision Stats
            </h3>
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-600">Active Suggestions</span>
              <span className="text-xs font-semibold text-stone-800">
                {pendingSuggestionsCount}
              </span>
            </div>
            {isRunning && (
              <div className="mt-2">
                <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-full bg-stone-600 rounded-full animate-pulse w-2/3" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
