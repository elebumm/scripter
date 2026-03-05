import { db } from "../index";
import { tags, scriptTags } from "../schema";
import { eq, inArray } from "drizzle-orm";

export function listTags() {
  return db.select().from(tags).all();
}

export function createTag(name: string, color?: string) {
  return db
    .insert(tags)
    .values({ name, color: color ?? null })
    .returning()
    .get();
}

export function findOrCreateTag(name: string) {
  const existing = db
    .select()
    .from(tags)
    .where(eq(tags.name, name))
    .get();
  if (existing) return existing;
  return createTag(name);
}

export function deleteTag(id: number) {
  return db.delete(tags).where(eq(tags.id, id)).run();
}

export function updateTag(id: number, data: { name?: string; color?: string | null }) {
  return db
    .update(tags)
    .set(data)
    .where(eq(tags.id, id))
    .returning()
    .get();
}

export function getTagsForScript(scriptId: number) {
  return db
    .select({ id: tags.id, name: tags.name, color: tags.color, createdAt: tags.createdAt })
    .from(scriptTags)
    .innerJoin(tags, eq(scriptTags.tagId, tags.id))
    .where(eq(scriptTags.scriptId, scriptId))
    .all();
}

export function getTagsForScripts(scriptIds: number[]) {
  if (scriptIds.length === 0) return {};

  const rows = db
    .select({
      scriptId: scriptTags.scriptId,
      id: tags.id,
      name: tags.name,
      color: tags.color,
      createdAt: tags.createdAt,
    })
    .from(scriptTags)
    .innerJoin(tags, eq(scriptTags.tagId, tags.id))
    .where(inArray(scriptTags.scriptId, scriptIds))
    .all();

  const result: Record<number, Array<{ id: number; name: string; color: string | null; createdAt: string }>> = {};
  for (const row of rows) {
    if (!result[row.scriptId]) result[row.scriptId] = [];
    result[row.scriptId].push({
      id: row.id,
      name: row.name,
      color: row.color,
      createdAt: row.createdAt,
    });
  }
  return result;
}

export function setTagsForScript(scriptId: number, tagIds: number[]) {
  db.delete(scriptTags).where(eq(scriptTags.scriptId, scriptId)).run();
  if (tagIds.length > 0) {
    db.insert(scriptTags)
      .values(tagIds.map((tagId) => ({ scriptId, tagId })))
      .run();
  }
}

export function addTagToScript(scriptId: number, tagId: number) {
  // Check if already exists
  const existing = db
    .select()
    .from(scriptTags)
    .where(eq(scriptTags.scriptId, scriptId))
    .all()
    .find((r) => r.tagId === tagId);
  if (existing) return;
  db.insert(scriptTags).values({ scriptId, tagId }).run();
}

export function removeTagFromScript(scriptId: number, tagId: number) {
  const rows = db
    .select()
    .from(scriptTags)
    .where(eq(scriptTags.scriptId, scriptId))
    .all();
  const row = rows.find((r) => r.tagId === tagId);
  if (row) {
    db.delete(scriptTags).where(eq(scriptTags.id, row.id)).run();
  }
}
