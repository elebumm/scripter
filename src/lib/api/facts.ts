import type { FactNote } from "@/types/review";
import type { FactCheckOutput } from "@/lib/llm/schemas";
import { readNdjson, type StreamEvent } from "@/lib/stream/ndjson";
import { getJson, postStream, sendJson, qs } from "./http";

/** Why a fact-check left claims out. */
export interface FactClaimsDroppedBy {
  notInScript: number;
  duplicate: number;
  tooThin: number;
  overLimit: number;
}

export interface FactCheckMeta {
  factCheckId: number;
  searchCount: number;
  claimsSaved: number;
  claimsDropped: number;
  /** claimsDropped by reason: not quoted from the script, a repeat, nothing to report, over the claim limit. */
  claimsDroppedBy?: FactClaimsDroppedBy;
  /** Claims marked unverifiable because no returned search result backed them. */
  claimsDowngraded?: number;
  /** Claims that kept a status the writer gave them in an earlier run. */
  claimsCarried?: number;
  costUsd: number | null;
}

/** One grounded fact-check over a saved version. */
export async function runFactCheck(
  scriptId: number,
  versionId: number,
  onEvent?: (event: StreamEvent<FactNote[], Partial<FactCheckOutput>>) => void,
  signal?: AbortSignal
) {
  const res = await postStream("/api/fact-check", { scriptId, versionId }, signal);
  const { data, meta } = await readNdjson<FactNote[], Partial<FactCheckOutput>>(res, onEvent);
  return { notes: data, meta: meta as unknown as FactCheckMeta };
}

/** Fact notes from the latest grounded fact-check for the script. */
export function listFactNotes(scriptId: number) {
  return getJson<FactNote[]>(`/api/fact-issues${qs({ scriptId })}`);
}

export function setFactNoteStatus(id: number, status: FactNote["status"]) {
  return sendJson<FactNote>(`/api/fact-issues/${id}`, "PATCH", { status });
}
