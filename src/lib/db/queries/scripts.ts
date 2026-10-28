import fs from "fs";
import path from "path";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import { db } from "../index";
import {
  beats,
  directionRuns,
  evaluations,
  factChecks,
  factIssues,
  notes,
  productionDirections,
  scriptTags,
  scriptVersions,
  scripts,
  suggestions,
} from "../schema";
import { countSpokenWords, firstH1Text } from "@/lib/utils/reading-time";
import { displayTitle as titleFor, headingTitle } from "@/lib/utils/titles";

export type ScriptRow = typeof scripts.$inferSelect;
export type ScriptVersionRow = typeof scriptVersions.$inferSelect;
/**
 * A script as sent to the client: the draft travels as ScriptDetail.content,
 * and the legacy file-backed columns (source, file_path) are left out.
 */
export type PublicScript = Omit<ScriptRow, "draftContent" | "source" | "filePath">;

export interface ScriptSummaryRow extends PublicScript {
  spokenWords: number;
  heading: string | null;
  lastScore: number | null;
  lastReviewedAt: string | null;
}

export interface ScriptDetailRow {
  script: PublicScript;
  latestVersion: ScriptVersionRow | null;
  content: string;
}

/** Largest script body accepted from the client (characters). */
export const MAX_CONTENT_LENGTH = 2_000_000;

const NOW = sql`(datetime('now'))`;

type ScriptSet = SQLiteUpdateSetSource<typeof scripts>;

export function withoutDraft(row: ScriptRow): PublicScript {
  const copy: Partial<ScriptRow> = { ...row };
  delete copy.draftContent;
  delete copy.source;
  delete copy.filePath;
  return copy as PublicScript;
}

// ---------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------

/**
 * Drafts page rows: non-template scripts, archived or not, most recently
 * edited first. Spoken words come from the draft (else the latest version);
 * the score is the latest whole-script council synthesis.
 */
export function listScriptSummaries(options: { archived?: boolean } = {}): ScriptSummaryRow[] {
  const archived = options.archived ?? false;
  // Correlated subqueries name the outer table explicitly: drizzle renders
  // ${scripts.id} unqualified in a single-table select, which would bind to
  // the inner table's own id column.
  const latestSummary = (column: ReturnType<typeof sql>) => sql`(
    SELECT ${column} FROM evaluations e
    WHERE e.script_id = scripts.id
      AND e.is_master_summary = 1
      AND e.run_id IS NOT NULL
      AND e.section_only IS NULL
      AND e.structured_result IS NOT NULL
    ORDER BY e.id DESC
    LIMIT 1
  )`;

  const rows = db
    .select({
      script: scripts,
      latestContent: sql<string | null>`(
        SELECT v.content FROM script_versions v
        WHERE v.script_id = scripts.id
        ORDER BY v.version DESC
        LIMIT 1
      )`,
      lastScore: latestSummary(
        sql`CASE WHEN json_valid(e.structured_result) THEN json_extract(e.structured_result, '$.overall.average') END`
      ).mapWith((v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)),
      lastReviewedAt: latestSummary(sql`e.created_at`).mapWith((v: unknown) => (typeof v === "string" ? v : null)),
    })
    .from(scripts)
    .where(and(eq(scripts.isTemplate, false), eq(scripts.archived, archived)))
    .orderBy(sql`datetime(${scripts.updatedAt}) DESC`, desc(scripts.id))
    .all();

  return rows.map((row) => ({
    ...withoutDraft(row.script),
    spokenWords: countSpokenWords(row.script.draftContent ?? row.latestContent ?? ""),
    heading: firstHeading(row.script.draftContent ?? row.latestContent ?? ""),
    lastScore: row.lastScore,
    lastReviewedAt: row.lastReviewedAt,
  }));
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

/** What the editor opens: the autosaved draft, else the latest saved version. */
export function getScriptDetail(id: number): ScriptDetailRow | null {
  const script = getScript(id);
  if (!script) return null;
  const latestVersion = getLatestVersion(id) ?? null;
  return {
    script: withoutDraft(script),
    latestVersion,
    content: script.draftContent ?? latestVersion?.content ?? "",
  };
}

/**
 * Create a script. A version row exists only when there is content to
 * snapshot; an empty new script has current_version 0 until its first save.
 */
export function createScript(
  title: string = "",
  content: string = "",
  options?: {
    context?: string;
    targetLength?: number | null;
    isTemplate?: boolean;
    templateDescription?: string;
    /** Unsaved working text (used for template copies). */
    draftContent?: string | null;
  }
): ScriptRow {
  const hasContent = content.trim() !== "";
  return db.transaction((tx) => {
    const script = tx
      .insert(scripts)
      .values({
        title,
        currentVersion: hasContent ? 1 : 0,
        context: options?.context ?? "",
        targetLength: options?.targetLength ?? null,
        isTemplate: options?.isTemplate ?? false,
        templateDescription: options?.templateDescription ?? null,
        draftContent: options?.draftContent ?? null,
      })
      .returning()
      .get();
    if (hasContent) {
      tx.insert(scriptVersions)
        .values({ scriptId: script.id, version: 1, content, wordCount: countSpokenWords(content) })
        .run();
    }
    return script;
  });
}

/**
 * The only create step for templates: ONE new script whose draft is the
 * template body. No version is saved until the writer saves their own words.
 */
export function createScriptFromTemplate(templateId: number, titleOverride?: string): ScriptRow | null {
  const template = getScript(templateId);
  if (!template || !template.isTemplate) return null;
  const body = template.draftContent ?? getLatestVersion(templateId)?.content ?? "";
  return createScript(titleOverride?.trim() ?? "", "", {
    context: template.context,
    targetLength: template.targetLength,
    draftContent: body === "" ? null : body,
  });
}

export interface ScriptPatch {
  title?: string;
  context?: string;
  targetLength?: number | null;
  draftContent?: string | null;
  archived?: boolean;
  icon?: string | null;
  status?: string;
}

/**
 * Partial update. Writing `draftContent` is the autosave path; it never
 * touches script_versions. A draft identical to the latest version is stored
 * as NULL (nothing unsaved). Archive/icon changes don't count as edits.
 */
export function updateScript(id: number, patch: ScriptPatch): ScriptRow | undefined {
  const set: ScriptSet = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.context !== undefined) set.context = patch.context;
  if (patch.targetLength !== undefined) set.targetLength = patch.targetLength;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.archived !== undefined) set.archived = patch.archived;
  if (patch.icon !== undefined) set.icon = patch.icon;
  if (patch.draftContent !== undefined) {
    const latest = patch.draftContent === null ? undefined : getLatestVersion(id);
    set.draftContent = latest && latest.content === patch.draftContent ? null : patch.draftContent;
  }

  const isEdit = ["title", "context", "targetLength", "status", "draftContent"].some(
    (key) => patch[key as keyof ScriptPatch] !== undefined
  );
  if (Object.keys(set).length === 0) return getScript(id);

  return db
    .update(scripts)
    .set(isEdit ? { ...set, updatedAt: NOW } : set)
    .where(eq(scripts.id, id))
    .returning()
    .get();
}

