// Unified API layer: routes to IPC (Electron) or fetch (web)
// All hooks should call these functions instead of fetch() directly.

import type {
  Script,
  ScriptVersion,
  Evaluation,
  EvaluationProfile,
  CustomModel,
  Suggestion,
  Tag,
  ScriptWithTags,
} from "@/types";

/** True when running inside an Electron window (dev or prod). */
export function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.scripterAPI?.isElectron;
}

/**
 * True when IPC handlers are available (Electron production only).
 * In dev mode Electron loads http://localhost:3000 and all data goes
 * through fetch() to the Next.js dev server — no IPC handlers are registered.
 */
function useIPC(): boolean {
  return (
    isElectron() &&
    typeof window !== "undefined" &&
    window.location.protocol === "file:"
  );
}

function api() {
  return window.scripterAPI!;
}

// --------------- Scripts ---------------

export async function listScripts(): Promise<ScriptWithTags[]> {
  if (useIPC()) {
    // IPC returns Script[] without tags; enrich with empty tags
    const scripts = await api().scripts.list();
    return scripts.map((s: Script) => ({ ...s, tags: (s as ScriptWithTags).tags ?? [] }));
  }
  const res = await fetch("/api/scripts");
  return res.json();
}

export async function getScript(
  id: number
): Promise<{ script: Script | null; latestVersion: ScriptVersion | null }> {
  if (useIPC()) return api().scripts.get(id);
  const res = await fetch(`/api/scripts/${id}`);
  if (!res.ok) throw new Error("Failed to load script");
  return res.json();
}

export async function createScript(
  title: string = "Untitled Script",
  content: string = "",
  options?: { context?: string; targetLength?: number }
): Promise<Script> {
  if (useIPC()) return api().scripts.create(title, content, options);
  const res = await fetch("/api/scripts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content, ...options }),
  });
  return res.json();
}

