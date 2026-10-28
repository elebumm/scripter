// Council run logic shared by the /api/council routes: the critique call,
// output guards, score tables, and grouping stored evaluations into runs
// (including legacy pre-refresh rows). Pure except for startCritique.

import { NoObjectGeneratedError, Output, streamText, type LanguageModelUsage } from "ai";
import { getModel, callSettingsFor } from "./providers";
import { getModelBySlug, MODELS } from "./models";
import { CRITERIA, criterionLabel, normalizeLegacyCriterionName, type CriterionId } from "./rubric";
import { personaCritiqueSchema, type PersonaCritique } from "./schemas";
import { anchorExistsInMarkdown, isUsableAnchor, matchKey, resolveAnchor } from "@/lib/text/anchor";
import { isTooThin, stripSuppliedWording } from "@/lib/guard/wording";
import { errorMessage } from "@/lib/stream/ndjson";
import { parseDbDate } from "@/lib/utils/dates";
import type { ScoreRow, Synthesis } from "@/types/review";
import type { RunSummary, TrendPoint } from "@/lib/api/council";
import type { EvaluationWithVersion } from "@/lib/db/queries/evaluations";

/** A positive integer id from a query/route param, else null. */
export function parseId(value: string | null | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Model calls

export function startCritique(args: {
  modelSlug: string;
  system: string;
  prompt: string;
  abortSignal?: AbortSignal;
  onError?: (error: unknown) => void;
}) {
  return streamText({
    model: getModel(args.modelSlug),
    ...callSettingsFor(args.modelSlug),
    system: args.system,
    messages: [{ role: "user", content: args.prompt }],
    output: Output.object({ schema: personaCritiqueSchema }),
    abortSignal: args.abortSignal,
    onError: ({ error }) => args.onError?.(error),
  });
}

/**
 * Read a structured stream: forward partials (throttled), then resolve the
 * validated output and usage. Throws when the model produced no valid object.
 */
export async function drainStructured<T, P>(
  result: {
    partialOutputStream: AsyncIterable<P>;
    output: PromiseLike<T>;
    totalUsage: PromiseLike<LanguageModelUsage>;
    providerMetadata?: PromiseLike<unknown>;
  },
  onPartial: (partial: P) => void,
  throttleMs = 120
): Promise<{ output: T; usage: LanguageModelUsage; providerMetadata: unknown }> {
  let last = 0;
  for await (const partial of result.partialOutputStream) {
    const now = Date.now();
    if (now - last >= throttleMs) {
      last = now;
      onPartial(partial);
    }
  }
  const output = await result.output;
  const usage = await result.totalUsage;
  // Carries OpenRouter's reported cost (see callCostUsd).
  const providerMetadata = await result.providerMetadata;
  return { output, usage, providerMetadata };
}

export function usageTokens(usage: LanguageModelUsage | null | undefined): { tokensIn: number; tokensOut: number } {
  return { tokensIn: usage?.inputTokens ?? 0, tokensOut: usage?.outputTokens ?? 0 };
}

/**
 * Usage of a call that ran but produced no valid object (bad or truncated
 * JSON): it was paid for, so failed rows record it too.
 */
export function failureUsage(err: unknown): LanguageModelUsage | undefined {
  return NoObjectGeneratedError.isInstance(err) ? err.usage : undefined;
}

/** The message stored on a failed evaluation and sent to the client. */
export function describeFailure(signal: AbortSignal | undefined, err: unknown): string {
  if (signal?.aborted) return "Stopped";
  if (err instanceof Error && err.name === "TimeoutError") return "Timed out waiting for the model";
  if (NoObjectGeneratedError.isInstance(err) && err.finishReason === "length") {
    return "The model ran out of output room before it finished";
  }
  return errorMessage(err);
}

// ---------------------------------------------------------------------------
// "Your words only" guards for model output

const GUARDED_KEYS = new Set(["summary", "observation", "issue", "why", "question", "overview", "comment", "purpose", "explanation"]);

/**
 * Strip supplied wording from every prose field of a streamed partial (nothing
 * is dropped). JSON streams in order, so only the last value can still be
 * growing: it also hides a quote or lead-in that hasn't closed yet.
 */
export function guardPartial<T>(value: T, scriptKey: string): T {
  const children = (v: unknown): unknown[] => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []);
  let leaves = 0;
  const count = (v: unknown): void => {
    const kids = children(v);
    if (kids.length) kids.forEach(count);
    else leaves++;
  };
  count(value);

  let seen = 0;
  const walk = (v: unknown, key?: string): unknown => {
    if (children(v).length) {
      if (Array.isArray(v)) return v.map((item) => walk(item));
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, inner]) => [k, walk(inner, k)]));
    }
    const open = ++seen === leaves;
    if (typeof v === "string" && key && GUARDED_KEYS.has(key)) return stripSuppliedWording(v, scriptKey, { partial: open }).text;
    return v;
  };
  return walk(value) as T;
}

