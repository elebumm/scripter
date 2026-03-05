"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/stores/app-store";
import type { Script, ScriptVersion } from "@/types";
import * as api from "@/lib/api";

export function useScript() {
  const { currentScriptId, setCurrentScriptId } = useAppStore();
  const [script, setScript] = useState<Script | null>(null);
  const [version, setVersion] = useState<ScriptVersion | null>(null);
  const [content, setContent] = useState("");
  const [context, setContextState] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSavedContentRef = useRef<string>("");

  const loadScript = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const data = await api.getScript(id);
      setScript(data.script);
      setVersion(data.latestVersion);
      setContent(data.latestVersion?.content ?? "");
      setContextState(data.script?.context ?? "");
      lastAutoSavedContentRef.current = data.latestVersion?.content ?? "";
      setCurrentScriptId(id);
    } finally {
      setLoading(false);
    }
  }, [setCurrentScriptId]);

  const createScript = useCallback(async (title: string = "Untitled Script") => {
    const data = await api.createScript(title);
    setScript(data);
    setContent("");
    setContextState("");
    setCurrentScriptId(data.id);
    // Load full script with version
    await loadScript(data.id);
    return data;
  }, [setCurrentScriptId, loadScript]);

  const createScriptWithData = useCallback(async (
    title: string,
    content: string,
    context: string,
    targetLength: number
  ) => {
    const data = await api.createScript(title, content, { context, targetLength });
    setScript(data);
    setContent(content);
    setContextState(context);
    setCurrentScriptId(data.id);
    await loadScript(data.id);
    return data;
  }, [setCurrentScriptId, loadScript]);

  const updateTitle = useCallback(async (title: string) => {
    if (!script) return;
    const data = await api.updateScript(script.id, { title });
    setScript(data);
  }, [script]);

  const updateStatus = useCallback(async (status: string) => {
    if (!script) return;
    const data = await api.updateScript(script.id, { status });
    setScript(data);
  }, [script]);

  const saveContent = useCallback(async () => {
    if (!script || !version) return;
    setSaving(true);
    try {
      const data = await api.createVersion(script.id, content);
      setVersion(data);
      setScript((s) => s ? { ...s, currentVersion: data.version } : null);
      return data;
    } finally {
      setSaving(false);
    }
  }, [script, version, content]);

  const autoSave = useCallback((newContent: string) => {
    setContent(newContent);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!script) return;
      setAutoSaving(true);
      try {
        await api.updateScript(script.id, { content: newContent });
        // Also write to disk for file-backed scripts
        if (script.source === "file") {
          await api.saveFile(script.id);
        }
        lastAutoSavedContentRef.current = newContent;
      } finally {
        setAutoSaving(false);
      }
    }, 2000);
  }, [script]);

  const updateContext = useCallback((newContext: string) => {
    setContextState(newContext);
    if (contextTimerRef.current) clearTimeout(contextTimerRef.current);
    contextTimerRef.current = setTimeout(async () => {
      if (!script) return;
      await api.updateScript(script.id, { context: newContext });
    }, 2000);
  }, [script]);

  const handleDeleteScript = useCallback(async () => {
    if (!script) return;
    await api.deleteScript(script.id);
    setScript(null);
    setVersion(null);
    setContent("");
    setContextState("");
    setCurrentScriptId(null);
  }, [script, setCurrentScriptId]);

  // Load last script on mount
  useEffect(() => {
    if (currentScriptId && !script) {
      loadScript(currentScriptId);
    }
  }, [currentScriptId, script, loadScript]);

  const isDirty =
    content !== (version?.content ?? "") &&
    content !== lastAutoSavedContentRef.current;

  return {
    script,
    version,
    content,
    context,
    loading,
    saving,
    autoSaving,
    isDirty,
    setContent: autoSave,
    setContext: updateContext,
    loadScript,
    createScript,
    createScriptWithData,
    updateTitle,
    updateStatus,
    saveContent,
    deleteScript: handleDeleteScript,
  };
}
