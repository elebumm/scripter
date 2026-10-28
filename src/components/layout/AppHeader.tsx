"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Download,
  FilePlus2,
  History,
  Loader2,
  MoreHorizontal,
  NotebookText,
  Save,
  Settings,
  ShieldCheck,
  Square,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SHORTCUTS } from "@/hooks/useKeyboardShortcuts";

export type WorkspaceMode = "revision" | "beat-sheet";

const MODES: Array<{ id: WorkspaceMode; label: string }> = [
  { id: "revision", label: "Revision" },
  { id: "beat-sheet", label: "Beat Sheet" },
];

interface AppHeaderProps {
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  /** Right-hand actions (consult, fact-check, overflow). */
  actions?: ReactNode;
}

const tabClass = (active: boolean) =>
  `text-sm py-1 border-b-2 transition-colors ${
    active ? "text-stone-900 font-semibold border-stone-900" : "text-stone-600 border-transparent hover:text-stone-900"
  }`;

export function AppHeader({ mode, onModeChange, actions }: AppHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 h-14 z-50 flex items-center gap-6 px-6 bg-white/85 backdrop-blur-3xl border-b border-stone-200/70">
      <div className="flex-1 min-w-0">
        <Link
          href="/"
          className="text-base font-bold text-stone-900 tracking-tight hover:text-stone-600 transition-colors"
          style={{ fontFamily: "var(--font-cabinet)" }}
        >
          Scripter
        </Link>
      </div>

      <nav aria-label="Workspace" className="flex items-center gap-6" style={{ fontFamily: "var(--font-switzer)" }}>
        <Link href="/" className={tabClass(false)}>
          Drafts
        </Link>
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onModeChange(m.id)}
            aria-current={mode === m.id ? "page" : undefined}
            className={tabClass(mode === m.id)}
          >
            {m.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 flex items-center justify-end gap-2">{actions}</div>
    </header>
  );
}

interface FactCheckButtonProps {
  running: boolean;
  onRun: () => void;
  onStop: () => void;
}

/** Runs one grounded fact-check on a saved version; doubles as Stop while it runs. */
export function FactCheckButton({ running, onRun, onStop }: FactCheckButtonProps) {
  return (
    <button
      type="button"
      onClick={running ? onStop : onRun}
      className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100 hover:text-stone-900 transition-colors"
      title={running ? "Stop the fact-check" : `Fact-check claims against web sources (${SHORTCUTS.factCheck})`}
      style={{ fontFamily: "var(--font-switzer)" }}
    >
      {running ? (
        <>
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
          <span>Checking…</span>
          <Square className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">Stop the fact-check</span>
        </>
      ) : (
        <>
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <span>Fact-check</span>
        </>
      )}
    </button>
  );
}

interface ScriptMenuProps {
  markdownMode: boolean;
  onToggleMarkdownMode: (on: boolean) => void;
  onExportDraft: () => void;
  onExportWithNotes: () => void;
  /** Snapshot the draft as a version (also Ctrl/Cmd+S). */
  onSaveVersion: () => void;
  onOpenHistory: () => void;
  onNewScript: () => void;
}

/** The overflow menu: export, editor mode, versions, settings. */
export function ScriptMenu({
  markdownMode,
  onToggleMarkdownMode,
  onExportDraft,
  onExportWithNotes,
  onSaveVersion,
  onOpenHistory,
  onNewScript,
}: ScriptMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors"
          aria-label="More actions"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onSelect={onExportDraft}>
          <Download aria-hidden="true" />
          Export markdown
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onExportWithNotes}>
          <NotebookText aria-hidden="true" />
          Export with notes
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={markdownMode} onCheckedChange={(on) => onToggleMarkdownMode(on === true)}>
          Markdown mode
          <DropdownMenuShortcut>{markdownMode ? SHORTCUTS.viewWysiwyg : SHORTCUTS.viewMarkdown}</DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuItem onSelect={onSaveVersion}>
          <Save aria-hidden="true" />
          Save version
          <DropdownMenuShortcut>{SHORTCUTS.saveVersion}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onOpenHistory}>
          <History aria-hidden="true" />
          Version history
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onNewScript}>
          <FilePlus2 aria-hidden="true" />
          New script
          <DropdownMenuShortcut>{SHORTCUTS.newScript}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
