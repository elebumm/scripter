import { db } from "../index";
import { factChecks } from "../schema";
import { eq, and, desc } from "drizzle-orm";

export function createFactCheck(data: {
  scriptId: number;
  versionId: number;
  modelId: string;
  modelProvider: string;
  result: string;
  isSummary: boolean;
  status: "pending" | "streaming" | "complete" | "error";
}) {
  return db.insert(factChecks).values(data).returning().get();
}

export function updateFactCheck(
  id: number,
  data: Partial<{
    result: string;
    structuredResult: string | null;
    status: "pending" | "streaming" | "complete" | "error";
    errorMessage: string | null;
    searchCount: number;
    durationMs: number;
  }>
) {
  return db
    .update(factChecks)
    .set(data)
    .where(eq(factChecks.id, id))
    .returning()
    .get();
}

export function getFactChecksForVersion(
  scriptId: number,
  versionId: number
) {
  return db
    .select()
    .from(factChecks)
    .where(
      and(
        eq(factChecks.scriptId, scriptId),
        eq(factChecks.versionId, versionId)
      )
    )
    .orderBy(desc(factChecks.createdAt))
    .all();
}

export function getLatestFactChecks(
  scriptId: number,
  versionId: number
) {
  return db
    .select()
    .from(factChecks)
    .where(
      and(
        eq(factChecks.scriptId, scriptId),
        eq(factChecks.versionId, versionId),
        eq(factChecks.isSummary, false)
      )
    )
    .orderBy(desc(factChecks.createdAt))
    .all();
}
