"use client";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { ProfileSelector } from "@/components/profiles/ProfileSelector";
import { ExportMenu } from "@/components/export/ExportMenu";
import { Progress } from "@/components/ui/progress";
import { ConfirmDialog } from "./ConfirmDialog";
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog";
import {
  PanelLeft,
  Plus,
  Settings,
  Keyboard,
  Play,
  Square,
  PanelRightOpen,
  PanelRightClose,
  SearchCheck,
} from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import Link from "next/link";
import { useState } from "react";

interface TopBarProps {
  onNewScript: () => void;
  hasScript: boolean;
  // Evaluation
  onEvaluate: () => void;
  onAbort: () => void;
  isRunning: boolean;
  hasContent: boolean;
  completedCount: number;
  totalCount: number;
  isSummarizing: boolean;
  // Fact check
  onFactCheck?: () => void;
  isFactCheckRunning?: boolean;
  onAbortFactCheck?: () => void;
  // Drawer
  hasResults: boolean;
  evalDrawerOpen: boolean;
  onToggleEvalDrawer: () => void;
  // Export
  content: string;
  modelStates: Record<string, { modelName: string; text: string }>;
  masterSummaryText: string;
  scriptTitle: string;
}

export function TopBar({
  onNewScript,
  hasScript,
  onEvaluate,
  onAbort,
  isRunning,
  hasContent,
  completedCount,
  totalCount,
  isSummarizing,
  onFactCheck,
  isFactCheckRunning,
  onAbortFactCheck,
  hasResults,
  evalDrawerOpen,
  onToggleEvalDrawer,
  content,
  modelStates,
  masterSummaryText,
  scriptTitle,
}: TopBarProps) {
  const { setScriptListOpen } = useAppStore();
  const [stopOpen, setStopOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const progressPercent =
    totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="flex h-11 items-center gap-1.5 border-b px-3">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setScriptListOpen(true)}
      >
        <PanelLeft className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onNewScript}
      >
        <Plus className="h-4 w-4" />
      </Button>

      <div className="flex-1" />

      {/* Inline progress when running */}
      {isRunning && (
        <div className="flex items-center gap-2 mr-2 max-w-[200px]">
          <Progress value={progressPercent} className="h-1.5 flex-1" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {isSummarizing
              ? "Summarizing..."
              : `${completedCount}/${totalCount}`}
          </span>
        </div>
      )}

      {/* Evaluate / Stop */}
      {hasScript && (
        <>
          {isRunning ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => setStopOpen(true)}
              >
                <Square className="h-3 w-3" />
                Stop
              </Button>
              <ConfirmDialog
                open={stopOpen}
                onOpenChange={setStopOpen}
                title="Stop evaluation?"
                description="This will cancel all running models. You can retry individual models afterwards."
                confirmLabel="Stop"
                onConfirm={onAbort}
              />
            </>
          ) : (
            <Button
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={onEvaluate}
              disabled={!hasContent}
            >
              <Play className="h-3 w-3" />
              Evaluate
            </Button>
          )}

          {/* Fact Check button */}
          {isFactCheckRunning ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={onAbortFactCheck}
            >
              <Square className="h-3 w-3" />
              Stop Check
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={onFactCheck}
              disabled={!hasContent || isRunning}
            >
              <SearchCheck className="h-3 w-3" />
              Fact Check
            </Button>
          )}
        </>
      )}

      {/* Eval drawer toggle */}
      {hasScript && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 relative"
          onClick={onToggleEvalDrawer}
          title="Toggle evaluation results"
        >
          {evalDrawerOpen ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
          {hasResults && !evalDrawerOpen && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-green-500" />
          )}
        </Button>
      )}

      <ProfileSelector />

      <ExportMenu
        title={scriptTitle}
        content={content}
        modelStates={modelStates}
        masterSummaryText={masterSummaryText}
      />

      <Link href="/settings">
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings className="h-4 w-4" />
        </Button>
      </Link>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setShortcutsOpen(true)}
        title="Keyboard Shortcuts"
      >
        <Keyboard className="h-4 w-4" />
      </Button>

      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />

      <ThemeToggle />
    </div>
  );
}
