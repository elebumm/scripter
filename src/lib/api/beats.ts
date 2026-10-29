import type { Beat, BeatStatus } from "@/types/review";
import type { BeatCheck, BeatSuggestion } from "@/lib/llm/schemas";
import { readNdjson, type StreamEvent } from "@/lib/stream/ndjson";
import { getJson, postStream, sendJson, qs } from "./http";

export function listBeats(scriptId: number) {
  return getJson<Beat[]>(`/api/beats${qs({ scriptId })}`);
}

/**
 * Add a beat (appended unless position is given). source defaults to "writer";
 * an "ai" beat passes the wording guard again on the server.
 */
export function createBeat(data: {
  scriptId: number;
  title: string;
  purpose?: string;
  targetSeconds?: number | null;
  position?: number;
  source?: "ai" | "writer";
}) {
  return sendJson<Beat>("/api/beats", "POST", data);
}

/**
 * Replace all beats with source "ai" and status "planned" by these (writer
 * beats are kept). The server guards their wording again and skips any left empty.
 */
export function replaceAiBeats(scriptId: number, beats: Array<{ title: string; purpose: string; targetSeconds?: number | null }>) {
  return sendJson<Beat[]>("/api/beats", "PUT", { scriptId, beats });
}

export function updateBeat(
  id: number,
  data: Partial<{ title: string; purpose: string; writerNotes: string; status: BeatStatus; targetSeconds: number | null }>
) {
  return sendJson<Beat>(`/api/beats/${id}`, "PATCH", data);
}

export function deleteBeat(id: number) {
  return sendJson<void>(`/api/beats/${id}`, "DELETE");
}

export function reorderBeats(scriptId: number, orderedIds: number[]) {
  return sendJson<Beat[]>("/api/beats/reorder", "POST", { scriptId, orderedIds });
}

/** Propose beats from the brief (and draft, if any). Nothing is saved. */
export async function suggestBeats(
  scriptId: number,
  onEvent?: (event: StreamEvent<BeatSuggestion, Partial<BeatSuggestion>>) => void,
  signal?: AbortSignal
) {
  const res = await postStream("/api/beats/suggest", { scriptId }, signal);
  return (await readNdjson<BeatSuggestion, Partial<BeatSuggestion>>(res, onEvent)).data;
}

/**
 * Check a saved version against the beat sheet. Coverage anchors and statuses
 * are saved server-side; returns the refreshed beats plus missing proposals.
 */
export async function checkBeats(
  scriptId: number,
  versionId: number,
  onEvent?: (event: StreamEvent<{ beats: Beat[]; check: BeatCheck }, Partial<BeatCheck>>) => void,
  signal?: AbortSignal
) {
  const res = await postStream("/api/beats/check", { scriptId, versionId }, signal);
  return (await readNdjson<{ beats: Beat[]; check: BeatCheck }, Partial<BeatCheck>>(res, onEvent)).data;
}
