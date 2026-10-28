"use client";

import { useState } from "react";
import { ChevronDown, Loader2, Square, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ReviewSection } from "@/components/editor/section";
import { SHORTCUTS } from "@/hooks/useKeyboardShortcuts";
import { MAX_SECTION_CHARS } from "@/hooks/useCouncil";

interface ConsultButtonProps {
  isRunning: boolean;
  /** Live progress while running, e.g. "2 of 5" or "Synthesizing". */
  progressLabel: string | null;
  /** Scope of the current (or next) run: "Whole script" or a section label. */
  scopeLabel: string;
  /** Read when the menu opens; null hides the section option's target. */
  getSection: () => ReviewSection | null;
  onConsult: (section?: ReviewSection) => void;
  onStop: () => void;
}

/** What the "Selected section" item says under its name, and whether it can run. */
export function sectionHint(section: ReviewSection | null): { text: string; available: boolean } {
  if (!section) {
    return { text: "Select a passage, or put the cursor inside an H2 section, then open this menu.", available: false };
  }
  // Measured as sent: the council trims the section first.
  if (section.text.trim().length > MAX_SECTION_CHARS) {
    return { text: "This section is too long to review on its own. Review the whole script instead.", available: false };
  }
  return { text: section.label, available: true };
}

/**
 * Primary action of the revision page. A click always reviews the whole
 * script; reviewing a section is an explicit pick from the menu (I17).
 */
export function ConsultButton({ isRunning, progressLabel, scopeLabel, getSection, onConsult, onStop }: ConsultButtonProps) {
  const [section, setSection] = useState<ReviewSection | null>(null);
  const hint = sectionHint(section);

  return (
    <div className="flex items-stretch rounded-xl bg-stone-800 text-white shadow-sm">
      <button
        type="button"
        onClick={() => onConsult()}
        disabled={isRunning}
        className="flex items-center gap-2 rounded-l-xl pl-3.5 pr-3 py-1.5 text-left hover:bg-stone-900 disabled:cursor-default disabled:hover:bg-stone-800 transition-colors"
        aria-label={isRunning ? `Consulting the council, ${progressLabel ?? "in progress"}` : "Consult the council on the whole script"}
      >
        {isRunning ? (
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
        ) : (
          <Users className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="flex flex-col leading-tight">
          <span className="text-xs font-semibold" style={{ fontFamily: "var(--font-switzer)" }}>
            {isRunning ? `Consulting${progressLabel ? ` · ${progressLabel}` : "…"}` : "Consult the council"}
          </span>
          <span className="text-[10px] text-stone-300 max-w-[12rem] truncate">{scopeLabel}</span>
        </span>
      </button>
      <DropdownMenu onOpenChange={(open) => open && setSection(getSection())}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center rounded-r-xl border-l border-stone-600 px-2 hover:bg-stone-900 transition-colors"
            aria-label="Council options"
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="text-xs text-stone-500">Review scope</DropdownMenuLabel>
          <DropdownMenuItem disabled={isRunning} onSelect={() => onConsult()}>
            Whole script
            <DropdownMenuShortcut>{SHORTCUTS.consult}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isRunning || !hint.available}
            onSelect={() => section && hint.available && onConsult(section)}
            className="flex-col items-start gap-0.5"
          >
            <span>Selected section</span>
            <span className="text-[11px] text-stone-600 whitespace-normal">{hint.text}</span>
          </DropdownMenuItem>
          {isRunning && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onStop}>
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
                Stop the council
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
