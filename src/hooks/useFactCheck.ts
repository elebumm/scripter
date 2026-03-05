"use client";

import { useState, useCallback, useRef } from "react";
import type { FactCheckModelState } from "@/types";
import { FACT_CHECK_MODELS } from "@/types";

export function useFactCheck() {
  const [modelStates, setModelStates] = useState<
    Record<string, FactCheckModelState>
  >({});
  const [summary, setSummary] = useState<FactCheckModelState>({
    modelId: "fact-check-summary",
    modelName: "Fact Check Summary",
    status: "idle",
    text: "",
  });
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const checkModelFetch = async (
    model: (typeof FACT_CHECK_MODELS)[number],
    scriptContent: string,
    scriptId: number,
    versionId: number,
    scriptContext?: string,
    signal?: AbortSignal
  ): Promise<{ modelId: string; text: string; error?: string }> => {
    const startTime = Date.now();

    setModelStates((prev) => ({
      ...prev,
      [model.id]: {
        modelId: model.id,
        modelName: model.name,
        status: "pending",
        text: "",
      },
    }));

    try {
      const res = await fetch("/api/fact-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptContent,
          scriptContext: scriptContext || undefined,
          modelId: model.modelId,
          modelProvider: model.provider,
          scriptId,
          versionId,
        }),
        signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullText = "";

      setModelStates((prev) => ({
        ...prev,
        [model.id]: { ...prev[model.id], status: "streaming" },
      }));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setModelStates((prev) => ({
          ...prev,
          [model.id]: { ...prev[model.id], text: fullText },
        }));
      }

      const duration = Date.now() - startTime;
      setModelStates((prev) => ({
        ...prev,
        [model.id]: {
          ...prev[model.id],
          status: "complete",
          text: fullText,
          durationMs: duration,
        },
      }));

      return { modelId: model.id, text: fullText };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      setModelStates((prev) => ({
        ...prev,
        [model.id]: {
          ...prev[model.id],
          status: "error",
          error,
        },
      }));
      return { modelId: model.id, text: "", error };
    }
  };

  const runSummaryFetch = async (
    scriptContent: string,
    factChecks: Array<{ modelName: string; result: string }>,
    scriptId: number,
    versionId: number,
    signal?: AbortSignal
  ) => {
    setSummary({
      modelId: "fact-check-summary",
      modelName: "Fact Check Summary",
      status: "streaming",
      text: "",
    });

    try {
      const res = await fetch("/api/fact-check-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptContent,
          factChecks,
          scriptId,
          versionId,
        }),
        signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setSummary((prev) => ({ ...prev, text: fullText }));
      }

      setSummary((prev) => ({
        ...prev,
        status: "complete",
        text: fullText,
      }));
      return fullText;
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      setSummary((prev) => ({ ...prev, status: "error", error }));
      return "";
    }
  };

  const run = useCallback(
    async (
      scriptContent: string,
      scriptId: number,
      versionId: number,
      scriptContext?: string
    ) => {
      const models = FACT_CHECK_MODELS;
      if (models.length === 0) return;

      setIsRunning(true);
      abortRef.current = new AbortController();

      // Reset states
      setSummary({
        modelId: "fact-check-summary",
        modelName: "Fact Check Summary",
        status: "idle",
        text: "",
      });

      // Run all models in parallel
      const results = await Promise.allSettled(
        models.map((model) =>
          checkModelFetch(
            model,
            scriptContent,
            scriptId,
            versionId,
            scriptContext,
            abortRef.current!.signal
          )
        )
      );

      // Collect successful results
      const successfulChecks = results
        .filter(
          (
            r
          ): r is PromiseFulfilledResult<{
            modelId: string;
            text: string;
          }> => r.status === "fulfilled" && !!r.value.text && !r.value.error
        )
        .map((r) => ({
          modelName:
            models.find((m) => m.id === r.value.modelId)?.name ??
            r.value.modelId,
          result: r.value.text,
        }));

      // Run summary if we have at least 1 successful check
      if (successfulChecks.length >= 1) {
        await runSummaryFetch(
          scriptContent,
          successfulChecks,
          scriptId,
          versionId,
          abortRef.current.signal
        );
      }

      setIsRunning(false);
    },
    []
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setModelStates((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const status = next[key].status;
        if (status !== "complete" && status !== "error") {
          next[key] = { ...next[key], status: "idle", text: "" };
        }
      }
      return next;
    });
    setSummary((prev) => {
      if (prev.status !== "complete" && prev.status !== "error") {
        return { ...prev, status: "idle", text: "" };
      }
      return prev;
    });
    setIsRunning(false);
  }, []);

  const completedCount = Object.values(modelStates).filter(
    (m) => m.status === "complete" || m.status === "error"
  ).length;

  const totalCount = Object.values(modelStates).filter(
    (m) => m.status !== "idle"
  ).length;

  return {
    modelStates,
    summary,
    isRunning,
    run,
    abort,
    completedCount,
    totalCount,
  };
}
