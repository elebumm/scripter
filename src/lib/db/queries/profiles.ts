// Council personas live in evaluation_profiles (rows with a slug). Legacy
// profiles (slug NULL) are kept for history but never listed or run.
// Personas are never deleted: evaluations.persona_id has no enforced FK action.

import { db } from "../index";
import { evaluationProfiles } from "../schema";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { resolveModel } from "@/lib/llm/models";
import type { Persona } from "@/types/review";

export type ProfileRow = typeof evaluationProfiles.$inferSelect;

export function parseWeights(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function toPersona(row: ProfileRow): Persona {
  const model = resolveModel(row.modelId);
  return {
    id: row.id,
    slug: row.slug ?? `persona-${row.id}`,
    name: row.name,
    description: row.description,
    systemPrompt: row.systemPrompt,
    criteriaWeights: parseWeights(row.criteriaWeights),
    modelSlug: model.slug,
    modelName: model.name,
    icon: row.icon,
    color: row.color,
    isActive: row.isActive,
    position: row.position,
  };
}

/** Council members by position (active and inactive). */
export function listPersonas(): Persona[] {
  return db
    .select()
    .from(evaluationProfiles)
    .where(isNotNull(evaluationProfiles.slug))
    .orderBy(asc(evaluationProfiles.position), asc(evaluationProfiles.id))
    .all()
    .map(toPersona);
}

/** A persona row (null for legacy profiles without a slug). */
export function getPersonaRow(id: number): ProfileRow | undefined {
  return db
    .select()
    .from(evaluationProfiles)
    .where(and(eq(evaluationProfiles.id, id), isNotNull(evaluationProfiles.slug)))
    .get();
}

/** Persona rows by id, including legacy profiles (for labelling history). */
export function getProfileRowsByIds(ids: number[]): ProfileRow[] {
  if (ids.length === 0) return [];
  return db.select().from(evaluationProfiles).where(inArray(evaluationProfiles.id, ids)).all();
}

export function updatePersona(
  id: number,
  data: Partial<{
    name: string;
    description: string;
    systemPrompt: string;
    criteriaWeights: Record<string, number>;
    modelSlug: string;
    isActive: boolean;
    position: number;
  }>
): Persona | null {
  const { criteriaWeights, modelSlug, ...rest } = data;
  const set: Partial<typeof evaluationProfiles.$inferInsert> = { ...rest };
  if (criteriaWeights !== undefined) set.criteriaWeights = JSON.stringify(criteriaWeights);
  if (modelSlug !== undefined) set.modelId = modelSlug;
  const row = db
    .update(evaluationProfiles)
    .set({ ...set, updatedAt: sql`(datetime('now'))` })
    .where(and(eq(evaluationProfiles.id, id), isNotNull(evaluationProfiles.slug)))
    .returning()
    .get();
  return row ? toPersona(row) : null;
}

/** Slug and name per profile id, for labelling stored evaluations. */
export function getPersonaLabels(ids: Iterable<number>): Map<number, { slug: string; name: string }> {
  const unique = [...new Set(ids)];
  return new Map(getProfileRowsByIds(unique).map((row) => [row.id, { slug: row.slug ?? `persona-${row.id}`, name: row.name }]));
}
