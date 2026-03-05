"use client";

import { useState, useCallback, useEffect } from "react";
import * as api from "@/lib/api";
import type { StructuredEvaluation } from "@/lib/llm/eval-schema";

export interface TrendDataPoint {
  versionNumber: number;
  versionId: number;
  overallScore: number;
  [criterion: string]: number; // criterion name → average score
}

export interface TrendDelta {
  criterion: string;
  delta: number;
}

export function useScoreTrends(scriptId: number | null) {
  const [dataPoints, setDataPoints] = useState<TrendDataPoint[]>([]);
  const [deltas, setDeltas] = useState<TrendDelta[]>([]);
  const [criteriaNames, setCriteriaNames] = useState<string[]>([]);
  const [hasData, setHasData] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!scriptId) {
      setDataPoints([]);
      setDeltas([]);
      setCriteriaNames([]);
      setHasData(false);
      return;
    }

    setLoading(true);
    try {
      const [evals, versions] = await Promise.all([
        api.getEvaluationHistory(scriptId),
        api.getScriptVersions(scriptId),
      ]);

      // Map versionId → version number
      const versionMap = new Map<number, number>();
      for (const v of versions) {
        versionMap.set(v.id, v.version);
      }

      // Filter to non-summary evals with structured results
      const structuredEvals = evals.filter(
        (e) => !e.isMasterSummary && e.structuredResult
      );

      if (structuredEvals.length === 0) {
        setDataPoints([]);
        setDeltas([]);
        setCriteriaNames([]);
        setHasData(false);
        return;
      }

      // Group by versionId, deduplicate by (versionId, modelId) keeping most recent
      const byVersion = new Map<
        number,
        Map<string, { createdAt: string; structured: StructuredEvaluation }>
      >();

      for (const ev of structuredEvals) {
        let parsed: StructuredEvaluation;
        try {
          parsed = JSON.parse(ev.structuredResult!);
        } catch {
          continue;
        }

        if (!byVersion.has(ev.versionId)) {
          byVersion.set(ev.versionId, new Map());
        }
        const modelMap = byVersion.get(ev.versionId)!;
        const existing = modelMap.get(ev.modelId);
        if (!existing || ev.createdAt > existing.createdAt) {
          modelMap.set(ev.modelId, { createdAt: ev.createdAt, structured: parsed });
        }
      }

      // Collect all criterion names
      const allCriteria = new Set<string>();
      for (const modelMap of byVersion.values()) {
        for (const { structured } of modelMap.values()) {
          for (const c of structured.criteria) {
            allCriteria.add(c.name);
          }
        }
      }
      const criteriaList = Array.from(allCriteria);

      // Build data points sorted by version number
      const points: TrendDataPoint[] = [];
      for (const [versionId, modelMap] of byVersion) {
        const versionNumber = versionMap.get(versionId) ?? versionId;
        const criteriaScores: Record<string, number[]> = {};
        const overallScores: number[] = [];

        for (const { structured } of modelMap.values()) {
          overallScores.push(structured.overallScore);
          for (const c of structured.criteria) {
            if (!criteriaScores[c.name]) criteriaScores[c.name] = [];
            criteriaScores[c.name].push(c.score);
          }
        }

        const point: TrendDataPoint = {
          versionNumber,
          versionId,
          overallScore: avg(overallScores),
        };
        for (const name of criteriaList) {
          point[name] = criteriaScores[name] ? avg(criteriaScores[name]) : 0;
        }

        points.push(point);
      }

      points.sort((a, b) => a.versionNumber - b.versionNumber);

      // Compute deltas between last two versions
      const computedDeltas: TrendDelta[] = [];
      if (points.length >= 2) {
        const prev = points[points.length - 2];
        const curr = points[points.length - 1];
        computedDeltas.push({
          criterion: "Overall",
          delta: round(curr.overallScore - prev.overallScore),
        });
        for (const name of criteriaList) {
          computedDeltas.push({
            criterion: name,
            delta: round((curr[name] as number) - (prev[name] as number)),
          });
        }
      }

      setDataPoints(points);
      setDeltas(computedDeltas);
      setCriteriaNames(criteriaList);
      setHasData(points.length > 0);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [scriptId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { dataPoints, deltas, criteriaNames, hasData, loading, refresh };
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