/** True when deleting would lose nothing: no saved version and no draft text. */
export function isScriptEmpty(id: number): boolean {
  const script = getScript(id);
  if (!script) return true;
  return !getLatestVersion(id) && (script.draftContent ?? "").trim() === "";
}

/**
 * Permanently delete a script and everything that hangs off it, in one
 * transaction. Dependents are deleted explicitly rather than trusting ON
 * DELETE CASCADE: columns added by ALTER (fact_issues.fact_check_id) aren't
 * cascaded by SQLite, and fact_issues must go before fact_checks.
 */
export function deleteScript(id: number): boolean {
  return db.transaction((tx) => {
    const existing = tx.select({ id: scripts.id }).from(scripts).where(eq(scripts.id, id)).get();
    if (!existing) return false;

    const checkIds = tx
      .select({ id: factChecks.id })
      .from(factChecks)
      .where(eq(factChecks.scriptId, id))
      .all()
      .map((row) => row.id);

    tx.delete(factIssues).where(eq(factIssues.scriptId, id)).run();
    if (checkIds.length > 0) tx.delete(factIssues).where(inArray(factIssues.factCheckId, checkIds)).run();
    tx.delete(factChecks).where(eq(factChecks.scriptId, id)).run();
    tx.delete(notes).where(eq(notes.scriptId, id)).run();
    tx.delete(beats).where(eq(beats.scriptId, id)).run();
    tx.delete(suggestions).where(eq(suggestions.scriptId, id)).run();
    tx.delete(evaluations).where(eq(evaluations.scriptId, id)).run();
    tx.delete(productionDirections).where(eq(productionDirections.scriptId, id)).run();
    tx.delete(directionRuns).where(eq(directionRuns.scriptId, id)).run();
    tx.delete(scriptTags).where(eq(scriptTags.scriptId, id)).run();
    tx.delete(scriptVersions).where(eq(scriptVersions.scriptId, id)).run();
    tx.delete(scripts).where(eq(scripts.id, id)).run();
    return true;
  });
}

// ---------------------------------------------------------------------------
// Versions (immutable: nothing here or anywhere UPDATEs script_versions.content)
// ---------------------------------------------------------------------------

/**
 * All versions, newest first. wordCount is recounted from the content: the
 * stored column was written under older counting rules (raw tokens, Tiptap's
 * "&nbsp;" blank-line markers counted as words).
 */
