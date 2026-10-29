import type { Persona } from "@/types/review";
import type { RegisteredModel } from "@/lib/llm/models";
import { getJson, sendJson } from "./http";

/** Council members ordered by position (active and inactive). */
export function listPersonas() {
  return getJson<Persona[]>("/api/profiles");
}

export function updatePersona(
  id: number,
  data: Partial<{ name: string; description: string; systemPrompt: string; criteriaWeights: Record<string, number>; modelSlug: string; isActive: boolean; position: number }>
) {
  return sendJson<Persona>(`/api/profiles/${id}`, "PATCH", data);
}

/** Models a persona may use, with prices (from the server registry). */
export function listModels() {
  return getJson<RegisteredModel[]>("/api/models");
}

export function getSettingsStatus() {
  return getJson<{ hasApiKey: boolean; dbPath: string; backupsDir: string }>("/api/settings/status");
}
