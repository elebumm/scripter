"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { EditorPane } from "@/components/editor/EditorPane";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { ContextEditor } from "@/components/editor/ContextEditor";
import { EvaluationDrawer } from "@/components/evaluation/EvaluationDrawer";
import { ScriptList } from "@/components/scripts/ScriptList";
import { KickoffDialog } from "@/components/kickoff/KickoffDialog";
import { useScript } from "@/hooks/useScript";
import { useEvaluation } from "@/hooks/useEvaluation";
import { useSuggestions } from "@/hooks/useSuggestions";
import { useFactCheck } from "@/hooks/useFactCheck";
import { useFactIssues } from "@/hooks/useFactIssues";
import { useAppStore } from "@/stores/app-store";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { getWordCount, getVideoRuntime } from "@/lib/utils/reading-time";
import { toast } from "sonner";
import * as api from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WordCountProgress } from "@/components/editor/WordCountProgress";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { TagEditor } from "@/components/scripts/TagEditor";
import type { Tag } from "@/types";

export default function Home() {
  const {
    script,
    version,
    content,
    context,
    loading,
    saving,
    autoSaving,
    isDirty,
    setContent,
    setContext,
    loadScript,
    createScript,
    createScriptWithData,
    updateTitle,
    updateStatus,
    saveContent,
    deleteScript,
  } = useScript();

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
    suggestions,
    loading: suggestionsLoading,
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
    modelStates: factCheckModelStates,
    summary: factCheckSummary,
    isRunning: isFactCheckRunning,
    run: runFactCheck,
    abort: abortFactCheck,
    completedCount: factCheckCompletedCount,
    totalCount: factCheckTotalCount,
  } = useFactCheck();

  const {
    factIssues,
    activeFactIssueId,
    setActiveFactIssueId,
    fetchFactIssues,
    acknowledgeIssue,
    dismissIssue,
    correctIssue,
    getFactIssuesWithStaleness,
    clearFactIssues,
  } = useFactIssues({
    onCorrect: (_id, newContent) => {
      setContent(newContent);
      toast.success("Correction applied");
    },
  });

  const {
    selectedProfileId,
    setScriptListOpen,
    scriptListOpen,
    setEditorMode,
    evalDrawerOpen,
    setEvalDrawerOpen,
    setFactCheckDrawerView,
  } = useAppStore();
  const [initialized, setInitialized] = useState(false);
  const [kickoffOpen, setKickoffOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scriptTags, setScriptTags] = useState<Tag[]>([]);

  // Trigger DB init on first load (web mode only; Electron inits in main process)
  useEffect(() => {
    if (!initialized) {
      api.listScripts().then(() => setInitialized(true)).catch(() => {});
    }
  }, [initialized]);

  // Fetch tags when script changes
  useEffect(() => {
    if (script) {
      api.getScriptTags(script.id).then(setScriptTags).catch(() => setScriptTags([]));
    } else {
      setScriptTags([]);
    }
  }, [script?.id]);

  // Fetch suggestions when summary completes
  useEffect(() => {
    if (
      masterSummary.status === "complete" &&
      script &&
      version
    ) {
      fetchSuggestions(script.id, version.id);
    }
  }, [masterSummary.status, script, version, fetchSuggestions]);

  // Fetch fact issues when fact check summary completes
  useEffect(() => {
    if (
      factCheckSummary.status === "complete" &&
      script &&
      version
    ) {
      fetchFactIssues(script.id, version.id);
    }
  }, [factCheckSummary.status, script, version, fetchFactIssues]);

  const factIssuesWithStaleness = getFactIssuesWithStaleness(content);
  const pendingFactIssuesCount = factIssuesWithStaleness.filter(
    (i) => i.status === "pending"
  ).length;

  const suggestionsWithStaleness = getSuggestionsWithStaleness(content);
  const pendingSuggestionsCount = suggestionsWithStaleness.filter(
    (s) => s.status === "pending"
  ).length;

  // Track last eval context for retry
  const lastEvalRef = useRef<{
    scriptId: number;
    versionId: number;
    profilePrompt?: string;
    scriptContext?: string;
  } | null>(null);

  const handleFactCheck = useCallback(async () => {
    if (!script || !content.trim()) return;

    clearFactIssues();

    const ver = await saveContent();
    if (!ver) return;

    setEvalDrawerOpen(true);
    setFactCheckDrawerView("factcheck");

    runFactCheck(content, script.id, ver.id, context || undefined);
  }, [script, content, context, saveContent, runFactCheck, clearFactIssues, setEvalDrawerOpen, setFactCheckDrawerView]);

  const handleEvaluate = useCallback(async () => {
    if (!script || !content.trim()) return;

    clearSuggestions();

    const ver = await saveContent();
    if (!ver) return;

    let profilePrompt: string | undefined;
    if (selectedProfileId) {
      try {
        const profile = await api.getProfile(selectedProfileId);
        if (profile) {
          profilePrompt = profile.systemPrompt;
        }
      } catch {
        // use default
      }
    }

    lastEvalRef.current = {
      scriptId: script.id,
      versionId: ver.id,
      profilePrompt,
      scriptContext: context || undefined,
    };

    run(content, script.id, ver.id, profilePrompt, context || undefined, script.status ?? "draft");
  }, [script, content, context, saveContent, selectedProfileId, run, clearSuggestions]);

  // Auto-open drawer when evaluation finishes + toast
  const prevRunningRef = useRef(false);
  useEffect(() => {
    if (prevRunningRef.current && !isRunning && totalCount > 0) {
      const errorCount = Object.values(modelStates).filter(
        (m) => m.status === "error"
      ).length;
      const successCount = completedCount - errorCount;
      if (errorCount > 0) {
        toast.error(
          `Evaluation done — ${successCount} succeeded, ${errorCount} failed`
        );
      } else {
        toast.success(`Evaluation complete — ${successCount} models finished`);
      }
      // Auto-open the drawer on completion
      setEvalDrawerOpen(true);
    }
    prevRunningRef.current = isRunning;
  }, [isRunning, totalCount, completedCount, modelStates, setEvalDrawerOpen]);

  // Also open drawer when eval starts
  useEffect(() => {
    if (isRunning) {
      setEvalDrawerOpen(true);
    }
  }, [isRunning, setEvalDrawerOpen]);

  // Auto-open drawer when fact check starts or finishes
  const prevFactCheckRunningRef = useRef(false);
  useEffect(() => {
    if (isFactCheckRunning) {
      setEvalDrawerOpen(true);
      setFactCheckDrawerView("factcheck");
    }
    if (prevFactCheckRunningRef.current && !isFactCheckRunning && factCheckTotalCount > 0) {
      toast.success("Fact check complete");
      setEvalDrawerOpen(true);
    }
    prevFactCheckRunningRef.current = isFactCheckRunning;
  }, [isFactCheckRunning, factCheckTotalCount, setEvalDrawerOpen, setFactCheckDrawerView]);

  const handleRetryModel = useCallback(
    (modelId: string) => {
      if (!lastEvalRef.current) return;
      const { scriptId, versionId, profilePrompt, scriptContext } =
        lastEvalRef.current;
      retryModel(
        modelId,
        content,
        scriptId,
        versionId,
        profilePrompt,
        scriptContext
      );
    },
    [content, retryModel]
  );

  const handleEvaluateSelection = useCallback(async () => {
    await handleEvaluate();
  }, [handleEvaluate]);

  const handleNewScript = useCallback(() => {
    setKickoffOpen(true);
  }, []);

  const handleKickoffSkip = useCallback(async () => {
    await createScript();
  }, [createScript]);

  const handleKickoffConfirm = useCallback(
    async (data: {
      title: string;
      content: string;
      context: string;
      targetLength: number;
    }) => {
      await createScriptWithData(
        data.title,
        data.content,
        data.context,
        data.targetLength
      );
    },
    [createScriptWithData]
  );

  const handleAcceptSuggestion = useCallback(
    (id: number) => {
      acceptSuggestion(id, content);
    },
    [acceptSuggestion, content]
  );

  const handleDismissSuggestion = useCallback(
    (id: number) => {
      dismissSuggestion(id);
      toast("Suggestion dismissed");
    },
    [dismissSuggestion]
  );

  const handleSaveVersion = useCallback(async () => {
    const ver = await saveContent();
    if (ver) {
      toast.success("Version saved");
    }
  }, [saveContent]);

  const handleDeleteScript = useCallback(async () => {
    await deleteScript();
    toast.success("Script deleted");
  }, [deleteScript]);

  const handleClickSuggestion = useCallback(
    (id: number | null) => {
      setActiveSuggestionId(
        id !== null && activeSuggestionId === id ? null : id
      );
    },
    [activeSuggestionId, setActiveSuggestionId]
  );

  const handleClickFactIssue = useCallback(
    (id: number | null) => {
      setActiveFactIssueId(
        id !== null && activeFactIssueId === id ? null : id
      );
    },
    [activeFactIssueId, setActiveFactIssueId]
  );

  const handleCorrectFactIssue = useCallback(
    (id: number) => {
      correctIssue(id, content);
    },
    [correctIssue, content]
  );

  const handleAcknowledgeFactIssue = useCallback(
    (id: number) => {
      acknowledgeIssue(id);
      toast("Fact issue acknowledged");
    },
    [acknowledgeIssue]
  );

  const handleDismissFactIssue = useCallback(
    (id: number) => {
      dismissIssue(id);
      toast("Fact issue dismissed");
    },
    [dismissIssue]
  );

  const handleOpenFile = useCallback(async () => {
    const result = await api.openFile();
    if (result) {
      loadScript(result.scriptId);
    }
  }, [loadScript]);

  const handleSaveAs = useCallback(async () => {
    if (!script) return;
    await api.saveFileAs(script.id);
  }, [script]);

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

  const isSummarizing = masterSummary.status === "streaming";
  const hasResults =
    Object.values(modelStates).some((m) => m.status !== "idle") ||
    masterSummary.status !== "idle";
  const wordCount = getWordCount(content);

  const topBarProps = {
    onNewScript: handleNewScript,
    hasScript: !!script,
    onEvaluate: handleEvaluate,
    onAbort: abort,
    isRunning,
    hasContent: content.trim().length > 0,
    completedCount,
    totalCount,
    isSummarizing,
    onFactCheck: handleFactCheck,
    isFactCheckRunning,
    onAbortFactCheck: abortFactCheck,
    hasResults,
    evalDrawerOpen,
    onToggleEvalDrawer: () => setEvalDrawerOpen(!evalDrawerOpen),
    content,
    modelStates: Object.fromEntries(
      Object.entries(modelStates).map(([k, v]) => [
        k,
        { modelName: v.modelName, text: v.text },
      ])
    ),
    masterSummaryText: masterSummary.text,
    scriptTitle: script?.title ?? "",
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!script) {
    return (
      <div className="flex h-screen flex-col">
        <TopBar {...topBarProps} />
        <ScriptList onSelectScript={loadScript} />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-semibold">Welcome to Scripter</h2>
            <p className="text-muted-foreground">
              Create a new script or open an existing one to get started.
            </p>
            <button
              onClick={handleNewScript}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              New Script
            </button>
          </div>
        </div>
        <KickoffDialog
          open={kickoffOpen}
          onOpenChange={setKickoffOpen}
          onSkip={handleKickoffSkip}
          onConfirm={handleKickoffConfirm}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <TopBar {...topBarProps} />
      <ScriptList onSelectScript={loadScript} />

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 pt-8 pb-4">
          {/* Inline title */}
          <input
            value={script.title}
            onChange={(e) => updateTitle(e.target.value)}
            className="w-full bg-transparent text-3xl font-bold outline-none placeholder:text-muted-foreground/50"
            placeholder="Untitled Script"
          />

          {/* Metadata row */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 mb-6">
            {version !== null && <span>v{version.version}</span>}
            <span>&middot;</span>
            <Select value={script.status ?? "draft"} onValueChange={updateStatus}>
              <SelectTrigger className="h-5 w-auto gap-1 border-none bg-transparent px-1.5 text-xs text-muted-foreground hover:text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="final">Final</SelectItem>
              </SelectContent>
            </Select>
            <span>&middot;</span>
            {script.targetLength ? (
              <WordCountProgress wordCount={wordCount} targetLength={script.targetLength} />
            ) : (
              <span>{wordCount} words</span>
            )}
            <span>&middot;</span>
            <span>~{getVideoRuntime(wordCount)} video</span>
            <span>&middot;</span>
            {autoSaving ? (
              <span className="text-blue-400">Saving...</span>
            ) : isDirty ? (
              <span className="text-orange-400">Unsaved changes</span>
            ) : (
              <span className="text-green-600/70">Saved</span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 ml-auto text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>

          {/* Tags */}
          <div className="mb-4">
            <TagEditor
              scriptId={script.id}
              tags={scriptTags}
              onTagsChange={setScriptTags}
            />
          </div>

          {/* Context & Notes */}
          <ContextEditor context={context} onChange={setContext} />
        </div>

        {/* Editor area */}
        <div className="flex-1">
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
            onCorrectFactIssue={handleCorrectFactIssue}
            onAcknowledgeFactIssue={handleAcknowledgeFactIssue}
            onDismissFactIssue={handleDismissFactIssue}
          />
        </div>

        {/* Bottom status bar */}
        <div className="max-w-3xl mx-auto px-6">
          <EditorToolbar
            content={content}
            onEvaluateSelection={handleEvaluateSelection}
            isEvaluating={isRunning}
            pendingSuggestionsCount={pendingSuggestionsCount}
            pendingFactIssuesCount={pendingFactIssuesCount}
          />
        </div>
      </div>

      {/* Evaluation drawer */}
      <EvaluationDrawer
        open={evalDrawerOpen}
        onOpenChange={setEvalDrawerOpen}
        modelStates={
          Object.keys(modelStates).length > 0
            ? modelStates
            : Object.fromEntries(
                getActiveModels().map((m) => [
                  m.id,
                  {
                    modelId: m.id,
                    modelName: m.name,
                    status: "idle" as const,
                    text: "",
                  },
                ])
              )
        }
        masterSummary={masterSummary}
        isRunning={isRunning}
        completedCount={completedCount}
        totalCount={totalCount}
        onRetryModel={handleRetryModel}
        scriptId={script?.id ?? null}
        factCheckModelStates={factCheckModelStates}
        factCheckSummary={factCheckSummary}
        isFactCheckRunning={isFactCheckRunning}
        factCheckCompletedCount={factCheckCompletedCount}
        factCheckTotalCount={factCheckTotalCount}
      />

      <KickoffDialog
        open={kickoffOpen}
        onOpenChange={setKickoffOpen}
        onSkip={handleKickoffSkip}
        onConfirm={handleKickoffConfirm}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        variant="destructive"
        title="Delete script?"
        description={`This will permanently delete "${script.title}" and all its versions and evaluations. This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteScript}
      />
    </div>
  );
}
