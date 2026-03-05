import { db } from "../index";
import { suggestions } from "../schema";
import { eq, and, desc } from "drizzle-orm";

export function getSuggestionsForVersion(scriptId: number, versionId: number) {
  return db
    .select()
    .from(suggestions)
    .where(
      and(
        eq(suggestions.scriptId, scriptId),
        eq(suggestions.versionId, versionId)
      )
    )
    .orderBy(desc(suggestions.createdAt))
    .all();
}

export function createSuggestionsBatch(
  scriptId: number,
  versionId: number,
  items: Array<{
    originalText: string;
    suggestedText: string;
    reasoning: string;
    priority: string;
    category: string;
    sourceModels: string[];
  }>
) {
  const rows = items.map((item) => ({
    scriptId,
    versionId,
    originalText: item.originalText,
    suggestedText: item.suggestedText,
    reasoning: item.reasoning,
    priority: item.priority,
    category: item.category,
    sourceModels: JSON.stringify(item.sourceModels),
    status: "pending" as const,
  }));

  return db.insert(suggestions).values(rows).returning().all();
}

export function updateSuggestionStatus(
  id: number,
  status: "accepted" | "dismissed"
) {
  return db
    .update(suggestions)
    .set({ status })
    .where(eq(suggestions.id, id))
    .returning()
    .get();
}

export function deleteSuggestionsForVersion(
  scriptId: number,
  versionId: number
) {
  return db
    .delete(suggestions)
    .where(
      and(
        eq(suggestions.scriptId, scriptId),
        eq(suggestions.versionId, versionId)
      )
    )
    .run();
}