export function getScriptVersions(scriptId: number): ScriptVersionRow[] {
  return db
    .select()
    .from(scriptVersions)
    .where(eq(scriptVersions.scriptId, scriptId))
    .orderBy(desc(scriptVersions.version))
    .all()
    .map((v) => ({ ...v, wordCount: countSpokenWords(v.content) }));
}

export function getScriptVersion(id: number) {
  return db.select().from(scriptVersions).where(eq(scriptVersions.id, id)).get();
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

export interface VersionSavePlan {
  /** A new immutable version is needed (content differs from the latest). */
  create: boolean;
  /** Version number of the result (new or existing). */
  version: number;
  /**
   * The draft equals what is now saved, so it can be cleared. A different
   * draft is kept because it may be newer (text typed during the save, or
   * another tab's): the client lands older draft writes before saving a
   * version (DraftSaver.saveVersion), and if one of them failed, its retry
   * replaces the draft.
   */
  clearDraft: boolean;
}

/** Pure decision for saveVersion: exact string comparison, no normalisation. */
export function planVersionSave(
  latest: { version: number; content: string } | null | undefined,
  content: string,
  draftContent: string | null
): VersionSavePlan {
  const create = !latest || latest.content !== content;
  return {
    create,
    version: create ? (latest?.version ?? 0) + 1 : latest.version,
    clearDraft: draftContent !== null && draftContent === content,
  };
}

/**
 * Snapshot `content` as a new immutable version unless it matches the latest
 * version exactly; then the latest is returned with created=false. Returns
 * null when the script doesn't exist.
 */
export function saveVersion(
  scriptId: number,
  content: string
): { version: ScriptVersionRow; created: boolean } | null {
  return db.transaction((tx) => {
    const script = tx.select().from(scripts).where(eq(scripts.id, scriptId)).get();
    if (!script) return null;
    const latest = tx
      .select()
      .from(scriptVersions)
      .where(eq(scriptVersions.scriptId, scriptId))
      .orderBy(desc(scriptVersions.version))
      .limit(1)
      .get();

    const plan = planVersionSave(latest, content, script.draftContent);
    const version =
      plan.create || !latest
        ? tx
            .insert(scriptVersions)
            .values({ scriptId, version: plan.version, content, wordCount: countSpokenWords(content) })
            .returning()
            .get()
        : { ...latest, wordCount: countSpokenWords(latest.content) };

    const set: ScriptSet = {};
    if (plan.create) set.updatedAt = NOW;
    if (script.currentVersion !== version.version) set.currentVersion = version.version;
    if (plan.clearDraft) set.draftContent = null;
    if (Object.keys(set).length > 0) {
      tx.update(scripts).set(set).where(eq(scripts.id, scriptId)).run();
    }
    return { version, created: plan.create };
  });
}

// ---------------------------------------------------------------------------
// Markdown export (export-all, and the safety copy taken before a delete)
// ---------------------------------------------------------------------------

export interface ScriptExport {
  /** "<id>-<slug>" */
  dirName: string;
  /** Relative path (forward slashes) -> file contents. */
  files: Record<string, string>;
}

export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  return slug || "untitled";
}

/**
 * The text of the first `# Heading` in a script (fenced code skipped), or
 * null. A template's placeholder heading (`# [Title]`) is not a heading.
 */
export function firstHeading(content: string): string | null {
  return headingTitle(firstH1Text(content)) || null;
}

/**
 * The title shown for a script: its title (the legacy "Untitled Script"
 * default counts as none), else its first H1, else "Untitled script".
 */
export function displayTitle(title: string, content: string): string {
  return titleFor(title, firstHeading(content));
}

