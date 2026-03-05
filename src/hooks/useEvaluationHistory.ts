"use client";

import { useState, useCallback, useEffect } from "react";
import { getEvaluationHistory } from "@/lib/api";
import { BUILT_IN_MODELS } from "@/types";
import type { Evaluation, ModelEvalState } from "@/types";

export interface HistoryRun {
  versionId: number;
  versionNumber: number | null;
  timestamp: string;
  summary: Evaluation | null;
  evaluations: Evaluation[];
  modelCount: number;
}

/** Map a model ID to its display name using BUILT_IN_MODELS, fallback to the ID. */
function modelDisplayName(modelId: string): string {
  const found = BUILT_IN_MODELS.find(
    (m) => m.id === modelId || m.modelId === modelId
  );
  return found ? found.name : modelId;
}

/** Convert a DB Evaluation into a ModelEvalState for rendering in ModelCollapsible. */
export function evalToModelState(ev: Evaluation): ModelEvalState {
  return {
    modelId: ev.modelId,
    modelName: modelDisplayName(ev.modelId),
    status: ev.status === "complete" ? "complete" : "error",
    text: ev.result,
    error: ev.errorMessage ?? undefined,
    durationMs: ev.durationMs ?? undefined,
  };
}

export function useEvaluationHistory(scriptId: number | null) {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!scriptId) {
      setRuns([]);
      return;
    }
    setLoading(true);
    try {
      const evals = await getEvaluationHistory(scriptId);

      // Group by versionId
      const byVersion = new Map<number, Evaluation[]>();
      for (const ev of evals) {
        const group = byVersion.get(ev.versionId) ?? [];
        group.push(ev);
        byVersion.set(ev.versionId, group);
      }

      // Build runs sorted by most recent first
      const result: HistoryRun[] = [];
      for (const [versionId, group] of byVersion) {
        const summary = group.find((e) => e.isMasterSummary) ?? null;
        const models = group.filter((e) => !e.isMasterSummary);
        const timestamps = group.map((e) => e.createdAt);
        const latest = timestamps.sort().reverse()[0];

        result.push({
          versionId,
          versionNumber: null, // will be resolved below if possible
          timestamp: latest,
          summary,
          evaluations: models,
          modelCount: models.length,
        });
      }

      // Sort by timestamp descending
      result.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setRuns(result);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [scriptId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { runs, loading, refresh };
}
