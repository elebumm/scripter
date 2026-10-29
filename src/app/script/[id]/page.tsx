"use client";

import { Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { Editor } from "@tiptap/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader, FactCheckButton, ScriptMenu, type WorkspaceMode } from "@/components/layout/AppHeader";
import { RevisionSidebar, type DraftStatus } from "@/components/layout/RevisionSidebar";
import { EditorPane } from "@/components/editor/EditorPane";
import { AnchoredCard } from "@/components/editor/AnchoredCard";
import { scrollToAnchor, type Annotation } from "@/components/editor/annotations-extension";
import { getReviewableSection, type ReviewSection } from "@/components/editor/section";
import { ConsultButton } from "@/components/council/ConsultButton";
import { NoteCard } from "@/components/council/NoteCard";
import { lensChipsForNote } from "@/components/council/lens-chips";
import { SynthesisPanel } from "@/components/evaluation/SynthesisPanel";
import { VersionTimeline } from "@/components/diff/VersionTimeline";
import { RESTORE_ABORTED_MESSAGE, restoreDraft, restoredMessage } from "@/components/diff/restore";
import { BeatSheet } from "@/components/beats/BeatSheet";
import { KickoffDialog } from "@/components/kickoff/KickoffDialog";
import { FactNoteCard } from "@/components/factcheck/FactNoteCard";
import { FactNotesList } from "@/components/factcheck/FactNotesList";
import { describeFactRun, needsReview } from "@/components/factcheck/verdicts";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useScript } from "@/hooks/useScript";
import { useCouncil } from "@/hooks/useCouncil";
import { isAnchorStale, useNotes } from "@/hooks/useNotes";
import { useFactCheck } from "@/hooks/useFactCheck";
import { useTargetLength } from "@/hooks/useTargetLength";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useAppStore } from "@/stores/app-store";
import { countSpokenWords, estimateRuntimeSeconds, firstH1Text, formatRuntime } from "@/lib/utils/reading-time";
import { markdownToPlain } from "@/lib/text/anchor";
import { buildNotesExport, downloadMarkdown, scriptFilename } from "@/lib/utils/export";
import { displayTitle as titleFor, headingTitle } from "@/lib/utils/titles";

function PageMessage({ title, detail, busy }: { title: string; detail?: string; busy?: boolean }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-[#f9f9f9] px-6 text-center">
      {busy && <Loader2 className="h-5 w-5 text-stone-500 motion-safe:animate-spin" aria-hidden="true" />}
      <p className="text-sm font-semibold text-stone-800" style={{ fontFamily: "var(--font-switzer)" }} role="status">
        {title}
      </p>
      {detail && <p className="max-w-md text-xs text-stone-600">{detail}</p>}
      {!busy && (
        <Link href="/" className="text-xs font-semibold text-stone-800 underline underline-offset-4">
          Back to Drafts
        </Link>
      )}
    </div>
  );
}

export default function ScriptPage() {
  const params = useParams<{ id: string }>();
  const scriptId = Number(params.id);

  if (!Number.isInteger(scriptId) || scriptId <= 0) {
    return <PageMessage title="Script not found" detail="This link doesn't point to a script." />;
  }

  return (
    <Suspense fallback={<PageMessage title="Loading…" busy />}>
      {/* Keyed so every hook starts fresh when moving between scripts. */}
      <ScriptWorkspace key={scriptId} scriptId={scriptId} />
    </Suspense>
  );
}

