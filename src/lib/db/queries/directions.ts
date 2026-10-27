import { db } from "../index";
import { directionRuns, productionDirections } from "../schema";
import { eq, and, desc } from "drizzle-orm";

export function createDirectionRun(data: {
  scriptId: number;
  versionId: number;
  modelId: string;
  modelProvider: string;
  result: string;
  isSummary: boolean;
  status: "pending" | "streaming" | "complete" | "error";
}) {
  return db.insert(directionRuns).values(data).returning().get();
}

export function updateDirectionRun(
  id: number,
  data: Partial<{
    result: string;
    structuredResult: string | null;
    status: "pending" | "streaming" | "complete" | "error";
    errorMessage: string | null;
    durationMs: number;
  }>
) {
  return db
    .update(directionRuns)
    .set(data)
    .where(eq(directionRuns.id, id))
    .returning()
    .get();
}

export function getLatestDirectionRuns(
  scriptId: number,
  versionId: number
) {
  return db
    .select()
    .from(directionRuns)
    .where(
      and(
        eq(directionRuns.scriptId, scriptId),
        eq(directionRuns.versionId, versionId),
        eq(directionRuns.isSummary, false)
      )
    )
    .orderBy(desc(directionRuns.createdAt))
    .all();
}

export function getDirectionsForVersion(
  scriptId: number,
  versionId: number
) {
  return db
    .select()
    .from(productionDirections)
    .where(
      and(
        eq(productionDirections.scriptId, scriptId),
        eq(productionDirections.versionId, versionId)
      )
    )
    .orderBy(desc(productionDirections.createdAt))
    .all();
}

export function createDirectionsBatch(
  scriptId: number,
  versionId: number,
  items: Array<{
    originalText: string;
    directionType: string;
    reasoning: string;
    visualNotes?: string;
    confidence: string;
    agreeingModels: string[];
    disagreeingModels: Array<{ model: string; alternativeType: string }>;
  }>
) {
  const rows = items.map((item) => ({
    scriptId,
    versionId,
    originalText: item.originalText,
    directionType: item.directionType,
    reasoning: item.reasoning,
    visualNotes: item.visualNotes ?? null,
    confidence: item.confidence,
    agreeingModels: JSON.stringify(item.agreeingModels),
    disagreeingModels: JSON.stringify(item.disagreeingModels),
    status: "pending" as const,
  }));

  return db.insert(productionDirections).values(rows).returning().all();
}

export function updateDirectionStatus(
  id: number,
  status: "accepted" | "modified" | "dismissed",
  userOverrideType?: string
) {
  return db
    .update(productionDirections)
    .set({ status, userOverrideType: userOverrideType ?? null })
    .where(eq(productionDirections.id, id))
    .returning()
    .get();
}

export function deleteDirectionsForVersion(
  scriptId: number,
  versionId: number
) {
  return db
    .delete(productionDirections)
    .where(
      and(
        eq(productionDirections.scriptId, scriptId),
        eq(productionDirections.versionId, versionId)
      )
    )
    .run();
}
