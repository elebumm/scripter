import type { Script, ScriptVersion } from "@/types";
import { getJson, sendJson, qs } from "./http";

/** A script as listed on the Drafts page. */
export interface ScriptSummary extends Script {
  /** Words in the current draft (spoken words only). */
  spokenWords: number;
  /** First `# Heading` of the draft, shown when the title is empty. */
  heading: string | null;
  /** Latest council overall average for any version, if any. */
  lastScore: number | null;
  lastReviewedAt: string | null;
}

export interface ScriptDetail {
  script: Script;
  /** Latest immutable version (null for a brand-new empty script). */
  latestVersion: ScriptVersion | null;
  /** What the editor should show: draft_content ?? latestVersion.content ?? "". */
  content: string;
}

export function listScripts(options: { archived?: boolean } = {}) {
  return getJson<ScriptSummary[]>(`/api/scripts${qs({ archived: options.archived ? 1 : undefined })}`);
}

export function getScript(id: number) {
  return getJson<ScriptDetail>(`/api/scripts/${id}`);
}

export function createScript(data: { title?: string; context?: string; targetLength?: number | null; content?: string } = {}) {
  return sendJson<Script>("/api/scripts", "POST", data);
}

/** Partial update. `draftContent` is the autosave target; versions are never edited. */
export function updateScript(
  id: number,
  data: Partial<{ title: string; context: string; targetLength: number | null; draftContent: string; archived: boolean; icon: string | null }>
) {
  return sendJson<Script>(`/api/scripts/${id}`, "PATCH", data);
}

/** Browsers cap keepalive request bodies at 64 KiB. */
const KEEPALIVE_LIMIT_BYTES = 60_000;

/**
 * Best-effort draft save while the tab is closing (same PATCH as
 * updateScript, sent with keepalive so it outlives the page). Returns false
 * when the body is too large for keepalive and nothing was sent.
 */
export function saveDraftOnUnload(id: number, draftContent: string): boolean {
  const body = JSON.stringify({ draftContent });
  if (new Blob([body]).size > KEEPALIVE_LIMIT_BYTES) return false;
  try {
    void fetch(`/api/scripts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** Permanent delete (cascades to versions, runs, notes, beats). Only offered from the archive. */
export function deleteScript(id: number) {
  return sendJson<void>(`/api/scripts/${id}`, "DELETE");
}

export function listVersions(scriptId: number) {
  return getJson<ScriptVersion[]>(`/api/scripts/${scriptId}/versions`);
}

/**
 * Snapshot the draft as a new immutable version, unless it matches the latest
 * version exactly (then that version is returned with created=false).
 */
export function saveVersion(scriptId: number, content: string) {
  return sendJson<{ version: ScriptVersion; created: boolean }>(`/api/scripts/${scriptId}/versions`, "POST", { content });
}

export function listTemplates() {
  return getJson<Script[]>("/api/templates");
}

/** Creates ONE script from the template and returns it (navigate to its id). */
export function createFromTemplate(templateId: number, title?: string) {
  return sendJson<Script>("/api/templates", "POST", { templateId, title });
}

export function pickIcon(scriptId: number) {
  return sendJson<{ scriptId: number; icon: string | null }>("/api/scripts/pick-icon", "POST", { scriptId });
}

/** Writes every script to data/exports/<date>/ on the server; returns the folder. */
export function exportAll() {
  return sendJson<{ folder: string; scripts: number }>("/api/export-all", "POST");
}