function frontMatter(fields: Record<string, string | number | boolean | null | undefined>): string {
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---\n\n`;
}

function parseList(json: string | null | undefined): string[] {
  try {
    const value: unknown = JSON.parse(json ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** A note's models, once each: they are stored 1:1 with its lenses, "" when unknown. */
function models(json: string | null | undefined): string[] {
  return [...new Set(parseList(json).filter(Boolean))];
}

function quoteBlock(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");
}

/** Everything about one script as Markdown files (null if it doesn't exist). */
export function buildScriptExport(scriptId: number, exportedAt: Date = new Date()): ScriptExport | null {
  const script = getScript(scriptId);
  if (!script) return null;

  const versions = db
    .select()
    .from(scriptVersions)
    .where(eq(scriptVersions.scriptId, scriptId))
    .orderBy(asc(scriptVersions.version))
    .all();
  const latest = versions.at(-1);
  const content = script.draftContent ?? latest?.content ?? "";
  const title = displayTitle(script.title, content);
  const versionNumber = new Map(versions.map((v) => [v.id, v.version]));
  const files: Record<string, string> = {};

  files["script.md"] =
    frontMatter({
      title,
      id: script.id,
      status: script.status,
      archived: script.archived,
      saved_version: latest?.version ?? null,
      unsaved_draft: script.draftContent !== null && script.draftContent !== (latest?.content ?? ""),
      spoken_words: countSpokenWords(content),
      target_words: script.targetLength,
      created_utc: script.createdAt,
      updated_utc: script.updatedAt,
      exported: exportedAt.toISOString(),
      brief: script.context,
    }) + content;

  for (const v of versions) {
    files[`versions/v${String(v.version).padStart(3, "0")}.md`] =
      frontMatter({
        title,
        script_id: script.id,
        version: v.version,
        created_utc: v.createdAt,
        spoken_words: countSpokenWords(v.content),
      }) + v.content;
  }

  const noteRows = db
    .select()
    .from(notes)
    .where(eq(notes.scriptId, scriptId))
    .orderBy(asc(notes.id))
    .all();
  const noteSections = (["open", "addressed", "dismissed"] as const).map((status) => {
    const group = noteRows.filter((n) => n.status === status);
    const heading = `## ${status[0].toUpperCase()}${status.slice(1)} (${group.length})`;
    const items = group.map((n) => {
      const meta = [
        parseList(n.personaSlugs).length ? `Lenses: ${parseList(n.personaSlugs).join(", ")}` : null,
        models(n.sourceModels).length ? `Models: ${models(n.sourceModels).join(", ")}` : null,
        `Priority: ${n.priority}`,
        `Category: ${n.category}`,
        versionNumber.has(n.versionId) ? `Version: v${versionNumber.get(n.versionId)}` : null,
        `Raised (UTC): ${n.createdAt}`,
      ].filter(Boolean);
      return [
        `### ${n.issue}`,
        "",
        quoteBlock(n.anchorText),
        "",
        n.why ? `- Why: ${n.why}` : null,
        n.question ? `- Question: ${n.question}` : null,
        `- ${meta.join(" · ")}`,
      ]
        .filter((line) => line !== null)
        .join("\n");
    });
    return [heading, "", ...(items.length ? items : ["None."])].join("\n\n");
  });
  files["notes.md"] = `# Council notes: ${title}\n\n${noteRows.length ? noteSections.join("\n\n") : "No council notes yet."}\n`;

  const beatRows = db
    .select()
    .from(beats)
    .where(eq(beats.scriptId, scriptId))
    .orderBy(asc(beats.position), asc(beats.id))
    .all();
  const beatItems = beatRows.map((b, i) => {
    const meta = [b.status, b.targetSeconds ? `~${b.targetSeconds} s` : null, b.source === "ai" ? "suggested" : "writer"]
      .filter(Boolean)
      .join(", ");
    return [
      `${i + 1}. **${b.title}** (${meta})`,
      b.purpose ? `   ${b.purpose}` : null,
      b.writerNotes ? `   Notes: ${b.writerNotes.replace(/\r?\n/g, "\n   ")}` : null,
      b.anchorText ? `   Happens at: "${b.anchorText}"` : null,
    ]
      .filter((line) => line !== null)
      .join("\n");
  });
  files["beats.md"] = `# Beat sheet: ${title}\n\n${beatItems.length ? beatItems.join("\n\n") : "No beats yet."}\n`;

  const summaries = db
    .select()
    .from(evaluations)
    .where(
      and(
        eq(evaluations.scriptId, scriptId),
        eq(evaluations.isMasterSummary, true),
        eq(evaluations.status, "complete")
      )
    )
    .orderBy(desc(evaluations.id))
    .all()
    .filter((e) => e.result.trim() !== "");
  if (summaries.length > 0) {
    const runs = summaries.map((e) => {
      const v = versionNumber.get(e.versionId);
      return `## ${v ? `v${v}` : "Unknown version"} · ${e.createdAt} UTC${e.sectionOnly ? " · section review" : ""}\n\n${e.result.trim()}`;
    });
    files["council.md"] = `# Council syntheses: ${title}\n\n${runs.join("\n\n---\n\n")}\n`;
  }

  return { dirName: `${script.id}-${slugify(title)}`, files };
}

/** Write an export under `parentDir/<dirName>`; returns that folder. */
export function writeScriptExport(parentDir: string, exp: ScriptExport): string {
  const root = path.join(parentDir, exp.dirName);
  for (const [relative, body] of Object.entries(exp.files)) {
    const file = path.join(root, ...relative.split("/"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body, "utf8");
  }
  return root;
}

/** Ids of every non-template script, archived included. */
export function listExportableScriptIds(): number[] {
  return db
    .select({ id: scripts.id })
    .from(scripts)
    .where(eq(scripts.isTemplate, false))
    .orderBy(asc(scripts.id))
    .all()
    .map((row) => row.id);
}