export async function updateScript(
  id: number,
  data: {
    title?: string;
    context?: string;
    targetLength?: number | null;
    content?: string;
    status?: string;
  }
): Promise<Script> {
  if (useIPC()) return api().scripts.update(id, data);
  const res = await fetch(`/api/scripts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteScript(id: number): Promise<void> {
  if (useIPC()) {
    await api().scripts.delete(id);
    return;
  }
  await fetch(`/api/scripts/${id}`, { method: "DELETE" });
}

export async function getScriptVersions(
  scriptId: number
): Promise<ScriptVersion[]> {
  if (useIPC()) return api().scripts.getVersions(scriptId);
  const res = await fetch(`/api/scripts/${scriptId}/versions`);
  if (!res.ok) throw new Error("Failed to load versions");
  return res.json();
}

export async function createVersion(
  scriptId: number,
  content: string
): Promise<ScriptVersion> {
  if (useIPC()) return api().scripts.createVersion(scriptId, content);
  const res = await fetch(`/api/scripts/${scriptId}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  return res.json();
}

// --------------- Profiles ---------------

export async function listProfiles(): Promise<EvaluationProfile[]> {
  if (useIPC()) return api().profiles.list();
  const res = await fetch("/api/profiles");
  return res.json();
}

export async function getProfile(
  id: number
): Promise<EvaluationProfile | undefined> {
  if (useIPC()) return api().profiles.get(id);
  const res = await fetch(`/api/profiles/${id}`);
  if (!res.ok) return undefined;
  return res.json();
}

export async function createProfile(data: {
  name: string;
  systemPrompt: string;
  criteriaWeights?: string;
  isDefault?: boolean;
}): Promise<EvaluationProfile> {
  if (useIPC()) return api().profiles.create(data);
  const res = await fetch("/api/profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateProfile(
  id: number,
  data: {
    name?: string;
    systemPrompt?: string;
    criteriaWeights?: string;
    isDefault?: boolean;
  }
): Promise<EvaluationProfile> {
  if (useIPC()) return api().profiles.update(id, data);
  const res = await fetch(`/api/profiles/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteProfile(id: number): Promise<void> {
  if (useIPC()) {
    await api().profiles.delete(id);
    return;
  }
  await fetch(`/api/profiles/${id}`, { method: "DELETE" });
}

// --------------- Models ---------------

export async function listModels(): Promise<CustomModel[]> {
  if (useIPC()) return api().models.list();
  const res = await fetch("/api/models");
  return res.json();
}

export async function createModel(data: {
  name: string;
  provider: "openrouter" | "ollama";
  modelId: string;
  baseUrl?: string | null;
  isActive?: boolean;
}): Promise<CustomModel> {
  if (useIPC()) return api().models.create(data);
  const res = await fetch("/api/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateModel(
  id: number,
  data: {
    name?: string;
    provider?: "openrouter" | "ollama";
    modelId?: string;
    baseUrl?: string | null;
    isActive?: boolean;
  }
): Promise<CustomModel> {
  if (useIPC()) return api().models.update(id, data);
  const res = await fetch(`/api/models/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteModel(id: number): Promise<void> {
  if (useIPC()) {
    await api().models.delete(id);
    return;
  }
  await fetch(`/api/models/${id}`, { method: "DELETE" });
}

// --------------- Evaluation History ---------------

export async function getEvaluationHistory(
  scriptId: number
): Promise<Evaluation[]> {
  const res = await fetch(`/api/evaluations?scriptId=${scriptId}`);
  if (!res.ok) throw new Error("Failed to fetch evaluation history");
  return res.json();
}

// --------------- Suggestions ---------------

export async function getSuggestions(
  scriptId: number,
  versionId: number
): Promise<Suggestion[]> {
  if (useIPC()) return api().suggestions.get(scriptId, versionId);
  const res = await fetch(
    `/api/suggestions?scriptId=${scriptId}&versionId=${versionId}`
  );
  if (!res.ok) throw new Error("Failed to fetch suggestions");
  return res.json();
}

export async function updateSuggestionStatus(
  id: number,
  status: "accepted" | "dismissed"
): Promise<Suggestion | null> {
  if (useIPC()) return api().suggestions.update(id, status);
  const res = await fetch(`/api/suggestions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return null;
  return res.json();
}

// --------------- Fact Issues ---------------

export async function getFactIssues(
  scriptId: number,
  versionId: number
): Promise<import("@/types").FactIssue[]> {
  const res = await fetch(
    `/api/fact-issues?scriptId=${scriptId}&versionId=${versionId}`
  );
  if (!res.ok) throw new Error("Failed to fetch fact issues");
  return res.json();
}

export async function updateFactIssueStatus(
  id: number,
  status: "acknowledged" | "dismissed" | "corrected"
): Promise<import("@/types").FactIssue | null> {
  const res = await fetch(`/api/fact-issues/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return null;
  return res.json();
}

// --------------- Streaming ---------------

export function isElectronStreaming(): boolean {
  return useIPC() && !!api().evaluate;
}

// --------------- Files (Electron only) ---------------

export async function openFile(): Promise<{
  scriptId: number;
  filePath: string;
} | null> {
  if (!useIPC() || !api().files) return null;
  return api().files!.open();
}

export async function openFilePath(
  path: string
): Promise<{ scriptId: number; filePath: string } | null> {
  if (!useIPC() || !api().files) return null;
  return api().files!.openPath(path);
}

export async function saveFile(scriptId: number): Promise<boolean> {
  if (!useIPC() || !api().files) return false;
  return api().files!.save(scriptId);
}

export async function saveFileAs(scriptId: number): Promise<string | null> {
  if (!useIPC() || !api().files) return null;
  return api().files!.saveAs(scriptId);
}

export async function getRecentFiles(): Promise<string[]> {
  if (!useIPC() || !api().files) return [];
  return api().files!.getRecent();
}

export function onFileExternalChange(
  callback: (scriptId: number, newContent: string) => void
): (() => void) | null {
  if (!useIPC() || !api().onFileExternalChange) return null;
  return api().onFileExternalChange!(callback);
}

// --------------- Tags ---------------

export async function listTags(): Promise<Tag[]> {
  const res = await fetch("/api/tags");
  return res.json();
}

export async function createTagApi(name: string, color?: string): Promise<Tag> {
  const res = await fetch("/api/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, color }),
  });
  return res.json();
}

export async function deleteTagApi(id: number): Promise<void> {
  await fetch(`/api/tags/${id}`, { method: "DELETE" });
}

export async function getScriptTags(scriptId: number): Promise<Tag[]> {
  const res = await fetch(`/api/scripts/${scriptId}/tags`);
  return res.json();
}

export async function setScriptTags(scriptId: number, tagIds: number[]): Promise<void> {
  await fetch(`/api/scripts/${scriptId}/tags`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tagIds }),
  });
}

export async function addScriptTag(scriptId: number, tagId: number): Promise<void> {
  await fetch(`/api/scripts/${scriptId}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tagId }),
  });
}

// --------------- Templates ---------------

export async function listTemplates(): Promise<Script[]> {
  const res = await fetch("/api/templates");
  return res.json();
}

export async function createFromTemplate(templateId: number, title?: string): Promise<Script> {
  const res = await fetch("/api/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateId, title }),
  });
  return res.json();
}
