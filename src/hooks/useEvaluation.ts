"use client";

import { useState, useCallback, useRef } from "react";
import { useAppStore } from "@/stores/app-store";
import type { ModelEvalState, ModelConfig } from "@/types";
import { BUILT_IN_MODELS } from "@/types";

/** True when IPC handlers are available (Electron production, file:// protocol). */
function useIPC(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.scripterAPI?.isElectron &&
    window.location.protocol === "file:"
  );
}

export function useEvaluation() {
  const { activeModelIds, selectedProfileId, selectedSection } = useAppStore();
  const [modelStates, setModelStates] = useState<Record<string, ModelEvalState>>({});
  const [masterSummary, setMasterSummary] = useState<ModelEvalState>({
    modelId: "master-summary",
    modelName: "Master Summary",
    status: "idle",
    text: "",
  });
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const getActiveModels = useCallback((): ModelConfig[] => {
    return BUILT_IN_MODELS.filter((m) => activeModelIds.includes(m.id));
  }, [activeModelIds]);

  const evaluateModelElectron = async (
    model: ModelConfig,
    scriptContent: string,
    versionId: number,
    scriptId: number,
    profilePrompt?: string,
    scriptContext?: string,
    scriptStatus?: string
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
      let fullText = "";

      setModelStates((prev) => ({
        ...prev,
        [model.id]: { ...prev[model.id], status: "streaming" },
      }));

      const result = await window.scripterAPI!.evaluate!.run(
        {
          scriptContent,
          scriptContext,
          sectionOnly: selectedSection || undefined,
          scriptStatus,
          modelId: model.modelId,
          modelProvider: model.provider,
          modelBaseUrl: model.baseUrl,
          profilePrompt,
          scriptId,
          versionId,
          profileId: selectedProfileId,
        },
        (chunk) => {
          fullText += chunk;
          setModelStates((prev) => ({
            ...prev,
            [model.id]: { ...prev[model.id], text: fullText },
          }));
        }
      );

      fullText = result.text;
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

  const evaluateModelFetch = async (
    model: ModelConfig,
    scriptContent: string,
    versionId: number,
    scriptId: number,
    profilePrompt?: string,
    scriptContext?: string,
    scriptStatus?: string,
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
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptContent,
          scriptContext: scriptContext || undefined,
          sectionOnly: selectedSection || undefined,
          scriptStatus,
          modelId: model.modelId,
          modelProvider: model.provider,
          modelBaseUrl: model.baseUrl,
          profilePrompt,
          scriptId,
          versionId,
          profileId: selectedProfileId,
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

  const runMasterSummaryElectron = async (
    scriptContent: string,
    evaluations: Array<{ modelName: string; result: string }>,
    scriptId: number,
    versionId: number,
    scriptStatus?: string
  ) => {
    setMasterSummary({
      modelId: "master-summary",
      modelName: "Master Summary",
      status: "streaming",
      text: "",
    });

    try {
      let fullText = "";
      const result = await window.scripterAPI!.summarize!.run(
        { scriptContent, evaluations, scriptId, versionId, scriptStatus },
        (chunk) => {
          fullText += chunk;
          setMasterSummary((prev) => ({ ...prev, text: fullText }));
        }
      );

      fullText = result.text;
      setMasterSummary((prev) => ({ ...prev, status: "complete", text: fullText }));
      return fullText;
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      setMasterSummary((prev) => ({ ...prev, status: "error", error }));
      return "";
    }
  };

  const runMasterSummaryFetch = async (
    scriptContent: string,
    evaluations: Array<{ modelName: string; result: string }>,
    scriptId: number,
    versionId: number,
    scriptStatus?: string,
    signal?: AbortSignal
  ) => {
    setMasterSummary({
      modelId: "master-summary",
      modelName: "Master Summary",
      status: "streaming",
      text: "",
    });

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptContent, evaluations, scriptId, versionId, scriptStatus }),
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
        setMasterSummary((prev) => ({ ...prev, text: fullText }));
      }

      setMasterSummary((prev) => ({ ...prev, status: "complete", text: fullText }));
      return fullText;
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      setMasterSummary((prev) => ({ ...prev, status: "error", error }));
      return "";
    }
  };

  const run = useCallback(
    async (
      scriptContent: string,
      scriptId: number,
      versionId: number,
      profilePrompt?: string,
      scriptContext?: string,
      scriptStatus?: string
    ) => {
      const models = getActiveModels();
      if (models.length === 0) return;

      setIsRunning(true);
      abortRef.current = new AbortController();

      // Reset states
      setMasterSummary({
        modelId: "master-summary",
        modelName: "Master Summary",
        status: "idle",
        text: "",
      });

      const useIpc = useIPC();

      // Run all models in parallel
      const results = await Promise.allSettled(
        models.map((model) =>
          useIpc
            ? evaluateModelElectron(
                model,
                scriptContent,
                versionId,
                scriptId,
                profilePrompt,
                scriptContext,
                scriptStatus
              )
            : evaluateModelFetch(
                model,
                scriptContent,
                versionId,
                scriptId,
                profilePrompt,
                scriptContext,
                scriptStatus,
                abortRef.current!.signal
              )
        )
      );

      // Collect successful results
      const successfulEvals = results
        .filter(
          (r): r is PromiseFulfilledResult<{ modelId: string; text: string }> =>
            r.status === "fulfilled" && !!r.value.text && !r.value.error
        )
        .map((r) => ({
          modelName:
            models.find((m) => m.id === r.value.modelId)?.name ?? r.value.modelId,
          result: r.value.text,
        }));

      // Run master summary if we have at least 1 successful eval
      if (successfulEvals.length >= 1) {
        if (useIpc) {
          await runMasterSummaryElectron(
            scriptContent,
            successfulEvals,
            scriptId,
            versionId,
            scriptStatus
          );
        } else {
          await runMasterSummaryFetch(
            scriptContent,
            successfulEvals,
            scriptId,
            versionId,
            scriptStatus,
            abortRef.current.signal
          );
        }
      }

      setIsRunning(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getActiveModels, selectedSection, selectedProfileId]
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    // Reset any non-terminal model states to idle
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
    // Reset summary if not terminal
    setMasterSummary((prev) => {
      if (prev.status !== "complete" && prev.status !== "error") {
        return { ...prev, status: "idle", text: "" };
      }
      return prev;
    });
    setIsRunning(false);
  }, []);

  const retryModel = useCallback(
    async (
      modelId: string,
      scriptContent: string,
      scriptId: number,
      versionId: number,
      profilePrompt?: string,
      scriptContext?: string
    ) => {
      const model = BUILT_IN_MODELS.find((m) => m.id === modelId);
      if (!model) return;

      const useIpc = useIPC();
      if (useIpc) {
        await evaluateModelElectron(
          model,
          scriptContent,
          versionId,
          scriptId,
          profilePrompt,
          scriptContext
        );
      } else {
        await evaluateModelFetch(
          model,
          scriptContent,
          versionId,
          scriptId,
          profilePrompt,
          scriptContext
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const completedCount = Object.values(modelStates).filter(
    (m) => m.status === "complete" || m.status === "error"
  ).length;

  const totalCount = Object.values(modelStates).filter(
    (m) => m.status !== "idle"
  ).length;

  return {
    modelStates,
    masterSummary,
    isRunning,
    run,
    abort,
    retryModel,
    completedCount,
    totalCount,
    getActiveModels,
  };
}
