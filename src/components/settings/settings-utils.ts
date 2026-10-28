// Pure helpers for the Settings page (persona order, weights, prices, wpm).

import { CRITERIA, type CriterionId } from "@/lib/llm/rubric";
import { MAX_WORDS_PER_MINUTE, MIN_WORDS_PER_MINUTE } from "@/stores/app-store";
import type { Persona } from "@/types/review";

export const MIN_WEIGHT = 0;
export const MAX_WEIGHT = 3;

/** Personas in council order (position, then id for ties). */
export function sortPersonas<T extends Pick<Persona, "id" | "position">>(personas: readonly T[]): T[] {
  return [...personas].sort((a, b) => a.position - b.position || a.id - b.id);
}

/**
 * Move one persona up (-1) or down (+1). Returns the new order with dense
 * positions and only the position changes that need saving, or null when the
 * move is impossible.
 */
export function movePersona<T extends Pick<Persona, "id" | "position">>(
  personas: readonly T[],
  id: number,
  direction: -1 | 1
): { ordered: T[]; changes: Array<{ id: number; position: number }> } | null {
  const sorted = sortPersonas(personas);
  const index = sorted.findIndex((p) => p.id === id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= sorted.length) return null;

  const swapped = [...sorted];
  [swapped[index], swapped[target]] = [swapped[target], swapped[index]];

  const changes: Array<{ id: number; position: number }> = [];
  const ordered = swapped.map((p, position) => {
    if (p.position === position) return p;
    changes.push({ id: p.id, position });
    return { ...p, position };
  });
  return { ordered, changes };
}

export function clampWeight(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, Math.round(value * 4) / 4));
}

/** A weight for every rubric criterion (1 = normal), clamped to 0–3. */
export function normalizeWeights(raw: Record<string, number | string | null | undefined> | null | undefined): Record<CriterionId, number> {
  const out = {} as Record<CriterionId, number>;
  for (const c of CRITERIA) {
    const value = raw?.[c.id];
    const n = typeof value === "string" ? (value.trim() === "" ? Number.NaN : Number(value)) : value ?? Number.NaN;
    out[c.id] = Number.isFinite(n) ? clampWeight(n as number) : 1;
  }
  return out;
}

export interface PersonaDraft {
  name: string;
  description: string;
  systemPrompt: string;
  modelSlug: string;
}

/** What PATCH /api/profiles/:id accepts (trimmed lengths); keep in step with its schema. */
export const PERSONA_LIMITS = {
  nameMax: 80,
  descriptionMax: 600,
  promptMin: 20,
  promptMax: 20_000,
} as const;

const MESSAGES = {
  nameMissing: "Give this council member a name.",
  nameLong: `Keep the name to ${PERSONA_LIMITS.nameMax} characters.`,
  descriptionLong: `Keep the description to ${PERSONA_LIMITS.descriptionMax} characters.`,
  promptMissing: "The persona prompt can't be empty.",
  promptShort: `The persona prompt needs at least ${PERSONA_LIMITS.promptMin} characters.`,
  promptLong: `The persona prompt can be at most ${PERSONA_LIMITS.promptMax.toLocaleString("en-US")} characters.`,
  model: "Pick a model from the list.",
  weights: `Each weight must be a number from ${MIN_WEIGHT} to ${MAX_WEIGHT}.`,
};

/**
 * The character count under a persona field, flagged when the server would
 * refuse it. The fields don't cut pasted text at the limit (a silently
 * truncated prompt would be saved without the writer noticing).
 */
export function lengthHint(value: string, limits: { min?: number; max: number }): { text: string; outOfRange: boolean } {
  const count = value.trim().length;
  const min = limits.min ?? 0;
  const fmt = (n: number) => n.toLocaleString("en-US");
  const range = min > 0 ? `${fmt(min)} to ${fmt(limits.max)}` : `up to ${fmt(limits.max)}`;
  return {
    text: `${fmt(count)} ${count === 1 ? "character" : "characters"} (${range}).`,
    outOfRange: count < min || count > limits.max,
  };
}

/** A human-readable problem with the draft, or null when it can be saved. */
export function validatePersonaDraft(draft: PersonaDraft, allowedModelSlugs: readonly string[]): string | null {
  const name = draft.name.trim();
  const prompt = draft.systemPrompt.trim();
  if (!name) return MESSAGES.nameMissing;
  if (name.length > PERSONA_LIMITS.nameMax) return MESSAGES.nameLong;
  if (draft.description.trim().length > PERSONA_LIMITS.descriptionMax) return MESSAGES.descriptionLong;
  if (!prompt) return MESSAGES.promptMissing;
  if (prompt.length < PERSONA_LIMITS.promptMin) return MESSAGES.promptShort;
  if (prompt.length > PERSONA_LIMITS.promptMax) return MESSAGES.promptLong;
  if (allowedModelSlugs.length > 0 && !allowedModelSlugs.includes(draft.modelSlug)) return MESSAGES.model;
  return null;
}

/**
 * A failed save, worded for the writer. The server's validation output
 * ("Invalid request: ✖ Too small … → at systemPrompt") is never shown raw:
 * it becomes the matching field message.
 */
export function personaSaveError(message: string): string {
  if (!message.startsWith("Invalid request")) return message;
  const field = message.match(/→ at (\w+)/)?.[1];
  switch (field) {
    case "name":
      return `Give this council member a name of up to ${PERSONA_LIMITS.nameMax} characters.`;
    case "description":
      return MESSAGES.descriptionLong;
    case "systemPrompt":
      return `The persona prompt needs ${PERSONA_LIMITS.promptMin} to ${PERSONA_LIMITS.promptMax.toLocaleString("en-US")} characters.`;
    case "modelSlug":
      return MESSAGES.model;
    case "criteriaWeights":
      return MESSAGES.weights;
    default:
      return "Couldn't save this council member. Check each field and try again.";
  }
}

/** "$2", "$0.10", "$0.825" per 1M tokens. */
export function formatPrice(usdPerMillion: number): string {
  if (!Number.isFinite(usdPerMillion)) return "–";
  if (Number.isInteger(usdPerMillion)) return `$${usdPerMillion}`;
  return `$${usdPerMillion.toFixed(3).replace(/0$/, "")}`;
}

/** Parse a typed wpm value; null when it isn't a usable speaking rate. */
export function parseWpm(input: string): number | null {
  if (!input.trim()) return null;
  const n = Number(input);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded >= MIN_WORDS_PER_MINUTE && rounded <= MAX_WORDS_PER_MINUTE ? rounded : null;
}
