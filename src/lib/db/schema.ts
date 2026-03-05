import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
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
  isTemplate: integer("is_template", { mode: "boolean" })
    .notNull()
    .default(false),
  templateDescription: text("template_description"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

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
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const evaluationProfiles = sqliteTable("evaluation_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  criteriaWeights: text("criteria_weights").notNull().default("{}"),
  isDefault: integer("is_default", { mode: "boolean" })
    .notNull()
    .default(false),
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