/**
 * A question that carried supplied wording is a suggestion in disguise
 * ("Could you open with '…'?"), so it is dropped rather than trimmed.
 */
export function guardQuestion(question: string | undefined | null, scriptKey: string): string | undefined {
  if (!question?.trim()) return undefined;
  const q = stripSuppliedWording(question, scriptKey);
  return q.tripped ? undefined : q.text;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** `needle` occurs in `hay` without starting or ending mid-word. */
function containsWords(hay: string, needle: string): boolean {
  if (!needle) return false;
  const startsWord = WORD_CHAR.test(needle[0]);
  const endsWord = WORD_CHAR.test(needle[needle.length - 1]);
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) {
    const end = i + needle.length;
    if (startsWord && i > 0 && WORD_CHAR.test(hay[i - 1])) continue;
    if (endsWord && end < hay.length && WORD_CHAR.test(hay[end])) continue;
    return true;
  }
  return false;
}

/** Two anchors point at the same passage: one contains the other as whole words. */
export function samePassage(a: string, b: string): boolean {
  const ka = matchKey(a);
  const kb = matchKey(b);
  return containsWords(ka, kb) || containsWords(kb, ka);
}

export interface DismissedIssue {
  anchorText: string;
  category: string;
}

/**
 * The writer's dismissals as a test: the same category on the same passage
 * never comes back. Dismissed anchors too short to point at one place are
 * ignored, so a stray "AI" can't suppress every later note.
 */
export function dismissedIssueTest(dismissed: DismissedIssue[]): (anchorText: string, category: string) => boolean {
  const keys = dismissed.filter((d) => isUsableAnchor(d.anchorText)).map((d) => ({ key: matchKey(d.anchorText), category: d.category }));
  return (anchorText, category) => {
    const key = matchKey(anchorText);
    return keys.some((d) => d.category === category && (containsWords(d.key, key) || containsWords(key, d.key)));
  };
}

/** One entry per criterion (the first the model gave), in rubric order. */
export function uniqueCriteria<C extends { id: string }>(criteria: C[]): C[] {
  const byId = new Map<string, C>();
  for (const c of criteria) if (!byId.has(c.id)) byId.set(c.id, c);
  return CRITERIA.flatMap((c) => byId.get(c.id) ?? []);
}

export interface CritiqueGuardOptions {
  /** A section review: every anchor must come from this passage. */
  section?: string | null;
  /** The writer's dismissals: a lens never shows a dismissed issue again. */
  dismissed?: DismissedIssue[];
}

/**
 * Final guard for one lens's critique: strip supplied wording from every
 * prose field, keep one score per criterion, and drop notes/landed passages
 * whose anchor isn't the writer's text (or is outside a reviewed section).
 * Notes left too thin, or repeating a dismissed issue, are dropped. Stored
 * anchors are the writer's own text, never the model's string.
 */