function ScriptWorkspace({ scriptId }: { scriptId: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // New scripts created with "Suggest beats from my brief" land on ?beats=suggest.
  const suggestBeatsOnOpen = searchParams.get("beats") === "suggest";

  const [mode, setMode] = useState<WorkspaceMode>(suggestBeatsOnOpen ? "beat-sheet" : "revision");
  const [autoSuggestBeats, setAutoSuggestBeats] = useState(suggestBeatsOnOpen);
  const [editor, setEditor] = useState<Editor | null>(null);
  /** The open card: "note:12" | "fact:7". */
  const [activeId, setActiveId] = useState<string | null>(null);
  /** Move focus into the card (opened from a list rather than the text). */
  const [cardFocus, setCardFocus] = useState(false);
  const [synthesisOpen, setSynthesisOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [kickoffOpen, setKickoffOpen] = useState(false);
  /** Passage briefly highlighted after jumping to a beat. */
  const [beatFocus, setBeatFocus] = useState<string | null>(null);
  const pendingJump = useRef<string | null>(null);
  const beatFocusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editorMode = useAppStore((s) => s.editorMode);
  const setEditorMode = useAppStore((s) => s.setEditorMode);
  const wordsPerMinute = useAppStore((s) => s.wordsPerMinute);

  const draft = useScript(scriptId);
  const notes = useNotes(scriptId, draft.content);
  const factCheck = useFactCheck(scriptId);

  const refreshNotes = notes.refresh;
  const handleNotesChanged = useCallback(() => {
    void refreshNotes();
    toast.success("The council has finished.", {
      action: { label: "Open synthesis", onClick: () => setSynthesisOpen(true) },
    });
  }, [refreshNotes]);

  const council = useCouncil(scriptId, { saveVersion: draft.saveVersion, onNotesChanged: handleNotesChanged });

  // Drop ?beats=suggest once read, so a reload doesn't propose beats again.
  useEffect(() => {
    if (suggestBeatsOnOpen) router.replace(`/script/${scriptId}`, { scroll: false });
  }, [suggestBeatsOnOpen, router, scriptId]);

  // --- Derived text state (trails typing slightly) ---------------------------
  const deferredContent = useDeferredValue(draft.content);
  const spokenWords = useMemo(() => countSpokenWords(deferredContent), [deferredContent]);
  const plainText = useMemo(() => markdownToPlain(deferredContent), [deferredContent]);
  const staleFactIds = useMemo(
    () => new Set(factCheck.notes.filter((f) => isAnchorStale(plainText, f.claimText)).map((f) => f.id)),
    [factCheck.notes, plainText]
  );
  // The draft's first `# Heading` (a template's `# [Title]` placeholder isn't one), used until the writer sets a title.
  const h1 = useMemo(() => headingTitle(firstH1Text(deferredContent)), [deferredContent]);

  const { targetWords, setTargetWords } = useTargetLength(scriptId, draft.script?.targetLength ?? null);
  const status: DraftStatus = {
    draftNumber: draft.draftNumber,
    saveState: draft.saveState,
    spokenWords,
    runtime: formatRuntime(estimateRuntimeSeconds(spokenWords, wordsPerMinute)),
    targetRuntime: targetWords ? formatRuntime(estimateRuntimeSeconds(targetWords, wordsPerMinute)) : null,
  };

  const annotations = useMemo<Annotation[]>(() => {
    const list: Annotation[] = [];
    for (const n of notes.notes) {
      if (n.status !== "open" || n.isStale) continue;
      const id = `note:${n.id}`;
      list.push({ id, kind: "note", anchorText: n.anchorText, priority: n.priority, active: activeId === id });
    }
    for (const f of factCheck.notes) {
      if (staleFactIds.has(f.id)) continue;
      const id = `fact:${f.id}`;
      // Only claims still to review are underlined; the open card's claim always is.
      if (!needsReview(f) && activeId !== id) continue;
      list.push({ id, kind: "fact", anchorText: f.claimText, active: activeId === id });
    }
    if (beatFocus) list.push({ id: "beat:focus", kind: "beat", anchorText: beatFocus, active: true });
    return list;
  }, [notes.notes, factCheck.notes, staleFactIds, activeId, beatFocus]);

  // --- Editor navigation ------------------------------------------------------
  const handleEditorReady = useCallback((ed: Editor | null) => {
    setEditor(ed);
    const anchor = pendingJump.current;
    if (ed && anchor) {
      pendingJump.current = null;
      // Let the editor load its content and highlights first.
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToAnchor(ed, anchor)));
    }
  }, []);

  /** Scroll the editor to a passage; switches out of markdown mode if needed. */
  const jumpTo = useCallback(
    (anchorText: string) => {
      if (editorMode === "markdown" || !editor) {
        pendingJump.current = anchorText;
        setEditorMode("wysiwyg");
        return true;
      }
      return scrollToAnchor(editor, anchorText);
    },
    [editor, editorMode, setEditorMode]
  );

  const selectNote = useCallback(
    (id: number) => {
      const note = notes.notes.find((n) => n.id === id);
      if (!note) return;
      setActiveId(`note:${id}`);
      setCardFocus(true);
      if (!note.isStale) jumpTo(note.anchorText);
    },
    [notes.notes, jumpTo]
  );

  const selectFact = useCallback(
    (id: number) => {
      const fact = factCheck.notes.find((f) => f.id === id);
      if (!fact) return;
      setActiveId(`fact:${id}`);
      setCardFocus(true);
      if (!staleFactIds.has(id)) jumpTo(fact.claimText);
    },
    [factCheck.notes, staleFactIds, jumpTo]
  );

  const handleAnnotationClick = useCallback((id: string | null) => {
    if (id?.startsWith("beat:")) return;
    setCardFocus(false);
    setActiveId((current) => (id === null || current === id ? null : id));
  }, []);

  const handleJumpToBeat = useCallback(
    (anchorText: string) => {
      setBeatFocus(anchorText);
      if (beatFocusTimer.current) clearTimeout(beatFocusTimer.current);
      beatFocusTimer.current = setTimeout(() => setBeatFocus(null), 4000);
      if (!jumpTo(anchorText)) toast("That passage is no longer in the draft.");
    },
    [jumpTo]
  );

  const closeCard = useCallback(() => setActiveId(null), []);

  // --- Actions ----------------------------------------------------------------
  const { saveVersion, setContent } = draft;
  const startCouncil = council.start;
  const councilRunning = council.isRunning;

  const consult = useCallback(
    (section?: ReviewSection) => {
      if (councilRunning) return;
      void startCouncil(section ? { sectionOnly: section.text, scopeLabel: `Section: ${section.label}` } : undefined);
    },
    [councilRunning, startCouncil]
  );

  const getSection = useCallback(() => (editor ? getReviewableSection(editor.state) : null), [editor]);

  const factCheckRunning = factCheck.status === "running";
  const runFactCheckOnVersion = factCheck.run;
  const runFactCheck = useCallback(async () => {
    if (factCheckRunning) return;
    const version = await saveVersion();
    if (!version) return;
    const finished = await runFactCheckOnVersion(version.id);
    if (!finished) return;
    // Also said when the run kept no claims, so it never looks like nothing ran.
    if (finished.claimsSaved > 0) toast.success(describeFactRun(finished));
    else toast(describeFactRun(finished));
  }, [factCheckRunning, saveVersion, runFactCheckOnVersion]);

  const handleSaveVersion = useCallback(async () => {
    const version = await saveVersion();
    if (version) {
      toast.success(version.created ? `Saved as version ${version.version}` : `No changes since version ${version.version}`);
    }
  }, [saveVersion]);

  const openSynthesis = useCallback(() => {
    setSynthesisOpen(true);
    council.markSeen();
  }, [council]);

  const restoreVersion = useCallback(
    async (content: string, saveDraftFirst: boolean) => {
      // A draft in no saved version is kept as one first; if that fails, the
      // draft is left untouched so restoring never loses words.
      const result = await restoreDraft(
        saveDraftFirst,
        () => saveVersion({ quiet: true }),
        () => {
          setContent(content);
          setHistoryOpen(false);
          setActiveId(null);
        }
      );
      if (result.restored) toast.success(restoredMessage(result.kept));
      else toast.error(RESTORE_ABORTED_MESSAGE);
    },
    [saveVersion, setContent]
  );

  const handleCreated = useCallback(
    (id: number, opts: { suggestBeats: boolean }) => {
      setKickoffOpen(false);
      router.push(`/script/${id}${opts.suggestBeats ? "?beats=suggest" : ""}`);
    },
    [router]
  );

  const changeMode = useCallback((next: WorkspaceMode) => {
    setMode(next);
    setAutoSuggestBeats(false);
  }, []);

  // The legacy "Untitled Script" default counts as no title.
  const displayTitle = titleFor(draft.title, h1);

  const exportDraft = () => downloadMarkdown(scriptFilename(displayTitle), draft.content);
  const exportWithNotes = () =>
    downloadMarkdown(
      scriptFilename(displayTitle, "notes"),
      buildNotesExport({
        title: displayTitle,
        content: draft.content,
        notes: notes.notes,
        factNotes: factCheck.notes,
        lensNames: (n) =>
          lensChipsForNote(n, council.personas).map((c) => (c.model ? `${c.persona} (${c.model})` : c.persona)),
      })
    );

  useKeyboardShortcuts({
    onConsult: () => consult(),
    onSaveVersion: () => void handleSaveVersion(),
    onFactCheck: () => void runFactCheck(),
    onNewScript: () => setKickoffOpen(true),
    onViewWysiwyg: () => setEditorMode("wysiwyg"),
    onViewMarkdown: () => setEditorMode("markdown"),
  });

  // --- Render -----------------------------------------------------------------
  if (draft.loadError) {
    return <PageMessage title="Couldn't open this script" detail={draft.loadError} />;
  }
  if (draft.loading || !draft.script) {
    return <PageMessage title="Opening your script…" busy />;
  }

  const settledLenses = council.lenses.filter((l) => l.status === "complete" || l.status === "error").length;
  const progressLabel =
    council.phase === "synthesizing"
      ? "synthesis"
      : council.phase === "critiquing"
        ? `${settledLenses}/${council.lenses.length}`
        : null;

  const activeNote = activeId?.startsWith("note:") ? (notes.notes.find((n) => `note:${n.id}` === activeId) ?? null) : null;
  const activeFact = activeId?.startsWith("fact:")
    ? (factCheck.notes.find((f) => `fact:${f.id}` === activeId) ?? null)
    : null;

  let overlay: ReactNode = null;
  if (editor && activeId && activeNote) {
    overlay = (
      <AnchoredCard editor={editor} annotationId={activeId} label="Council note" onClose={closeCard} autoFocus={cardFocus}>
        <NoteCard
          note={activeNote}
          personas={council.personas}
          onAddress={() => {
            void notes.setStatus(activeNote.id, "addressed");
            closeCard();
          }}
          onDismiss={() => {
            void notes.setStatus(activeNote.id, "dismissed");
            closeCard();
          }}
          onReopen={() => void notes.setStatus(activeNote.id, "open")}
          onClose={closeCard}
        />
      </AnchoredCard>
    );
  } else if (editor && activeId && activeFact) {
    overlay = (
      <AnchoredCard editor={editor} annotationId={activeId} label="Fact note" onClose={closeCard} autoFocus={cardFocus}>
        <FactNoteCard
          note={activeFact}
          isStale={staleFactIds.has(activeFact.id)}
          onAcknowledge={() => {
            void factCheck.setStatus(activeFact.id, "acknowledged");
            closeCard();
          }}
          onDismiss={() => {
            void factCheck.setStatus(activeFact.id, "dismissed");
            closeCard();
          }}
          onReopen={() => void factCheck.setStatus(activeFact.id, "pending")}
          onClose={closeCard}
        />
      </AnchoredCard>
    );
  }

  const facts = (
    <div className="space-y-2">
      {factCheckRunning && (
        <p role="status" className="flex items-center gap-2 px-1 text-xs text-stone-600">
          <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
          Checking claims against sources
          {factCheck.claimsFound > 0 ? ` · ${factCheck.claimsFound} found so far` : "…"}
        </p>
      )}
      {factCheck.status === "error" && factCheck.error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800">
          Fact-check failed: {factCheck.error}
        </p>
      )}
      {(!factCheckRunning || factCheck.notes.length > 0) && (
        <FactNotesList
          notes={factCheck.notes}
          staleIds={staleFactIds}
          onSelect={selectFact}
          loading={factCheck.loading}
          loadError={factCheck.loadError}
          onRetry={() => void factCheck.refresh()}
          lastRun={factCheck.status === "complete" ? factCheck.lastRun : null}
        />
      )}
    </div>
  );

  return (
    <div className="h-screen bg-[#f9f9f9] overflow-hidden flex flex-col">
      <AppHeader
        mode={mode}
        onModeChange={changeMode}
        actions={
          <>
            <ConsultButton
              isRunning={council.isRunning}
              progressLabel={progressLabel}
              scopeLabel={council.isRunning ? council.runScopeLabel : "Whole script"}
              getSection={getSection}
              onConsult={consult}
              onStop={council.stop}
            />
            <FactCheckButton running={factCheckRunning} onRun={() => void runFactCheck()} onStop={factCheck.abort} />
            <ScriptMenu
              markdownMode={editorMode === "markdown"}
              onToggleMarkdownMode={(on) => setEditorMode(on ? "markdown" : "wysiwyg")}
              onExportDraft={exportDraft}
              onExportWithNotes={exportWithNotes}
              onSaveVersion={() => void handleSaveVersion()}
              onOpenHistory={() => setHistoryOpen(true)}
              onNewScript={() => setKickoffOpen(true)}
            />
          </>
        }
      />

      <div className="flex-1 flex pt-14 min-h-0">
        <main className="flex-1 overflow-auto pb-32 pl-4 pr-[21rem] md:pl-12 md:pr-[23rem]">
          <div className="max-w-[800px] mx-auto pt-8">
            <input
              value={draft.title}
              onChange={(e) => draft.setTitle(e.target.value)}
              onBlur={draft.commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  draft.commitTitle();
                  editor?.commands.focus("start");
                }
              }}
              aria-label="Script title"
              data-quiet-focus=""
              className="w-full bg-transparent text-3xl font-bold outline-none placeholder:text-stone-500 text-stone-800 mb-8"
              placeholder={h1 || "Untitled script"}
              style={{ fontFamily: "var(--font-cabinet)" }}
            />

            <EditorPane
              content={draft.content}
              onChange={setContent}
              annotations={annotations}
              onAnnotationClick={handleAnnotationClick}
              onEditorReady={handleEditorReady}
              overlay={overlay}
            />
          </div>
        </main>

        <RevisionSidebar
          mode={mode}
          beatSheet={
            <BeatSheet
              scriptId={scriptId}
              content={draft.content}
              autoSuggest={autoSuggestBeats}
              onJumpToAnchor={handleJumpToBeat}
              saveVersion={saveVersion}
            />
          }
          status={status}
          council={council}
          inert={synthesisOpen}
          onConsult={() => consult()}
          onOpenSynthesis={openSynthesis}
          brief={{
            context: draft.context,
            onChange: draft.setContext,
            onCommit: draft.commitContext,
            targetLength: targetWords,
            onTargetLengthChange: setTargetWords,
          }}
          notes={notes}
          activeNoteId={activeNote?.id ?? null}
          onSelectNote={selectNote}
          facts={facts}
        />
      </div>

      <SynthesisPanel open={synthesisOpen} onOpenChange={setSynthesisOpen} scriptId={scriptId} council={council} />

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 gap-0">
          <SheetHeader className="px-6 pt-6 pb-3">
            <SheetTitle style={{ fontFamily: "var(--font-cabinet)" }}>Version history</SheetTitle>
            <SheetDescription className="text-stone-600">
              Saved versions never change. Restoring copies one into your draft; a draft that isn&apos;t in any saved
              version yet is saved as one first, and if that fails nothing is restored.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {historyOpen && (
              <VersionTimeline
                scriptId={scriptId}
                currentContent={draft.content}
                onRestore={(content, saveDraftFirst) => void restoreVersion(content, saveDraftFirst)}
                onSaveVersion={handleSaveVersion}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <KickoffDialog open={kickoffOpen} onOpenChange={setKickoffOpen} onCreated={handleCreated} />
    </div>
  );
}
