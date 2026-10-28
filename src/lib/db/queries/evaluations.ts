import { db } from "../index";
import { evaluations, scripts, scriptVersions } from "../schema";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, ne } from "drizzle-orm";

export type EvaluationRow = typeof evaluations.$inferSelect;
export type EvaluationStatus = EvaluationRow["status"];
export type EvaluationWithVersion = EvaluationRow & { versionNumber: number };

/**
 * The script and one of its versions, or null when the version doesn't
 * belong to the script. Council routes load content from here and never
 * trust content sent by the client.
 */
export function getScriptVersionPair(scriptId: number, versionId: number) {
  const script = db.select().from(scripts).where(eq(scripts.id, scriptId)).get();
  if (!script) return null;
  const version = db
    .select()
    .from(scriptVersions)
    .where(and(eq(scriptVersions.id, versionId), eq(scriptVersions.scriptId, scriptId)))
    .get();
  if (!version) return null;
  return { script, version };
}

export function getVersionContent(versionId: number): string | null {
  const row = db
    .select({ content: scriptVersions.content })
    .from(scriptVersions)
    .where(eq(scriptVersions.id, versionId))
    .get();
  return row?.content ?? null;
}

export function createEvaluation(data: {
  scriptId: number;
  versionId: number;
  runId: string | null;
  personaId?: number | null;
  modelId: string;
  modelProvider?: string;
  result?: string;
  isMasterSummary?: boolean;
  sectionOnly?: string | null;
  status: EvaluationStatus;
}): EvaluationRow {
  return db
    .insert(evaluations)
    .values({
      scriptId: data.scriptId,
      versionId: data.versionId,
      runId: data.runId,
      personaId: data.personaId ?? null,
      profileId: null,
      modelId: data.modelId,
      modelProvider: data.modelProvider ?? "openrouter",
      result: data.result ?? "",
      isMasterSummary: data.isMasterSummary ?? false,
      sectionOnly: data.sectionOnly ?? null,
      status: data.status,
    })
    .returning()
    .get();
}

export function updateEvaluation(
  id: number,
  data: Partial<{
    result: string;
    structuredResult: string | null;
    status: EvaluationStatus;
    errorMessage: string | null;
    durationMs: number | null;
    tokensIn: number | null;
    tokensOut: number | null;
    costUsd: number | null;
  }>
): EvaluationRow | undefined {
  return db.update(evaluations).set(data).where(eq(evaluations.id, id)).returning().get();
}

/** Every row of one council run (critiques and summaries), oldest first. */
export function getRunRows(scriptId: number, runId: string): EvaluationRow[] {
  return db
    .select()
    .from(evaluations)
    .where(and(eq(evaluations.scriptId, scriptId), eq(evaluations.runId, runId)))
    .orderBy(asc(evaluations.id))
    .all();
}

/**
 * Summary rows of a run started before `beforeId` (earlier synthesis attempts,
 * any status). A re-synthesis folds their tokens and cost into its own row.
 */
export function getEarlierSummaries(scriptId: number, runId: string, beforeId: number): EvaluationRow[] {
  return db
    .select()
    .from(evaluations)
    .where(
      and(
        eq(evaluations.scriptId, scriptId),
        eq(evaluations.runId, runId),
        eq(evaluations.isMasterSummary, true),
        lt(evaluations.id, beforeId)
      )
    )
    .orderBy(asc(evaluations.id))
    .all();
}

/**
 * After a re-synthesis succeeds, the run's earlier summary rows are obsolete.
 * A synthesis started later (still running) is left alone.
 */
export function deleteEarlierSummaries(scriptId: number, runId: string, keepId: number) {
  return db
    .delete(evaluations)
    .where(
      and(
        eq(evaluations.scriptId, scriptId),
        eq(evaluations.runId, runId),
        eq(evaluations.isMasterSummary, true),
        lt(evaluations.id, keepId)
      )
    )
    .run();
}

/**
 * The most recent whole-script run with a saved synthesis (section reviews
 * excluded), other than `excludeRunId`.
 */
export function getPreviousWholeRunId(scriptId: number, excludeRunId?: string | null): string | null {
  const conditions = [
    eq(evaluations.scriptId, scriptId),
    eq(evaluations.isMasterSummary, true),
    eq(evaluations.status, "complete"),
    isNotNull(evaluations.runId),
    isNull(evaluations.sectionOnly),
  ];
  if (excludeRunId) conditions.push(ne(evaluations.runId, excludeRunId));
  const row = db
    .select({ runId: evaluations.runId })
    .from(evaluations)
    .where(and(...conditions))
    .orderBy(desc(evaluations.id))
    .limit(1)
    .get();
  return row?.runId ?? null;
}

export interface LatestPass {
  runId: string;
  versionId: number;
  versionNumber: number;
  /** When the run started (its earliest row), UTC as stored. */
  startedAt: string;
}

/** The most recent council pass with a saved synthesis (whole or section), or null. */
export function getLatestPass(scriptId: number): LatestPass | null {
  const row = db
    .select({
      runId: evaluations.runId,
      versionId: evaluations.versionId,
      versionNumber: scriptVersions.version,
    })
    .from(evaluations)
    .innerJoin(scriptVersions, eq(scriptVersions.id, evaluations.versionId))
    .where(
      and(
        eq(evaluations.scriptId, scriptId),
        eq(evaluations.isMasterSummary, true),
        eq(evaluations.status, "complete"),
        isNotNull(evaluations.runId)
      )
    )
    .orderBy(desc(evaluations.id))
    .limit(1)
    .get();
  if (!row?.runId) return null;
  const start = db
    .select({ createdAt: evaluations.createdAt })
    .from(evaluations)
    .where(and(eq(evaluations.scriptId, scriptId), eq(evaluations.runId, row.runId)))
    .orderBy(asc(evaluations.id))
    .limit(1)
    .get();
  return { ...row, runId: row.runId, startedAt: start?.createdAt ?? "" };
}

/** Latest saved synthesis row; whole-script runs win over section reviews. */
export function getLatestSummaryRow(scriptId: number): EvaluationRow | undefined {
  const base = [
    eq(evaluations.scriptId, scriptId),
    eq(evaluations.isMasterSummary, true),
    eq(evaluations.status, "complete"),
    isNotNull(evaluations.runId),
  ];
  const whole = db
    .select()
    .from(evaluations)
    .where(and(...base, isNull(evaluations.sectionOnly)))
    .orderBy(desc(evaluations.id))
    .limit(1)
    .get();
  if (whole) return whole;
  return db.select().from(evaluations).where(and(...base)).orderBy(desc(evaluations.id)).limit(1).get();
}

/** All evaluations for a script with their version numbers, oldest first. */
export function getScriptEvaluations(scriptId: number, runIds?: string[]): EvaluationWithVersion[] {
  const conditions = [eq(evaluations.scriptId, scriptId)];
  if (runIds) conditions.push(inArray(evaluations.runId, runIds));
  return db
    .select({ evaluation: evaluations, versionNumber: scriptVersions.version })
    .from(evaluations)
    .innerJoin(scriptVersions, eq(scriptVersions.id, evaluations.versionId))
    .where(and(...conditions))
    .orderBy(asc(evaluations.id))
    .all()
    .map((r) => ({ ...r.evaluation, versionNumber: r.versionNumber }));
}