export function guardCritique(
  critique: PersonaCritique,
  content: string,
  scriptKey: string = matchKey(content),
  options: CritiqueGuardOptions = {}
): { critique: PersonaCritique; notesDropped: number; criteriaMissing: CriterionId[] } {
  const strip = (t: string) => stripSuppliedWording(t, scriptKey).text;
  const section = options.section?.trim() || null;
  const ownAnchor = (anchor: string): string | null => {
    const own = resolveAnchor(content, anchor);
    return own && (!section || anchorExistsInMarkdown(section, own)) ? own : null;
  };
  const isDismissed = dismissedIssueTest(options.dismissed ?? []);
  let notesDropped = 0;

  const notes: PersonaCritique["notes"] = [];
  for (const n of critique.notes) {
    const anchorText = ownAnchor(n.anchorText);
    const issue = strip(n.issue);
    if (!anchorText || isTooThin(issue) || isDismissed(anchorText, n.category)) {
      notesDropped++;
      continue;
    }
    const note: PersonaCritique["notes"][number] = {
      anchorText,
      issue,
      why: strip(n.why),
      category: n.category,
      priority: n.priority,
    };
    const question = guardQuestion(n.question, scriptKey);
    if (question) note.question = question;
    notes.push(note);
  }

  const landed = critique.landed.flatMap((l) => {
    const anchorText = ownAnchor(l.anchorText);
    const why = strip(l.why);
    return anchorText && why.trim() ? [{ anchorText, why }] : [];
  });

  const criteria = uniqueCriteria(critique.criteria).map((c) => ({ ...c, observation: strip(c.observation) }));
  const scored = new Set(criteria.map((c) => c.id));

  return {
    critique: { ...critique, summary: strip(critique.summary), criteria, notes, landed },
    notesDropped,
    criteriaMissing: CRITERIA.filter((c) => !scored.has(c.id)).map((c) => c.id),
  };
}

