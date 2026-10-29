"use client";

import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { CouncilRoster } from "@/components/council/CouncilRoster";
import { NotesList } from "@/components/council/NotesList";
import { ContextEditor } from "@/components/editor/ContextEditor";
import type { CouncilController } from "@/hooks/useCouncil";
import type { NotesController } from "@/hooks/useNotes";
import type { DraftSaveState } from "@/hooks/useScript";
import type { WorkspaceMode } from "./AppHeader";

export interface DraftStatus {
  draftNumber: number;
  saveState: DraftSaveState;
  spokenWords: number;
  /** "m:ss" */
  runtime: string;
  /** "m:ss", or null when the script has no target length. */
  targetRuntime: string | null;
}

const SAVE_LABEL: Record<DraftSaveState, string> = {
  saved: "saved",
  unsaved: "unsaved",
  saving: "saving…",
  error: "not saved",
};

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <h3
        className="flex-1 text-[10px] font-bold tracking-widest uppercase text-stone-600"
        style={{ fontFamily: "var(--font-inter)" }}
      >
        {children}
      </h3>
      {aside}
    </div>
  );
}

/** "Draft n · saved · N spoken words · ~m:ss of ~m:ss target" */
export function StatusLine({ status }: { status: DraftStatus }) {
  const parts = [
    `Draft ${status.draftNumber}`,
    SAVE_LABEL[status.saveState],
    `${status.spokenWords.toLocaleString("en-US")} spoken words`,
    status.targetRuntime ? `~${status.runtime} of ~${status.targetRuntime} target` : `~${status.runtime}`,
  ];
  // Not a live region: it changes on nearly every word typed. Autosave
  // failures are announced by their toast.
  return (
    <p
      className={`px-1 text-[11px] leading-relaxed ${status.saveState === "error" ? "text-rose-700" : "text-stone-600"}`}
      style={{ fontFamily: "var(--font-inter)" }}
    >
      {parts.join(" · ")}
    </p>
  );
}

interface RevisionSidebarProps {
  mode: WorkspaceMode;
  /** Body for Beat Sheet mode. */
  beatSheet: ReactNode;
  status: DraftStatus;
  council: CouncilController;
  /** Out of the tab order and hidden from assistive tech (the synthesis panel covers it). */
  inert?: boolean;
  onConsult: () => void;
  onOpenSynthesis: () => void;
  brief: {
    context: string;
    onChange: (context: string) => void;
    onCommit: () => void;
    /** Target length in words (null = none). */
    targetLength: number | null;
    onTargetLengthChange: (words: number | null) => void;
  };
  notes: NotesController;
  activeNoteId: number | null;
  onSelectNote: (id: number) => void;
  /** Fact notes section (list + fact-check status). */
  facts: ReactNode;
}

/** The right-hand column of the script page. */
export function RevisionSidebar({
  mode,
  beatSheet,
  status,
  council,
  inert = false,
  onConsult,
  onOpenSynthesis,
  brief,
  notes,
  activeNoteId,
  onSelectNote,
  facts,
}: RevisionSidebarProps) {
  return (
    <aside
      aria-label={mode === "revision" ? "Revision" : "Beat sheet"}
      inert={inert}
      aria-hidden={inert || undefined}
      className="fixed right-0 top-14 bottom-0 w-80 z-30 bg-stone-50/85 backdrop-blur-2xl border-l border-stone-200/70 flex flex-col"
      style={{ fontFamily: "var(--font-switzer)" }}
    >
      <div className="px-4 pt-4 pb-2">
        <StatusLine status={status} />
      </div>

      {mode === "beat-sheet" ? (
        // BeatSheet brings its own gutter and scrolls its list internally.
        <div className="flex min-h-0 flex-1 flex-col pt-2">{beatSheet}</div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-6">
          <section className="space-y-2" aria-labelledby="council-heading">
            <SectionTitle
              aside={
                <button
                  type="button"
                  onClick={onOpenSynthesis}
                  className="relative inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-stone-700 hover:bg-white hover:text-stone-900"
                  aria-label={council.hasUnseen ? "Open synthesis (new results)" : "Open synthesis"}
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Open synthesis
                  {council.hasUnseen && (
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-rose-600" aria-hidden="true" />
                  )}
                </button>
              }
            >
              <span id="council-heading">Council</span>
            </SectionTitle>
            <CouncilRoster council={council} />
          </section>

          <section className="space-y-2" aria-labelledby="notes-heading">
            <SectionTitle>
              <span id="notes-heading">Notes</span>
            </SectionTitle>
            <NotesList
              groups={notes.groups}
              personas={council.personas}
              activeId={activeNoteId}
              loading={notes.loading}
              error={notes.error}
              onSelect={onSelectNote}
              onConsult={council.isRunning ? undefined : onConsult}
              onRetry={() => void notes.refresh()}
            />
          </section>

          <section className="space-y-2" aria-labelledby="facts-heading">
            <SectionTitle>
              <span id="facts-heading">Fact notes</span>
            </SectionTitle>
            {facts}
          </section>

          <ContextEditor
            context={brief.context}
            onChange={brief.onChange}
            onCommit={brief.onCommit}
            targetLength={brief.targetLength}
            onTargetLengthChange={brief.onTargetLengthChange}
          />
        </div>
      )}
    </aside>
  );
}
