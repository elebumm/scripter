"use client";

import { useMemo, useState } from "react";
import { History, Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { useVersions } from "@/hooks/useVersions";
import { useRuns } from "@/hooks/useRuns";
import { formatRelative, parseDbDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import { ScorePill } from "@/components/evaluation/ScoreBits";
import { latestScoreByVersion } from "@/components/evaluation/view-model";
import { useNow } from "@/components/evaluation/useNow";
import { SHORTCUTS } from "@/hooks/useKeyboardShortcuts";
import { VersionDiff } from "./VersionDiff";
import { draftKeepPlan, restoreDescription } from "./restore";

interface VersionTimelineProps {
  scriptId: number;
  /** The editor's current text (the draft). */
  currentContent: string;
  /**
   * Replace the draft with a saved version's text (the writer's own words).
   * `saveDraftFirst` is true when the current draft is in no saved version,
   * so it must be kept as one before it is replaced.
   */
  onRestore: (content: string, saveDraftFirst: boolean) => void;
  /** Save the current draft as a version (Ctrl+S is held by the open sheet). */
  onSaveVersion: () => Promise<unknown>;
}

type CompareMode = "previous" | "draft";

/**
 * Saved versions newest first, each with its words, date and the overall score
 * of its latest whole-script council run. Select one to diff it against the
 * version before it or against the current draft, and restore it as the draft.
 */
export function VersionTimeline({ scriptId, currentContent, onRestore, onSaveVersion }: VersionTimelineProps) {
  const { versions, loading, error, reload } = useVersions(scriptId);
  const { runs } = useRuns(scriptId);
  const now = useNow();
  const scores = useMemo(() => latestScoreByVersion(runs), [runs]);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<CompareMode>("previous");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const selectedIndex = Math.max(
    0,
    versions.findIndex((v) => v.id === selectedId)
  );
  const selected = versions[selectedIndex] ?? null;
  const previous = versions[selectedIndex + 1] ?? null;
  const effectiveMode: CompareMode = mode === "previous" && !previous ? "draft" : mode;
  const draftMatchesSelected = selected != null && selected.content === currentContent;
  const keep = draftKeepPlan(currentContent, versions);
  const saveDraft = async () => {
    await onSaveVersion();
    reload();
  };

  if (loading) {
    return (
      <div className="space-y-2 p-1" aria-busy="true" aria-label="Loading versions">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
        <p>{error}</p>
        <Button size="sm" variant="outline" className="h-7 border-red-200 text-xs text-red-800" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }

  if (versions.length === 0 || !selected) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <History className="h-6 w-6 text-stone-500" aria-hidden="true" />
        <p className="text-sm font-medium text-stone-800">No saved versions yet</p>
        <p className="text-xs text-stone-600">
          Save a version ({SHORTCUTS.saveVersion} in the editor) or consult the council to keep a snapshot of your
          draft here.
        </p>
        <SaveDraftButton
          onSave={saveDraft}
          disabledReason={keep.kind === "empty" ? "Write something first. There's nothing to save yet." : null}
        />
      </div>
    );
  }

  const selectedLabel = `v${selected.version}`;
  const diff =
    effectiveMode === "previous" && previous
      ? { before: previous.content, after: selected.content, beforeLabel: `v${previous.version}`, afterLabel: selectedLabel }
      : { before: selected.content, after: currentContent, beforeLabel: selectedLabel, afterLabel: "Current draft" };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {keep.kind === "save-first" && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-stone-100 px-3 py-2">
          <p className="text-xs text-stone-700">Your current draft isn&apos;t saved as a version yet.</p>
          <SaveDraftButton onSave={saveDraft} />
        </div>
      )}

      <ol className="max-h-[38%] shrink-0 space-y-1 overflow-y-auto pr-1" aria-label="Saved versions, newest first">
        {versions.map((v, i) => {
          const isSelected = v.id === selected.id;
          const created = parseDbDate(v.createdAt);
          const score = scores.get(v.id) ?? null;
          return (
            <li key={v.id}>
              <button
                type="button"
                aria-current={isSelected ? "true" : undefined}
                onClick={() => setSelectedId(v.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700",
                  isSelected ? "bg-stone-800 text-white ring-stone-800" : "bg-white text-stone-800 ring-stone-200/70 hover:bg-stone-50"
                )}
              >
                <span className="w-10 shrink-0 text-sm font-semibold tabular-nums">v{v.version}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-xs", isSelected ? "text-stone-200" : "text-stone-600")}>
                    <time
                      dateTime={created?.toISOString()}
                      title={created?.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    >
                      {formatRelative(v.createdAt, now)}
                    </time>
                    {` · ${v.wordCount.toLocaleString("en-US")} words`}
                    {i === 0 && " · latest"}
                  </span>
                </span>
                {score != null ? (
                  <ScorePill score={score} context={`v${v.version} council average`} />
                ) : (
                  <span className={cn("text-[11px]", isSelected ? "text-stone-300" : "text-stone-500")}>not reviewed</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <section className="flex min-h-0 flex-1 flex-col gap-3" aria-label={`Version ${selected.version}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-lg bg-stone-100 p-0.5 text-xs" role="group" aria-label="Compare with">
            <button
              type="button"
              aria-pressed={effectiveMode === "previous"}
              disabled={!previous}
              onClick={() => setMode("previous")}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-stone-700 disabled:cursor-not-allowed disabled:text-stone-400",
                effectiveMode === "previous" ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900"
              )}
              title={previous ? undefined : "This is the first version"}
            >
              {previous ? `vs v${previous.version}` : "vs previous"}
            </button>
            <button
              type="button"
              aria-pressed={effectiveMode === "draft"}
              onClick={() => setMode("draft")}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-stone-700",
                effectiveMode === "draft" ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900"
              )}
            >
              vs current draft
            </button>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 rounded-lg border-stone-300 text-xs text-stone-800"
            disabled={draftMatchesSelected}
            title={draftMatchesSelected ? "Your draft already matches this version" : undefined}
            onClick={() => setConfirmOpen(true)}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Restore as draft
          </Button>
        </div>

        <VersionDiff
          key={`${selected.id}:${effectiveMode}`}
          before={diff.before}
          after={diff.after}
          beforeLabel={diff.beforeLabel}
          afterLabel={diff.afterLabel}
          className="flex-1"
        />
      </section>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Restore ${selectedLabel} as your draft?`}
        description={restoreDescription(selectedLabel, keep)}
        confirmLabel={`Restore ${selectedLabel}`}
        onConfirm={() => onRestore(selected.content, keep.kind === "save-first")}
      />
    </div>
  );
}

function SaveDraftButton({ onSave, disabledReason = null }: { onSave: () => Promise<void>; disabledReason?: string | null }) {
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8 gap-1.5 rounded-lg border-stone-300 text-xs text-stone-800"
      disabled={saving || disabledReason !== null}
      title={disabledReason ?? `Save your current draft as a version (${SHORTCUTS.saveVersion} in the editor)`}
      onClick={() => void save()}
    >
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
      ) : (
        <Save className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      Save current draft as a version
    </Button>
  );
}
