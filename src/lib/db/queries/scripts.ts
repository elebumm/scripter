import { db } from "../index";
import { scripts, scriptVersions } from "../schema";
import { eq, desc } from "drizzle-orm";

export function listScripts() {
  return db
    .select()
    .from(scripts)
    .where(eq(scripts.isTemplate, false))
    .orderBy(desc(scripts.updatedAt))
    .all();
}

export function listTemplates() {
  return db
    .select()
    .from(scripts)
    .where(eq(scripts.isTemplate, true))
    .orderBy(scripts.title)
    .all();
}

export function getScript(id: number) {
  return db.select().from(scripts).where(eq(scripts.id, id)).get();
}

export function createScript(
  title: string,
  content: string = "",
  options?: {
    source?: "app" | "file";
    filePath?: string;
    context?: string;
    targetLength?: number;
    isTemplate?: boolean;
    templateDescription?: string;
  }
) {
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const script = db
    .insert(scripts)
    .values({
      title,
      currentVersion: 1,
      source: options?.source ?? "app",
      filePath: options?.filePath ?? null,
      context: options?.context ?? "",
      targetLength: options?.targetLength ?? null,
      isTemplate: options?.isTemplate ?? false,
      templateDescription: options?.templateDescription ?? null,
    })
    .returning()
    .get();
  db.insert(scriptVersions)
    .values({
      scriptId: script.id,
      version: 1,
      content,
      wordCount,
    })
    .run();
  return script;
}

export function createScriptFromTemplate(templateId: number, titleOverride?: string) {
  const template = db.select().from(scripts).where(eq(scripts.id, templateId)).get();
  if (!template || !template.isTemplate) return null;

  const templateVersion = db
    .select()
    .from(scriptVersions)
    .where(eq(scriptVersions.scriptId, templateId))
    .orderBy(desc(scriptVersions.version))
    .limit(1)
    .get();

  return createScript(
    titleOverride || `${template.title} (Copy)`,
    templateVersion?.content ?? "",
    {
      context: template.context,
      targetLength: template.targetLength ?? undefined,
    }
  );
}

export function findScriptByFilePath(filePath: string) {
  return db
    .select()
    .from(scripts)
    .where(eq(scripts.filePath, filePath))
    .get();
}

export function updateScript(
  id: number,
  data: { title?: string; context?: string; targetLength?: number | null; status?: string }
) {
  return db
    .update(scripts)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(scripts.id, id))
    .returning()
    .get();
}

export function deleteScript(id: number) {
  return db.delete(scripts).where(eq(scripts.id, id)).run();
}

export function getScriptVersions(scriptId: number) {
  return db
    .select()
    .from(scriptVersions)
    .where(eq(scriptVersions.scriptId, scriptId))
    .orderBy(desc(scriptVersions.version))
    .all();
}

export function getScriptVersion(id: number) {
  return db
    .select()
    .from(scriptVersions)
    .where(eq(scriptVersions.id, id))
    .get();
}

export function getLatestVersion(scriptId: number) {
  return db
    .select()
    .from(scriptVersions)
    .where(eq(scriptVersions.scriptId, scriptId))
    .orderBy(desc(scriptVersions.version))
    .limit(1)
    .get();
}

export function createVersion(
  scriptId: number,
  content: string,
  version: number
) {
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const ver = db
    .insert(scriptVersions)
    .values({ scriptId, version, content, wordCount })
    .returning()
    .get();
  db.update(scripts)
    .set({ currentVersion: version, updatedAt: new Date().toISOString() })
    .where(eq(scripts.id, scriptId))
    .run();
  return ver;
}
