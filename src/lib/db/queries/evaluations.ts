import { db } from "../index";
import { evaluations } from "../schema";
import { eq, and, desc, ne } from "drizzle-orm";

export function getEvaluationsForVersion(versionId: number) {
  return db
    .select()
    .from(evaluations)
    .where(eq(evaluations.versionId, versionId))
    .orderBy(desc(evaluations.createdAt))
    .all();
}

export function getEvaluationsForScript(scriptId: number) {
  return db
    .select()
    .from(evaluations)
    .where(eq(evaluations.scriptId, scriptId))
    .orderBy(desc(evaluations.createdAt))
    .all();
}

export function createEvaluation(data: {
  scriptId: number;
  versionId: number;
  profileId?: number | null;
  modelId: string;
  modelProvider: string;
  result: string;
  isMasterSummary?: boolean;
  sectionOnly?: string | null;
  status: "pending" | "streaming" | "complete" | "error";
  errorMessage?: string | null;
  durationMs?: number | null;
}) {
  return db
    .insert(evaluations)
    .values({
      scriptId: data.scriptId,
      versionId: data.versionId,
      profileId: data.profileId ?? null,
      modelId: data.modelId,
      modelProvider: data.modelProvider,
      result: data.result,
      isMasterSummary: data.isMasterSummary ?? false,
      sectionOnly: data.sectionOnly ?? null,
      status: data.status,
      errorMessage: data.errorMessage ?? null,
      durationMs: data.durationMs ?? null,
    })
    .returning()
    .get();
}

export function updateEvaluation(
  id: number,
  data: {
    result?: string;
    structuredResult?: string | null;
    status?: "pending" | "streaming" | "complete" | "error";
    errorMessage?: string | null;
    durationMs?: number | null;
  }
) {
  return db
    .update(evaluations)
    .set(data)
    .where(eq(evaluations.id, id))
    .returning()
    .get();
}

export function getPriorModelEvaluation(
  scriptId: number,
  modelId: string,
  excludeEvaluationId?: number
) {
  const conditions = [
    eq(evaluations.scriptId, scriptId),
    eq(evaluations.modelId, modelId),
    eq(evaluations.status, "complete"),
    eq(evaluations.isMasterSummary, false),
  ];
  if (excludeEvaluationId !== undefined) {
    conditions.push(ne(evaluations.id, excludeEvaluationId));
  }
  return db
    .select()
    .from(evaluations)
    .where(and(...conditions))
    .orderBy(desc(evaluations.createdAt))
    .limit(1)
    .get();
}

export function getLatestEvaluations(scriptId: number, versionId: number) {
  return db
    .select()
    .from(evaluations)
    .where(
      and(
        eq(evaluations.scriptId, scriptId),
        eq(evaluations.versionId, versionId),
        eq(evaluations.status, "complete")
      )
    )
    .orderBy(desc(evaluations.createdAt))
    .all();
}
