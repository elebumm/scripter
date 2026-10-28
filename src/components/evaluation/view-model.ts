// Pure mapping from council API data to what the synthesis panel, run history,
// trends chart and version timeline render. No React, no clock: callers pass
// `now` so rendering stays pure and the helpers stay testable.

import { CRITERIA, SCORE_ANCHORS, criterionLabel } from "@/lib/llm/rubric";
import { formatRelative, parseDbDate } from "@/lib/utils/dates";
import type { LensState, NoteDropReason, Synthesis } from "@/types/review";
import type { PersonaCritique } from "@/lib/llm/schemas";
import type { RunSummary, TrendPoint } from "@/lib/api/council";

// ---------------------------------------------------------------- formatting

/** Lens scores are integers ("7"); averages get one decimal ("7.4"). */
export function formatScore(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "–";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatCost(usd: number | null | undefined): string | null {
  if (usd == null || Number.isNaN(usd)) return null;
  if (usd > 0 && usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

export function formatDelta(delta: number | null | undefined): string {
  if (delta == null || Number.isNaN(delta)) return "";
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) return "±0";
  const abs = Number.isInteger(rounded) ? String(Math.abs(rounded)) : Math.abs(rounded).toFixed(1);
  return rounded > 0 ? `+${abs}` : `−${abs}`;
}

export function versionLabel(versionNumber: number | null | undefined): string {
  return versionNumber == null ? "Draft" : `v${versionNumber}`;
}

// ------------------------------------------------------------- score anchors

export type ScoreTone = "high" | "mid" | "low";

export interface ScoreBand {
  min: number;
  max: number;
  /** "Strong" */
  label: string;
  /** "Strong: works, with specific improvements available. A 7 is a good score." */
  meaning: string;
  tone: ScoreTone;
}

/** Parse the rubric's markdown score table so tooltips quote it exactly. */
export function parseScoreAnchors(markdown: string): ScoreBand[] {
  const bands: ScoreBand[] = [];
  for (const line of markdown.split("\n")) {
    const m = line.match(/^\|\s*(\d+)\s*-\s*(\d+)\s*\|\s*(.+?)\s*\|\s*$/);
    if (!m) continue;
    const min = Number(m[1]);
    const max = Number(m[2]);
    const meaning = m[3];
    const label = meaning.split(":")[0].trim();
    const tone: ScoreTone = min >= 7 ? "high" : min >= 5 ? "mid" : "low";
    bands.push({ min, max, label, meaning, tone });
  }
  return bands.sort((a, b) => b.min - a.min);
}

export const SCORE_BANDS = parseScoreAnchors(SCORE_ANCHORS);

export function scoreBand(score: number | null | undefined): ScoreBand | null {
  if (score == null || Number.isNaN(score)) return null;
  const rounded = Math.min(10, Math.max(1, Math.round(score)));
  return SCORE_BANDS.find((b) => rounded >= b.min && rounded <= b.max) ?? null;
}

/** Tailwind classes per tone; light theme, text ≥ 4.5:1 on its tint. */
export const TONE_CLASSES: Record<ScoreTone, string> = {
  high: "bg-emerald-50 text-emerald-800",
  mid: "bg-amber-50 text-amber-900",
  low: "bg-red-50 text-red-800",
};

export function scoreToneClass(score: number | null | undefined): string {
  const band = scoreBand(score);
  return band ? TONE_CLASSES[band.tone] : "bg-stone-50 text-stone-500";
}

// ------------------------------------------------------------------- personas

/** Short column labels: "Story Architect" → "SA"; collisions get a number. */
export function personaInitials(names: string[]): string[] {
  const base = names.map((name) => {
    const words = name.replace(/^the\s+/i, "").split(/[\s-]+/).filter(Boolean);
    if (words.length === 0) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return words
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  });
  const seen = new Map<string, number>();
  return base.map((b) => {
    const n = (seen.get(b) ?? 0) + 1;
    seen.set(b, n);
    return n === 1 ? b : `${b}${n}`;
  });
}

// ---------------------------------------------------------------- score table

export interface ScoreColumn {
  slug: string;
  name: string;
  modelName: string;
  short: string;
}

export interface ScoreTableRow {
  id: string;
  label: string;
  lookFor: string;
  /** One per column, in column order. */
  cells: Array<number | null>;
  average: number | null;
  /** Highest minus lowest lens score (0 with fewer than two scores). */
  spread: number;
  /** Lenses are at least 3 points apart. */
  split: boolean;
}

export interface ScoreTableView {
  columns: ScoreColumn[];
  rows: ScoreTableRow[];
  overall: { cells: Array<number | null>; average: number | null; spread: number; split: boolean };
  isEmpty: boolean;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function spreadOf(cells: Array<number | null>): number {
  const nums = cells.filter((c): c is number => c != null);
  return nums.length < 2 ? 0 : Math.max(...nums) - Math.min(...nums);
}

const SPLIT_THRESHOLD = 3;

export function buildScoreTable(synthesis: Pick<Synthesis, "lenses" | "scoreTable" | "overall">): ScoreTableView {
  const lensBySlug = new Map(synthesis.lenses.map((l) => [l.personaSlug, l]));
  const slugs: string[] = synthesis.lenses.filter((l) => l.status === "complete").map((l) => l.personaSlug);
  // Scores for a lens we have no card for (shouldn't happen) still get a column.
  const extra = new Set<string>();
  for (const row of synthesis.scoreTable) for (const slug of Object.keys(row.scores)) extra.add(slug);
  for (const slug of Object.keys(synthesis.overall.scores)) extra.add(slug);
  for (const slug of extra) if (!slugs.includes(slug)) slugs.push(slug);

  const names = slugs.map((s) => lensBySlug.get(s)?.personaName ?? s);
  const shorts = personaInitials(names);
  const columns: ScoreColumn[] = slugs.map((slug, i) => ({
    slug,
    name: names[i],
    modelName: lensBySlug.get(slug)?.modelName ?? "",
    short: shorts[i],
  }));

  const order = new Map<string, number>(CRITERIA.map((c, i) => [c.id, i]));
  const rows: ScoreTableRow[] = [...synthesis.scoreTable]
    .sort((a, b) => (order.get(a.criterionId) ?? 99) - (order.get(b.criterionId) ?? 99))
    .map((row) => {
      const cells = slugs.map((slug) => row.scores[slug] ?? null);
      const spread = spreadOf(cells);
      return {
        id: row.criterionId,
        label: row.label || criterionLabel(row.criterionId),
        lookFor: CRITERIA.find((c) => c.id === row.criterionId)?.lookFor ?? "",
        cells,
        average: row.average ?? mean(cells.filter((c): c is number => c != null)),
        spread,
        split: spread >= SPLIT_THRESHOLD,
      };
    });

  const overallCells = slugs.map((slug) => synthesis.overall.scores[slug] ?? null);
  const overallSpread = spreadOf(overallCells);
  return {
    columns,
    rows,
    overall: {
      cells: overallCells,
      average: synthesis.overall.average ?? mean(overallCells.filter((c): c is number => c != null)),
      spread: overallSpread,
      split: overallSpread >= SPLIT_THRESHOLD,
    },
    isEmpty: columns.length === 0 || (rows.length === 0 && overallCells.every((c) => c == null)),
  };
}

// ----------------------------------------------------------------- lens cards

export interface LensCardView {
  slug: string;
  name: string;
  modelName: string;
  overall: number | null;
  summary: string;
  criteria: Array<{ id: string; label: string; score: number; observation: string }>;
  notes: PersonaCritique["notes"];
  landed: PersonaCritique["landed"];
}

export interface FailedLensView {
  slug: string;
  name: string;
  modelName: string;
  error: string | null;
}

export function buildLensCards(synthesis: Pick<Synthesis, "lenses">): LensCardView[] {
  const order = new Map<string, number>(CRITERIA.map((c, i) => [c.id, i]));
  return synthesis.lenses
    .filter((l) => l.status === "complete" && l.critique)
    .map((l) => {
      const c = l.critique as PersonaCritique;
      return {
        slug: l.personaSlug,
        name: l.personaName,
        modelName: l.modelName,
        overall: typeof c.overallScore === "number" ? c.overallScore : null,
        summary: c.summary ?? "",
        criteria: [...(c.criteria ?? [])]
          .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99))
          .map((cr) => ({ id: cr.id, label: criterionLabel(cr.id), score: cr.score, observation: cr.observation ?? "" })),
        notes: c.notes ?? [],
        landed: c.landed ?? [],
      };
    });
}

/** Lenses that errored, plus any listed in failedLenses without a lens entry. */
export function buildFailedLenses(synthesis: Pick<Synthesis, "lenses" | "failedLenses">): FailedLensView[] {
  const failed: FailedLensView[] = synthesis.lenses
    .filter((l) => l.status === "error")
    .map((l) => ({ slug: l.personaSlug, name: l.personaName, modelName: l.modelName, error: l.error ?? null }));
  const known = new Set(synthesis.lenses.map((l) => l.personaSlug));
  const knownNames = new Set(synthesis.lenses.map((l) => l.personaName));
  for (const entry of synthesis.failedLenses ?? []) {
    if (known.has(entry) || knownNames.has(entry)) continue;
    failed.push({ slug: entry, name: entry, modelName: "", error: null });
  }
  return failed;
}

export interface SynthesisHeaderView {
  versionLabel: string;
  /** "3 days ago" */
  relative: string;
  /** "v4 · 3 days ago" */
  line: string;
  cost: string | null;
  lensCount: number;
  failedCount: number;
}

export function buildSynthesisHeader(
  synthesis: Pick<Synthesis, "versionNumber" | "createdAt" | "costUsd" | "lenses" | "failedLenses">,
  now: Date
): SynthesisHeaderView {
  const label = versionLabel(synthesis.versionNumber);
  const relative = formatRelative(synthesis.createdAt, now);
  const failedCount = buildFailedLenses(synthesis).length;
  return {
    versionLabel: label,
    relative,
    line: relative ? `${label} · ${relative}` : label,
    cost: formatCost(synthesis.costUsd),
    lensCount: synthesis.lenses.filter((l) => l.status === "complete").length,
    failedCount,
  };
}

// --------------------------------------------------------------- live lenses

export interface LensProgressView {
  total: number;
  done: number;
  failed: number;
  /** 0-100 */
  percent: number;
}

export function lensProgress(lenses: Pick<LensState, "status">[]): LensProgressView {
  const total = lenses.length;
  const failed = lenses.filter((l) => l.status === "error").length;
  const done = lenses.filter((l) => l.status === "complete" || l.status === "error").length;
  return { total, done, failed, percent: total ? Math.round((done / total) * 100) : 0 };
}

export function lensStatusLabel(lens: Pick<LensState, "status" | "critique" | "durationMs">): string {
  switch (lens.status) {
    case "idle":
      return "Not run";
    case "pending":
      return "Waiting";
    case "streaming": {
      const scored = lens.critique?.criteria?.length ?? 0;
      const notes = lens.critique?.notes?.length ?? 0;
      if (notes > 0) return `Writing notes (${notes})`;
      if (scored > 0) return `Scoring (${Math.min(scored, CRITERIA.length)}/${CRITERIA.length})`;
      return "Reading the script";
    }
    case "complete": {
      const secs = lens.durationMs != null && lens.durationMs >= 0 ? Math.round(lens.durationMs / 1000) : null;
      return secs != null ? `Done in ${secs}s` : "Done";
    }
    case "error":
      return "Failed";
  }
}

/**
 * What to tell the writer when the synthesis wrote notes that failed the
 * server's checks (anchor not in the script, supplied wording, a repeat of a
 * dismissed note). Notes merged as repeats, or left outside a reviewed
 * section, are expected and not counted when the reasons are known. Null when
 * nothing worth mentioning was dropped.
 */
export function droppedNotesNotice(notes: {
  saved: number;
  dropped: number;
  dropReasons?: Partial<Record<NoteDropReason, number>>;
  /** Earlier open notes kept because this pass's notes couldn't replace them. */
  previousKept?: number;
}): { title: string; detail: string } | null {
  const { saved } = notes;
  const expected = (notes.dropReasons?.duplicate ?? 0) + (notes.dropReasons?.section ?? 0);
  const dropped = notes.dropped - expected;
  if (!(dropped > 0)) return null;
  const rule = "A note has to quote your script and can't repeat one you dismissed.";
  const kept = notes.previousKept ?? 0;
  const keptLine = kept > 0 ? ` ${kept} earlier open ${kept === 1 ? "note was" : "notes were"} kept.` : "";
  if (saved === 0) {
    return {
      title: "No new notes from this run",
      detail: `The synthesis wrote ${dropped} ${dropped === 1 ? "note" : "notes"}, but none passed the checks. ${rule}${keptLine}`,
    };
  }
  return {
    title: `${dropped} ${dropped === 1 ? "note was" : "notes were"} left out`,
    detail: `${saved} ${saved === 1 ? "note was" : "notes were"} saved. ${rule}${keptLine}`,
  };
}

// ---------------------------------------------------------------- run history

export interface RunListItemView {
  runId: string;
  versionLabel: string;
  relative: string;
  overall: string;
  overallValue: number | null;
  cost: string | null;
  lenses: string;
  failed: number;
  section: boolean;
}

export function buildRunListItem(run: RunSummary, now: Date): RunListItemView {
  const ok = Math.max(0, run.lensCount - run.failedLenses);
  return {
    runId: run.runId,
    versionLabel: versionLabel(run.versionNumber),
    relative: formatRelative(run.createdAt, now),
    overall: formatScore(run.overallAverage),
    overallValue: run.overallAverage,
    cost: formatCost(run.costUsd),
    lenses: run.failedLenses > 0 ? `${ok} of ${run.lensCount} lenses` : `${run.lensCount} ${run.lensCount === 1 ? "lens" : "lenses"}`,
    failed: run.failedLenses,
    section: run.sectionOnly,
  };
}

/**
 * Whether History may write the missing synthesis of the selected run: only
 * the newest run (an older one would supersede newer notes), only a
 * whole-script, non-legacy run with no saved synthesis and a finished lens.
 */
export function canSynthesizeRun(
  selected: Synthesis | null,
  newest: RunSummary | undefined,
  shownRunId: string | null
): boolean {
  if (!selected || !newest || newest.runId !== selected.runId) return false;
  if (newest.sectionOnly || selected.runId.startsWith("legacy-")) return false;
  if (selected.summaryId !== 0 || shownRunId === selected.runId) return false;
  return selected.lenses.some((l) => l.status === "complete");
}

/** versionId → overall average of that version's latest whole-script run. */
export function latestScoreByVersion(runs: RunSummary[]): Map<number, number> {
  const sorted = [...runs].sort(
    (a, b) => (parseDbDate(b.createdAt)?.getTime() ?? 0) - (parseDbDate(a.createdAt)?.getTime() ?? 0)
  );
  const out = new Map<number, number>();
  for (const run of sorted) {
    if (run.sectionOnly || run.overallAverage == null || out.has(run.versionId)) continue;
    out.set(run.versionId, run.overallAverage);
  }
  return out;
}

// --------------------------------------------------------------------- trends

export interface TrendRow {
  /** Unique x-axis key ("v3", or "v3 #2" for a second run on v3). */
  label: string;
  versionNumber: number;
  overall: number | null;
  [criterionId: string]: number | string | null;
}

export interface TrendSeriesSummary {
  id: string;
  label: string;
  latest: number | null;
  delta: number | null;
}

export interface TrendView {
  rows: TrendRow[];
  overall: { latest: number | null; delta: number | null };
  criteria: TrendSeriesSummary[];
  /** At least two reviewed points: enough to draw a line. */
  enough: boolean;
}

export function buildTrendView(points: TrendPoint[]): TrendView {
  const sorted = [...points].sort(
    (a, b) =>
      a.versionNumber - b.versionNumber ||
      (parseDbDate(a.createdAt)?.getTime() ?? 0) - (parseDbDate(b.createdAt)?.getTime() ?? 0)
  );
  const seen = new Map<number, number>();
  const rows: TrendRow[] = sorted.map((p) => {
    const n = (seen.get(p.versionNumber) ?? 0) + 1;
    seen.set(p.versionNumber, n);
    const row: TrendRow = {
      label: n === 1 ? versionLabel(p.versionNumber) : `${versionLabel(p.versionNumber)} #${n}`,
      versionNumber: p.versionNumber,
      overall: p.overall,
    };
    for (const [id, score] of Object.entries(p.criteria ?? {})) {
      if (typeof score === "number") row[id] = Math.round(score * 10) / 10;
    }
    return row;
  });

  const last = rows.at(-1);
  const prev = rows.length >= 2 ? rows[rows.length - 2] : undefined;
  const num = (row: TrendRow | undefined, key: string): number | null => {
    const v = row?.[key];
    return typeof v === "number" ? v : null;
  };
  const delta = (key: string): number | null => {
    const a = num(prev, key);
    const b = num(last, key);
    return a != null && b != null ? Math.round((b - a) * 10) / 10 : null;
  };

  const present = new Set<string>();
  for (const p of sorted) for (const id of Object.keys(p.criteria ?? {})) present.add(id);
  const criteria: TrendSeriesSummary[] = CRITERIA.filter((c) => present.has(c.id)).map((c) => ({
    id: c.id,
    label: c.label,
    latest: num(last, c.id),
    delta: delta(c.id),
  }));

  return {
    rows,
    overall: { latest: num(last, "overall"), delta: delta("overall") },
    criteria,
    enough: rows.length >= 2,
  };
}

/** Light-theme categorical slots (validated all-pairs for three series). */
export const TREND_SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"] as const;

export interface SeriesSelection {
  id: string;
  /** Index into TREND_SERIES_COLORS; stays with the series while it's shown. */
  slot: number;
}

/**
 * Toggle a criterion line. Colour follows the series (its slot never changes
 * while selected); at most TREND_SERIES_COLORS.length lines, oldest dropped.
 */
export function toggleSeries(selection: SeriesSelection[], id: string): SeriesSelection[] {
  if (selection.some((s) => s.id === id)) return selection.filter((s) => s.id !== id);
  let next = selection;
  if (next.length >= TREND_SERIES_COLORS.length) next = next.slice(1);
  const used = new Set(next.map((s) => s.slot));
  const slot = TREND_SERIES_COLORS.findIndex((_, i) => !used.has(i));
  return [...next, { id, slot }];
}
