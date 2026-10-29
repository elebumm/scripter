import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const scripts = sqliteTable("scripts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull().default("Untitled Script"),
  context: text("context").notNull().default(""),
  targetLength: integer("target_length"),
  currentVersion: integer("current_version").notNull().default(1),
  status: text("status").notNull().default("draft"), // "draft" | "in-progress" | "final"
  source: text("source").notNull().default("app"), // "app" | "file"
  filePath: text("file_path"), // absolute path for file-backed scripts
  icon: text("icon"), // Phosphor icon name, e.g. "Eye", "Brain", "Lightning"
  isTemplate: integer("is_template", { mode: "boolean" })
    .notNull()
    .default(false),
  templateDescription: text("template_description"),
  draftContent: text("draft_content"), // autosave target; versions are immutable snapshots
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Immutable once created: never UPDATE content.
export const scriptVersions = sqliteTable("script_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scriptId: integer("script_id")
    .notNull()
    .references(() => scripts.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  content: text("content").notNull().default(""),
  wordCount: integer("word_count").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const evaluations = sqliteTable("evaluations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scriptId: integer("script_id")
    .notNull()
    .references(() => scripts.id, { onDelete: "cascade" }),
  versionId: integer("version_id")
    .notNull()
    .references(() => scriptVersions.id, { onDelete: "cascade" }),
  profileId: integer("profile_id").references(() => evaluationProfiles.id, {
    onDelete: "set null",
  }),
  modelId: text("model_id").notNull(),
  modelProvider: text("model_provider").notNull(),
  result: text("result").notNull().default(""),
  isMasterSummary: integer("is_master_summary", { mode: "boolean" })
    .notNull()
    .default(false),
  sectionOnly: text("section_only"),
  status: text("status", {
    enum: ["pending", "streaming", "complete", "error"],
  })
    .notNull()
    .default("pending"),
  structuredResult: text("structured_result"),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  runId: text("run_id"), // groups one council run (critiques + summary); null for legacy rows
  personaId: integer("persona_id").references(() => evaluationProfiles.id, {
    onDelete: "set null",
  }),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  costUsd: real("cost_usd"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Council personas (rows with a slug). Legacy profiles have no slug and stay inactive.
export const evaluationProfiles = sqliteTable("evaluation_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  criteriaWeights: text("criteria_weights").notNull().default("{}"),
  isDefault: integer("is_default", { mode: "boolean" })
    .notNull()
    .default(false),
  slug: text("slug").unique(),
  description: text("description").notNull().default(""),
  modelId: text("model_id"), // model registry slug, see src/lib/llm/models.ts
  icon: text("icon"),
  color: text("color"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const suggestions = sqliteTable("suggestions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scriptId: integer("script_id")
    .notNull()
    .references(() => scripts.id, { onDelete: "cascade" }),
  versionId: integer("version_id")
    .notNull()
    .references(() => scriptVersions.id, { onDelete: "cascade" }),
  originalText: text("original_text").notNull(),
  suggestedText: text("suggested_text").notNull(),
  reasoning: text("reasoning").notNull(),
  priority: text("priority").notNull().default("medium"),
  category: text("category").notNull().default("other"),
  sourceModels: text("source_models").notNull().default("[]"),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Anchored diagnoses of the writer's own text. Never carry replacement wording.
export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scriptId: integer("script_id")
    .notNull()
    .references(() => scripts.id, { onDelete: "cascade" }),
  versionId: integer("version_id")
    .notNull()
    .references(() => scriptVersions.id, { onDelete: "cascade" }),
  runId: text("run_id"),
  anchorText: text("anchor_text").notNull(),
  issue: text("issue").notNull(),
  why: text("why").notNull().default(""),
  question: text("question"),
  category: text("category").notNull().default("other"),
  priority: text("priority").notNull().default("medium"),
  personaSlugs: text("persona_slugs").notNull().default("[]"),
  sourceModels: text("source_models").notNull().default("[]"),
  status: text("status").notNull().default("open"), // "open" | "addressed" | "dismissed"
  statusChangedAt: text("status_changed_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// The writer's structural plan. AI may propose beats; the writer owns them.
export const beats = sqliteTable("beats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scriptId: integer("script_id")
    .notNull()
    .references(() => scripts.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  purpose: text("purpose").notNull().default(""),
  writerNotes: text("writer_notes").notNull().default(""),
  targetSeconds: integer("target_seconds"),
  status: text("status").notNull().default("planned"), // "planned" | "drafted" | "cut"
  source: text("source").notNull().default("writer"), // "ai" | "writer"
  anchorText: text("anchor_text"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Legacy: tag UI was removed; tables kept so existing data survives.
export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  color: text("color"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const scriptTags = sqliteTable("script_tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scriptId: integer("script_id")
    .notNull()
    .references(() => scripts.id, { onDelete: "cascade" }),
  tagId: integer("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
});

export const factChecks = sqliteTable("fact_checks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scriptId: integer("script_id")
    .notNull()
    .references(() => scripts.id, { onDelete: "cascade" }),
  versionId: integer("version_id")
    .notNull()
    .references(() => scriptVersions.id, { onDelete: "cascade" }),
  modelId: text("model_id").notNull(),
  modelProvider: text("model_provider").notNull(),
  result: text("result").notNull().default(""),
  structuredResult: text("structured_result"),
  isSummary: integer("is_summary", { mode: "boolean" })
    .notNull()
    .default(false),
  status: text("status", {
    enum: ["pending", "streaming", "complete", "error"],
  })
    .notNull()
    .default("pending"),
  errorMessage: text("error_message"),
  searchCount: integer("search_count").default(0),
  durationMs: integer("duration_ms"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const factIssues = sqliteTable("fact_issues", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scriptId: integer("script_id")
    .notNull()
    .references(() => scripts.id, { onDelete: "cascade" }),
  versionId: integer("version_id")
    .notNull()
    .references(() => scriptVersions.id, { onDelete: "cascade" }),
  // Null for legacy issues written without web search; those are never shown.
  factCheckId: integer("fact_check_id").references(() => factChecks.id, {
    onDelete: "cascade",
  }),
  claimText: text("claim_text").notNull(),
  verdict: text("verdict").notNull(), // "verified" | "inaccurate" | "misleading" | "unverifiable" | "exaggeration-ok"
  accuracy: integer("accuracy"), // 0-100
  correction: text("correction"),
  reasoning: text("reasoning").notNull(),
  sources: text("sources").notNull().default("[]"), // JSON array of URLs
  isExaggeration: integer("is_exaggeration", { mode: "boolean" })
    .notNull()
    .default(false),
  category: text("category").notNull().default("general"), // "statistic" | "date" | "attribution" | "technical" | "general"
  agentModels: text("agent_models").notNull().default("[]"), // JSON array of model names
  status: text("status").notNull().default("pending"), // "pending" | "acknowledged" | "dismissed" | "corrected"
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const directionRuns = sqliteTable("direction_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scriptId: integer("script_id")
    .notNull()
    .references(() => scripts.id, { onDelete: "cascade" }),
  versionId: integer("version_id")
    .notNull()
    .references(() => scriptVersions.id, { onDelete: "cascade" }),
  modelId: text("model_id").notNull(),
  modelProvider: text("model_provider").notNull(),
  result: text("result").notNull().default(""),
  structuredResult: text("structured_result"),
  isSummary: integer("is_summary", { mode: "boolean" })
    .notNull()
    .default(false),
  status: text("status", {
    enum: ["pending", "streaming", "complete", "error"],
  })
    .notNull()
    .default("pending"),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const productionDirections = sqliteTable("production_directions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scriptId: integer("script_id")
    .notNull()
    .references(() => scripts.id, { onDelete: "cascade" }),
  versionId: integer("version_id")
    .notNull()
    .references(() => scriptVersions.id, { onDelete: "cascade" }),
  originalText: text("original_text").notNull(),
  directionType: text("direction_type").notNull(), // "talking-head" | "b-roll" | "motion-graphics" | "screen-recording" | "text-overlay" | "archival" | "interview-clip" | "mixed"
  reasoning: text("reasoning").notNull(),
  visualNotes: text("visual_notes"),
  confidence: text("confidence").notNull().default("medium"), // "high" | "medium" | "low"
  agreeingModels: text("agreeing_models").notNull().default("[]"), // JSON array
  disagreeingModels: text("disagreeing_models").notNull().default("[]"), // JSON array of {model, alternativeType}
  status: text("status").notNull().default("pending"), // "pending" | "accepted" | "modified" | "dismissed"
  userOverrideType: text("user_override_type"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const customModels = sqliteTable("custom_models", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  provider: text("provider", { enum: ["openrouter", "ollama"] })
    .notNull()
    .default("openrouter"),
  modelId: text("model_id").notNull(),
  baseUrl: text("base_url"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