// ---------------------------------------------------------------------------
// Scores (computed by the app, never by the model)

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function mean(values: number[]): number | null {
  return values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

export interface LensScores {
  slug: string;
  criteria: Array<{ id: string; score: number }>;
  overallScore: number | null;
}

/** Criterion x lens table (rubric order, rows nobody scored omitted) plus overall per lens. */
export function computeScoreTable(lenses: LensScores[]): {
  scoreTable: ScoreRow[];
  overall: { scores: Record<string, number>; average: number | null };
} {
  const scoreTable: ScoreRow[] = [];
  for (const criterion of CRITERIA) {
    const scores: Record<string, number> = {};
    for (const lens of lenses) {
      const values = lens.criteria.filter((c) => c.id === criterion.id && Number.isFinite(c.score)).map((c) => c.score);
      const avg = mean(values);
      if (avg !== null) scores[lens.slug] = avg;
    }
    const values = Object.values(scores);
    if (values.length === 0) continue;
    scoreTable.push({ criterionId: criterion.id, label: criterionLabel(criterion.id), scores, average: mean(values) });
  }

  const overallScores: Record<string, number> = {};
  for (const lens of lenses) {
    if (lens.overallScore !== null && Number.isFinite(lens.overallScore)) overallScores[lens.slug] = lens.overallScore;
  }
  return { scoreTable, overall: { scores: overallScores, average: mean(Object.values(overallScores)) } };
}

// ---------------------------------------------------------------------------
// Stored critiques (new and legacy)

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function clampScore(n: number): number {
  return Math.min(10, Math.max(1, n));
}

function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Convert a pre-refresh evaluation (free-text criterion names, topPriorities,
 * markdown result) into the critique shape for history views. Missing or
 * unrecognised fields are skipped. Null when nothing usable remains.
 */
export function legacyToCritique(structured: string | null, resultText: string): PersonaCritique | null {
  const data = parseJson(structured);
  const byId = new Map<CriterionId, { scores: number[]; observation: string }>();

  if (isRecord(data) && Array.isArray(data.criteria)) {
    for (const c of data.criteria) {
      if (!isRecord(c)) continue;
      const name = typeof c.name === "string" ? c.name : typeof c.id === "string" ? c.id : null;
      const id = name ? normalizeLegacyCriterionName(name) : null;
      const score = typeof c.score === "number" ? c.score : Number(c.score);
      if (!id || !Number.isFinite(score)) continue;
      const entry = byId.get(id) ?? { scores: [], observation: "" };
      entry.scores.push(clampScore(score));
      if (!entry.observation) {
        const obs = typeof c.explanation === "string" ? c.explanation : typeof c.observation === "string" ? c.observation : "";
        entry.observation = obs.trim();
      }
      byId.set(id, entry);
    }
  }

  const criteria = CRITERIA.filter((c) => byId.has(c.id)).map((c) => {
    const entry = byId.get(c.id)!;
    return { id: c.id, score: round1(entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length), observation: entry.observation };
  });

  let overall: number | null = null;
  if (isRecord(data)) {
    const raw = typeof data.overallScore === "number" ? data.overallScore : Number(data.overallScore);
    if (Number.isFinite(raw)) overall = clampScore(round1(raw));
  }
  if (overall === null) {
    const m = resultText.match(/overall[^\d\n]{0,25}(\d+(?:\.\d+)?)\s*\/\s*10/i);
    if (m) overall = clampScore(round1(Number(m[1])));
  }
  if (overall === null && criteria.length) overall = mean(criteria.map((c) => c.score));
  if (overall === null) return null;

  let summary = resultText.trim();
  if (!summary && isRecord(data) && Array.isArray(data.topPriorities)) {
    const items = data.topPriorities
      .map((p) => (isRecord(p) && typeof p.description === "string" ? p.description.trim() : ""))
      .filter(Boolean);
    if (items.length) summary = `Top priorities:\n\n${items.map((d, i) => `${i + 1}. ${d}`).join("\n")}`;
  }

  return { summary, criteria, overallScore: overall, notes: [], landed: [] };
}

/** A stored critique row: validated new-style JSON, else the tolerant legacy conversion. */
export function parseStoredCritique(row: { structuredResult: string | null; result: string; runId: string | null }): PersonaCritique | null {
  if (row.runId) {
    const parsed = personaCritiqueSchema.safeParse(parseJson(row.structuredResult));
    if (parsed.success) return { ...parsed.data, criteria: uniqueCriteria(parsed.data.criteria) };
  }
  return legacyToCritique(row.structuredResult, row.result ?? "");
}

const LIST_PREFIX = String.raw`^\s*(?:(?:[-*+]|\d+[.)])\s+)*`;
const REWRITE_WORDS = String.raw`(?:suggested rewrites?|rewrite suggestions?|refined [^:\n]{1,40}:)`;
const EXAMPLE_CALLOUT = new RegExp(`${LIST_PREFIX}>\\s*\\[!example\\]`, "i");
const REWRITE_HEADING = new RegExp(String.raw`^\s{0,3}#{1,6}\s+[*_]*${REWRITE_WORDS}`, "i");
const REWRITE_LABEL = new RegExp(String.raw`${LIST_PREFIX}(?:>\s*)*[*_]*\s*${REWRITE_WORDS}`, "i");
const HEADING = /^\s{0,3}#{1,6}\s/;

/**
 * Pre-refresh critiques asked for "one concrete fix": they carry rewritten
 * lines in "> [!example]" callouts and "Suggested rewrite" / "Refined …:"
 * blocks, often unquoted (bracketed cues), which the quote guard can't catch.
 * Drop them: a callout with its quoted lines, a heading with its section, a
 * label line on its own with the lines up to the next blank line, or a single
 * labelled line.
 */
export function dropLegacyRewrites(markdown: string): string {
  const out: string[] = [];
  let skip: "quote" | "section" | "block" | null = null;
  for (const line of markdown.split("\n")) {
    if (skip === "quote" && /^\s*>/.test(line)) continue;
    if (skip === "section" && !HEADING.test(line)) continue;
    if (skip === "block" && line.trim() !== "") continue;
    skip = null;
    if (EXAMPLE_CALLOUT.test(line)) skip = "quote";
    else if (REWRITE_HEADING.test(line)) skip = "section";
    else if (REWRITE_LABEL.test(line)) skip = /^\s*>/.test(line) ? "quote" : /[:*_]\s*$/.test(line) ? "block" : null;
    else out.push(line);
  }
  return out.join("\n");
}

/** Legacy text predates the "your words only" rule: guard it on read. */
function guardLegacyCritique(critique: PersonaCritique, scriptKey: string): PersonaCritique {
  return {
    ...critique,
    summary: stripSuppliedWording(dropLegacyRewrites(critique.summary), scriptKey).text,
    criteria: critique.criteria.map((c) => ({ ...c, observation: stripSuppliedWording(c.observation, scriptKey).text })),
  };
}

const MODEL_WORDS: Record<string, string> = {
  gpt: "GPT",
  deepseek: "DeepSeek",
  "4o": "4o",
};

/** Display name for any stored model id (registry slug, OpenRouter id or legacy id). */
export function modelDisplayName(id: string): string {
  const registered = getModelBySlug(id) ?? MODELS.find((m) => m.openrouterId === id);
  if (registered) return registered.name;
  const last = id.split("/").pop() || id;
  return last
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => MODEL_WORDS[w] ?? (/^v\d/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Runs

export const LEGACY_RUN_PREFIX = "legacy-";

export function legacyRunId(versionId: number): string {
  return `${LEGACY_RUN_PREFIX}${versionId}`;
}

export function parseLegacyRunId(runId: string): number | null {
  if (!runId.startsWith(LEGACY_RUN_PREFIX)) return null;
  const n = Number(runId.slice(LEGACY_RUN_PREFIX.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export interface RunGroup {
  runId: string;
  legacy: boolean;
  versionId: number;
  versionNumber: number;
  sectionOnly: string | null;
  /** Start of the run (earliest row). */
  createdAt: string;
  /** Highest row id, for newest-first ordering. */
  latestId: number;
  /** Critique rows (no summaries), oldest first. */
  critiques: EvaluationWithVersion[];
  /** Latest completed synthesis row of the run. */
  summary: EvaluationWithVersion | null;
  /** Sum of every row's cost (critiques, retries, synthesis); null if none recorded. */
  costUsd: number | null;
}

/** Legacy rows that count as a run: whole-script, completed critiques. */
function isLegacyCritique(row: EvaluationWithVersion): boolean {
  return row.runId === null && !row.isMasterSummary && row.sectionOnly === null && row.status === "complete";
}

/**
 * Group a script's evaluations into council runs, newest first. Rows with a
 * run_id group by it; legacy rows (run_id NULL) group by version.
 */
export function groupRuns(rows: EvaluationWithVersion[]): RunGroup[] {
  const groups = new Map<string, EvaluationWithVersion[]>();
  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    let key: string;
    if (row.runId) key = row.runId;
    else if (isLegacyCritique(row)) key = legacyRunId(row.versionId);
    else continue;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const result: RunGroup[] = [];
  for (const [runId, list] of groups) {
    const critiques = list.filter((r) => !r.isMasterSummary);
    const summaries = list.filter((r) => r.isMasterSummary && r.status === "complete");
    const costs = list.map((r) => r.costUsd).filter((c): c is number => typeof c === "number");
    const first = list[0];
    result.push({
      runId,
      legacy: first.runId === null,
      versionId: first.versionId,
      versionNumber: first.versionNumber,
      sectionOnly: list.find((r) => r.sectionOnly)?.sectionOnly ?? null,
      createdAt: first.createdAt,
      latestId: list[list.length - 1].id,
      critiques,
      summary: summaries.length ? summaries[summaries.length - 1] : null,
      costUsd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
    });
  }
  return result.sort((a, b) => b.latestId - a.latestId);
}

export interface PersonaLabel {
  slug: string;
  name: string;
}

export interface LensView {
  evaluationId: number;
  personaSlug: string;
  personaName: string;
  modelName: string;
  critique: PersonaCritique | null;
  status: "complete" | "error";
  error?: string;
  /** Still pending/streaming (a run in progress, or one interrupted by a restart). */
  inFlight: boolean;
  costUsd: number | null;
}

/**
 * One entry per lens in a run (a retried lens counts once: its latest
 * completed row, else its latest row), in the order the lenses started.
 */
export function resolveLenses(group: RunGroup, personas: Map<number, PersonaLabel>, guardContent?: string): LensView[] {
  const byLens = new Map<string, EvaluationWithVersion[]>();
  for (const row of group.critiques) {
    const key = row.personaId !== null ? `p${row.personaId}` : `m${row.modelId}`;
    const list = byLens.get(key);
    if (list) list.push(row);
    else byLens.set(key, [row]);
  }
  const scriptKey = guardContent !== undefined ? matchKey(guardContent) : null;

  return [...byLens.values()].map((rows) => {
    const completed = rows.filter((r) => r.status === "complete");
    const row = completed.length ? completed[completed.length - 1] : rows[rows.length - 1];
    const persona = row.personaId !== null ? personas.get(row.personaId) : undefined;
    const modelName = modelDisplayName(row.modelId);
    let critique = row.status === "complete" ? parseStoredCritique(row) : null;
    if (critique && scriptKey !== null && !row.runId) critique = guardLegacyCritique(critique, scriptKey);
    const status: LensView["status"] = critique ? "complete" : "error";
    const error =
      status === "complete"
        ? undefined
        : row.errorMessage || (row.status === "complete" ? "No usable output" : row.status === "error" ? "Failed" : "Did not finish");
    return {
      evaluationId: row.id,
      personaSlug: persona?.slug ?? (row.personaId !== null ? `persona-${row.personaId}` : row.modelId),
      personaName: persona?.name ?? modelName,
      modelName,
      critique,
      status,
      ...(error ? { error } : {}),
      inFlight: row.status === "pending" || row.status === "streaming",
      costUsd: row.costUsd,
    };
  });
}

export function lensScores(lenses: LensView[]): LensScores[] {
  return lenses
    .filter((l): l is LensView & { critique: PersonaCritique } => l.status === "complete" && l.critique !== null)
    .map((l) => ({ slug: l.personaSlug, criteria: l.critique.criteria, overallScore: l.critique.overallScore }));
}

/** A saved synthesis from a summary row (tolerant; null if unusable). */
export function parseStoredSynthesis(row: { id: number; structuredResult: string | null; createdAt: string } | null): Synthesis | null {
  if (!row) return null;
  const data = parseJson(row.structuredResult);
  if (!isRecord(data) || typeof data.overview !== "string" || !Array.isArray(data.scoreTable) || !isRecord(data.overall)) return null;
  return { ...(data as unknown as Synthesis), summaryId: row.id };
}

/** The run's saved synthesis, or one rebuilt from its critiques (no overview) when none was saved. */
export function synthesisForGroup(group: RunGroup, lenses: LensView[], scriptId: number): Synthesis {
  const saved = parseStoredSynthesis(group.summary);
  if (saved) return saved;
  const { scoreTable, overall } = computeScoreTable(lensScores(lenses));
  return {
    summaryId: 0,
    scriptId,
    versionId: group.versionId,
    versionNumber: group.versionNumber,
    runId: group.runId,
    overview: "",
    scoreTable,
    overall,
    lenses: lenses.map((l) => ({
      personaSlug: l.personaSlug,
      personaName: l.personaName,
      modelName: l.modelName,
      evaluationId: l.evaluationId,
      critique: l.critique,
      status: l.status,
      ...(l.error ? { error: l.error } : {}),
    })),
    failedLenses: lenses.filter((l) => l.status === "error").map((l) => l.personaName),
    costUsd: group.costUsd,
    createdAt: group.createdAt,
  };
}

/**
 * The newest pre-refresh run (legacy critiques grouped by version; always
 * whole-script). Legacy runs never saved a synthesis, so callers rebuild one
 * from the critiques with synthesisForGroup / summarizeRun.
 */
export function newestLegacyRun(groups: RunGroup[]): RunGroup | undefined {
  return groups.find((g) => g.legacy && g.critiques.length > 0);
}

export function summarizeRun(group: RunGroup, lenses: LensView[]): RunSummary {
  const saved = parseStoredSynthesis(group.summary);
  const average = saved ? saved.overall.average : computeScoreTable(lensScores(lenses)).overall.average;
  return {
    runId: group.runId,
    versionId: group.versionId,
    versionNumber: group.versionNumber,
    createdAt: group.createdAt,
    overallAverage: average ?? null,
    costUsd: group.costUsd,
    lensCount: lenses.length,
    failedLenses: lenses.filter((l) => l.status === "error" && !l.inFlight).length,
    sectionOnly: group.sectionOnly !== null,
  };
}

/**
 * One point per version (its latest whole-script run with at least one
 * completed lens), oldest version first. Section reviews never count.
 */
export function buildTrendPoints(groups: RunGroup[], lensesFor: (group: RunGroup) => LensView[]): TrendPoint[] {
  const byVersion = new Map<number, TrendPoint>();
  const newestFirst = [...groups].sort((a, b) => b.latestId - a.latestId);
  for (const group of newestFirst) {
    if (group.sectionOnly !== null || byVersion.has(group.versionId)) continue;
    const scores = lensScores(lensesFor(group));
    if (scores.length === 0) continue;
    const { scoreTable, overall } = computeScoreTable(scores);
    const saved = parseStoredSynthesis(group.summary);
    const criteria: Record<string, number> = {};
    for (const row of scoreTable) if (row.average !== null) criteria[row.criterionId] = row.average;
    byVersion.set(group.versionId, {
      versionNumber: group.versionNumber,
      createdAt: group.createdAt,
      overall: saved?.overall.average ?? overall.average,
      criteria,
    });
  }
  return [...byVersion.values()].sort(
    (a, b) => a.versionNumber - b.versionNumber || (parseDbDate(a.createdAt)?.getTime() ?? 0) - (parseDbDate(b.createdAt)?.getTime() ?? 0)
  );
}
