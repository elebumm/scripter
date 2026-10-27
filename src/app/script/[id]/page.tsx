"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { RevisionSidebar } from "@/components/layout/RevisionSidebar";
import { EditorPane } from "@/components/editor/EditorPane";
import { SynthesisPanel } from "@/components/evaluation/SynthesisPanel";
import { ScriptList } from "@/components/scripts/ScriptList";
import { KickoffDialog } from "@/components/kickoff/KickoffDialog";
import { useScript } from "@/hooks/useScript";
import { useEvaluation } from "@/hooks/useEvaluation";
import { useSuggestions } from "@/hooks/useSuggestions";
import { useFactCheck } from "@/hooks/useFactCheck";
import { useFactIssues } from "@/hooks/useFactIssues";
import { useDirectionAnalysis } from "@/hooks/useDirectionAnalysis";
import { useDirections } from "@/hooks/useDirections";
import { useAppStore } from "@/stores/app-store";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { toast } from "sonner";
import * as api from "@/lib/api";
import type { DirectionType } from "@/types";

export default function ScriptPage() {
  const params = useParams();
  const router = useRouter();
  const scriptId = Number(params.id);

  const {
    script,
    version,
    content,
    context,
    loading,
    autoSaving,
    isDirty,
    setContent,
    setContext,
    loadScript,
    createScript,
    createScriptWithData,
    updateTitle,
    saveContent,
    closeScript,
    deleteScript,
  } = useScript(scriptId);

  const {
    modelStates,
    masterSummary,
    isRunning,
    run,
    abort,
    retryModel,
    completedCount,
    totalCount,
    getActiveModels,
  } = useEvaluation();

  const {
    activeSuggestionId,
    setActiveSuggestionId,
    fetchSuggestions,
    acceptSuggestion,
    dismissSuggestion,
    getSuggestionsWithStaleness,
    clearSuggestions,
  } = useSuggestions({
    onAccept: (_id, newContent) => {
      setContent(newContent);
      toast.success("Suggestion applied");
    },
  });

  const {
    summary: factCheckSummary,
    isRunning: isFactCheckRunning,
    run: runFactCheck,
    abort: abortFactCheck,
    totalCount: factCheckTotalCount,
  } = useFactCheck();

  const {
    activeFactIssueId,
    setActiveFactIssueId,
    fetchFactIssues,
    getFactIssuesWithStaleness,
    clearFactIssues,
  } = useFactIssues({
    onCorrect: (_id, newContent) => {
      setContent(newContent);
      toast.success("Correction applied");
    },
  });

  const {
    summary: directionSummary,
    isRunning: isDirectionsRunning,
    totalCount: directionTotalCount,
  } = useDirectionAnalysis();

  const {
    activeDirectionId,
    setActiveDirectionId,
    fetchDirections,
    acceptDirection,
    dismissDirection,
    modifyDirection,
    getDirectionsWithStaleness,
  } = useDirections();

  const {
    selectedProfileId,
    setScriptListOpen,
    scriptListOpen,
    setEditorMode,
    evalDrawerOpen,
    setEvalDrawerOpen,
    setDrawerView,
  } = useAppStore();
  const [kickoffOpen, setKickoffOpen] = useState(false);

  // Fetch suggestions when summary completes
  useEffect(() => {
    if (masterSummary.status === "complete" && script && version) {
      fetchSuggestions(script.id, version.id);
    }
  }, [masterSummary.status, script, version, fetchSuggestions]);

  // Fetch fact issues when fact check summary completes
  useEffect(() => {
    if (factCheckSummary.status === "complete" && script && version) {
      fetchFactIssues(script.id, version.id);
    }
  }, [factCheckSummary.status, script, version, fetchFactIssues]);

  // Fetch directions when direction summary completes
  useEffect(() => {
    if (directionSummary.status === "complete" && script && version) {
      fetchDirections(script.id, version.id);
    }
  }, [directionSummary.status, script, version, fetchDirections]);

  const factIssuesWithStaleness = getFactIssuesWithStaleness(content);
  const suggestionsWithStaleness = getSuggestionsWithStaleness(content);
  const directionsWithStaleness = getDirectionsWithStaleness(content);

  // Track last eval context for retry
  const lastEvalRef = useRef<{
    scriptId: number;
    versionId: number;
    profilePrompt?: string;
    scriptContext?: string;
  } | null>(null);

  const handleEvaluate = useCallback(async () => {
    if (!script || !content.trim()) return;
    clearSuggestions();
    const ver = await saveContent();
    if (!ver) return;

    let profilePrompt: string | undefined;
    if (selectedProfileId) {
      try {
        const profile = await api.getProfile(selectedProfileId);
        if (profile) profilePrompt = profile.systemPrompt;
      } catch { /* use default */ }
    }

    lastEvalRef.current = {
      scriptId: script.id,
      versionId: ver.id,
      profilePrompt,
      scriptContext: context || undefined,
    };

    run(content, script.id, ver.id, profilePrompt, context || undefined, script.status ?? "draft");
  }, [script, content, context, saveContent, selectedProfileId, run, clearSuggestions]);

  const handleFactCheck = useCallback(async () => {
    if (!script || !content.trim()) return;
    clearFactIssues();
    const ver = await saveContent();
    if (!ver) return;
    runFactCheck(content, script.id, ver.id);
  }, [script, content, saveContent, runFactCheck, clearFactIssues]);

  // Auto-open drawer when evaluation finishes
  const prevRunningRef = useRef(false);
  useEffect(() => {
    if (prevRunningRef.current && !isRunning && totalCount > 0) {
      const errorCount = Object.values(modelStates).filter((m) => m.status === "error").length;
      const successCount = completedCount - errorCount;
      if (errorCount > 0) {
        toast.error(`Evaluation done — ${successCount} succeeded, ${errorCount} failed`);
      } else {
        toast.success(`Evaluation complete — ${successCount} models finished`);
      }
      setEvalDrawerOpen(true);
    }
    prevRunningRef.current = isRunning;
  }, [isRunning, totalCount, completedCount, modelStates, setEvalDrawerOpen]);

  useEffect(() => {
    if (isRunning) setEvalDrawerOpen(true);
  }, [isRunning, setEvalDrawerOpen]);

  // Auto-open drawer when fact check starts or finishes
  const prevFCRef = useRef(false);
  useEffect(() => {
    if (isFactCheckRunning) { setEvalDrawerOpen(true); setDrawerView("factcheck"); }
    if (prevFCRef.current && !isFactCheckRunning && factCheckTotalCount > 0) {
      toast.success("Fact check complete");
      setEvalDrawerOpen(true);
    }
    prevFCRef.current = isFactCheckRunning;
  }, [isFactCheckRunning, factCheckTotalCount, setEvalDrawerOpen, setDrawerView]);

  // Auto-open drawer when directions start or finish
  const prevDirRef = useRef(false);
  useEffect(() => {
    if (isDirectionsRunning) { setEvalDrawerOpen(true); setDrawerView("directions"); }
    if (prevDirRef.current && !isDirectionsRunning && directionTotalCount > 0) {
      toast.success("Direction analysis complete");
      setEvalDrawerOpen(true);
    }
    prevDirRef.current = isDirectionsRunning;
  }, [isDirectionsRunning, directionTotalCount, setEvalDrawerOpen, setDrawerView]);

  const handleRetryModel = useCallback(
    (modelId: string) => {
      if (!lastEvalRef.current) return;
      const { scriptId, versionId, profilePrompt, scriptContext } = lastEvalRef.current;
      retryModel(modelId, content, scriptId, versionId, profilePrompt, scriptContext);
    },
    [content, retryModel]
  );

  const handleNewScript = useCallback(() => setKickoffOpen(true), []);

  const handleKickoffSkip = useCallback(async () => {
    const data = await api.createScript();
    router.push(`/script/${data.id}`);
  }, [router]);

  const handleKickoffConfirm = useCallback(
    async (data: { title: string; content: string; context: string; targetLength: number }) => {
      const script = await api.createScript(data.title, data.content, {
        context: data.context,
        targetLength: data.targetLength,
      });
      router.push(`/script/${script.id}`);
    },
    [router]
  );

  const handleAcceptSuggestion = useCallback(
    (id: number) => acceptSuggestion(id, content),
    [acceptSuggestion, content]
  );

  const handleDismissSuggestion = useCallback(
    (id: number) => { dismissSuggestion(id); toast("Suggestion dismissed"); },
    [dismissSuggestion]
  );

  const handleSaveVersion = useCallback(async () => {
    const ver = await saveContent();
    if (ver) toast.success("Version saved");
  }, [saveContent]);

  const handleClickSuggestion = useCallback(
    (id: number | null) => setActiveSuggestionId(id !== null && activeSuggestionId === id ? null : id),
    [activeSuggestionId, setActiveSuggestionId]
  );

  const handleClickFactIssue = useCallback(
    (id: number | null) => setActiveFactIssueId(id !== null && activeFactIssueId === id ? null : id),
    [activeFactIssueId, setActiveFactIssueId]
  );

  const handleClickDirection = useCallback(
    (id: number | null) => setActiveDirectionId(id !== null && activeDirectionId === id ? null : id),
    [activeDirectionId, setActiveDirectionId]
  );

  const handleAcceptDirection = useCallback(
    (id: number) => { acceptDirection(id); toast("Direction accepted"); },
    [acceptDirection]
  );

  const handleModifyDirection = useCallback(
    (id: number, newType: DirectionType) => { modifyDirection(id, newType); toast("Direction modified"); },
    [modifyDirection]
  );

  const handleDismissDirection = useCallback(
    (id: number) => { dismissDirection(id); toast("Direction dismissed"); },
    [dismissDirection]
  );

  const handleOpenFile = useCallback(async () => {
    const result = await api.openFile();
    if (result) router.push(`/script/${result.scriptId}`);
  }, [router]);

  const handleSaveAs = useCallback(async () => {
    if (!script) return;
    await api.saveFileAs(script.id);
  }, [script]);

  const handleGoToDrafts = useCallback(() => {
    closeScript();
    router.push("/");
  }, [closeScript, router]);

  useKeyboardShortcuts({
    onNewScript: handleNewScript,
    onOpenFile: handleOpenFile,
    onSaveVersion: handleSaveVersion,
    onSaveAs: handleSaveAs,
    onEvaluate: handleEvaluate,
    onAbort: abort,
    onToggleScriptList: () => setScriptListOpen(!scriptListOpen),
    onViewWysiwyg: () => setEditorMode("wysiwyg"),
    onViewMarkdown: () => setEditorMode("markdown"),
  });

  const saveStatus = autoSaving ? "saving" : isDirty ? "unsaved" : "saved";

  const sidebarModelStates =
    Object.keys(modelStates).length > 0
      ? modelStates
      : Object.fromEntries(
          getActiveModels().map((m) => [
            m.id,
            { modelId: m.id, modelName: m.name, status: "idle" as const, text: "" },
          ])
        );

  if (loading || !script) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f9f9f9]">
        <p className="text-stone-400 text-sm" style={{ fontFamily: "var(--font-switzer)" }}>
          Loading...
        </p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#f9f9f9] overflow-hidden flex flex-col">
      <AppHeader onGoToDrafts={handleGoToDrafts} />
      <ScriptList onSelectScript={(id) => router.push(`/script/${id}`)} />

      <div className="flex-1 flex pt-14 min-h-0">
        <main className="flex-1 overflow-auto pr-80 pb-32 px-4 md:px-12">
          <div className="max-w-[800px] mx-auto pt-8">
            <input
              value={script.title}
              onChange={(e) => updateTitle(e.target.value)}
              className="w-full bg-transparent text-3xl font-bold outline-none placeholder:text-stone-300 text-stone-800 mb-8"
              placeholder="Untitled Script"
              style={{ fontFamily: "var(--font-cabinet)" }}
            />

            <EditorPane
              content={content}
              onChange={setContent}
              suggestions={suggestionsWithStaleness}
              activeSuggestionId={activeSuggestionId}
              onClickSuggestion={handleClickSuggestion}
              onAcceptSuggestion={handleAcceptSuggestion}
              onDismissSuggestion={handleDismissSuggestion}
              factIssues={factIssuesWithStaleness}
              activeFactIssueId={activeFactIssueId}
              onClickFactIssue={handleClickFactIssue}
              directions={directionsWithStaleness}
              activeDirectionId={activeDirectionId}
              onClickDirection={handleClickDirection}
              onAcceptDirection={handleAcceptDirection}
              onModifyDirection={handleModifyDirection}
              onDismissDirection={handleDismissDirection}
            />
          </div>
        </main>

        <RevisionSidebar
          scriptTitle={script.title}
          pendingSuggestionsCount={
            suggestionsWithStaleness.filter((s) => !s.isStale && s.status === "pending").length
          }
          isRunning={isRunning}
          onGoToDrafts={handleGoToDrafts}
        />
      </div>

      <SynthesisPanel
        open={evalDrawerOpen}
        onOpenChange={setEvalDrawerOpen}
        modelStates={sidebarModelStates}
        masterSummary={masterSummary}
        isRunning={isRunning}
        completedCount={completedCount}
        totalCount={totalCount}
        onRetryModel={handleRetryModel}
        onReEvaluate={handleEvaluate}
        scriptId={script?.id ?? null}
      />

      <KickoffDialog
        open={kickoffOpen}
        onOpenChange={setKickoffOpen}
        onSkip={handleKickoffSkip}
        onConfirm={handleKickoffConfirm}
      />
    </div>
  );
}
