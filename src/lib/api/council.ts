import type { PersonaCritique, SynthesisOutput } from "@/lib/llm/schemas";
import type { NoteDropReason, Synthesis } from "@/types/review";
import { readNdjson, type StreamEvent } from "@/lib/stream/ndjson";
import { getJson, postStream, qs } from "./http";

export interface CritiqueMeta {
  evaluationId: number;
  costUsd: number | null;
  durationMs: number;
  /** Notes the server guard dropped (bad anchor, outside the section, supplied wording, dismissed). */
  notesDropped: number;
  /** Rubric criteria the lens didn't score (shown as "–" in the score table). */
  criteriaMissing: string[];
}

/** Run one persona over a saved version. Streams partial critiques. */
export async function streamCritique(
  body: { scriptId: number; versionId: number; personaId: number; runId: string; sectionOnly?: string },
  onEvent: (event: StreamEvent<PersonaCritique, Partial<PersonaCritique>>) => void,
  signal?: AbortSignal
) {
  const res = await postStream("/api/council/critique", body, signal);
  const { data, meta } = await readNdjson<PersonaCritique, Partial<PersonaCritique>>(res, onEvent);
  return { critique: data, meta: meta as unknown as CritiqueMeta };
}

export interface SynthesisMeta {
  summaryId: number;
  notesSaved: number;
  notesDropped: number;
  /** notesDropped by reason ("anchor" = didn't quote the script). */
  dropReasons: Partial<Record<NoteDropReason, number>>;
  /** Earlier open notes kept open because dropped notes couldn't replace them. */
  previousNotesKept: number;
  /** This synthesis call only (the run total is synthesis.costUsd). */
  costUsd: number | null;
}

/** Merge a run's critiques into the synthesis and saved notes. */
export async function streamSynthesis(
  body: { scriptId: number; versionId: number; runId: string },
  onEvent: (event: StreamEvent<Synthesis, Partial<SynthesisOutput>>) => void,
  signal?: AbortSignal
) {
  const res = await postStream("/api/council/synthesize", body, signal);
  const { data, meta } = await readNdjson<Synthesis, Partial<SynthesisOutput>>(res, onEvent);
  return { synthesis: data, meta: meta as unknown as SynthesisMeta };
}

/** The most recent saved synthesis for a script (null if never reviewed). */
export function getLatestSynthesis(scriptId: number) {
  return getJson<Synthesis | null>(`/api/council/latest${qs({ scriptId })}`);
}

export interface RunSummary {
  runId: string;
  versionId: number;
  versionNumber: number;
  createdAt: string;
  overallAverage: number | null;
  costUsd: number | null;
  lensCount: number;
  failedLenses: number;
  sectionOnly: boolean;
}

/** Council runs for a script, newest first (legacy runs grouped by version). */
export function listRuns(scriptId: number) {
  return getJson<RunSummary[]>(`/api/council/runs${qs({ scriptId })}`);
}

/** A specific run's full synthesis (for history). */
export function getRun(scriptId: number, runId: string) {
  return getJson<Synthesis | null>(`/api/council/runs${qs({ scriptId, runId })}`);
}

export interface TrendPoint {
  versionNumber: number;
  createdAt: string;
  overall: number | null;
  /** criterion id -> average across lenses */
  criteria: Record<string, number>;
}

/** Whole-script runs only (section reviews excluded). */
export function getTrends(scriptId: number) {
  return getJson<TrendPoint[]>(`/api/council/trends${qs({ scriptId })}`);
}
