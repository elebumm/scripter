import { db } from "../index";
import { factIssues } from "../schema";
import { eq, and, desc } from "drizzle-orm";

export function getFactIssuesForVersion(
  scriptId: number,
  versionId: number
) {
  return db
    .select()
    .from(factIssues)
    .where(
      and(
        eq(factIssues.scriptId, scriptId),
        eq(factIssues.versionId, versionId)
      )
    )
    .orderBy(desc(factIssues.createdAt))
    .all();
}

export function createFactIssuesBatch(
  scriptId: number,
  versionId: number,
  items: Array<{
    claimText: string;
    verdict: string;
    accuracy: number | null;
    correction: string | null;
    reasoning: string;
    sources: string[];
    isExaggeration: boolean;
    category: string;
    agentModels: string[];
  }>
) {
  const rows = items.map((item) => ({
    scriptId,
    versionId,
    claimText: item.claimText,
    verdict: item.verdict,
    accuracy: item.accuracy,
    correction: item.correction,
    reasoning: item.reasoning,
    sources: JSON.stringify(item.sources),
    isExaggeration: item.isExaggeration,
    category: item.category,
    agentModels: JSON.stringify(item.agentModels),
    status: "pending" as const,
  }));

  return db.insert(factIssues).values(rows).returning().all();
}

export function updateFactIssueStatus(
  id: number,
  status: "acknowledged" | "dismissed" | "corrected"
) {
  return db
    .update(factIssues)
    .set({ status })
    .where(eq(factIssues.id, id))
    .returning()
    .get();
}

export function deleteFactIssuesForVersion(
  scriptId: number,
  versionId: number
) {
  return db
    .delete(factIssues)
    .where(
      and(
        eq(factIssues.scriptId, scriptId),
        eq(factIssues.versionId, versionId)
      )
    )
    .run();
}
