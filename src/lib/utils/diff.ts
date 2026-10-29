import { diffLines, diffWords, type Change } from "diff";

export interface DiffResult {
  changes: Change[];
}

export function computeLineDiff(oldText: string, newText: string): DiffResult {
  return { changes: diffLines(oldText, newText) };
}

export function computeWordDiff(oldText: string, newText: string): DiffResult {
  return { changes: diffWords(oldText, newText) };
}

// ---------------------------------------------------------------------------
// Readable diff for prose. Scripts are paragraphs, so a plain line diff marks a
// whole paragraph as removed + added for a one-word edit. buildDiffView diffs
// by line first (fast), then word-diffs each removed/added pair so the change
// shows inline, and folds long unchanged stretches.

export type DiffPart = { kind: "same" | "added" | "removed"; text: string };

export type DiffBlock =
  | { kind: "same"; text: string }
  /** Unchanged lines hidden by default; `text` is kept so the UI can expand it. */
  | { kind: "fold"; lines: number; text: string }
  | { kind: "added"; text: string }
  | { kind: "removed"; text: string }
  /** A paragraph that was edited: word-level parts in reading order. */
  | { kind: "changed"; parts: DiffPart[] };

export interface DiffStats {
  wordsAdded: number;
  wordsRemoved: number;
  /** Added, removed or edited passages. */
  passagesChanged: number;
  identical: boolean;
}

export interface DiffView {
  blocks: DiffBlock[];
  stats: DiffStats;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Split into lines, keeping each line's trailing newline. */
function splitLines(text: string): string[] {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g);
  return lines ?? [];
}

/** Word diff with a time budget; null when the texts are too different to bother. */
function wordParts(removed: string, added: string): DiffPart[] | null {
  const changes = diffWords(removed, added, { timeout: 250 });
  if (!changes) return null;
  return changes.map((c) => ({
    kind: c.added ? "added" : c.removed ? "removed" : "same",
    text: c.value,
  }));
}

function foldSame(text: string, position: "first" | "middle" | "last", context: number): DiffBlock[] {
  const lines = splitLines(text);
  const keepHead = position === "first" ? 0 : context;
  const keepTail = position === "last" ? 0 : context;
  const hidden = lines.length - keepHead - keepTail;
  // Folding one or two lines saves nothing; show them.
  if (hidden < 3) return [{ kind: "same", text }];
  const blocks: DiffBlock[] = [];
  if (keepHead > 0) blocks.push({ kind: "same", text: lines.slice(0, keepHead).join("") });
  blocks.push({ kind: "fold", lines: hidden, text: lines.slice(keepHead, keepHead + hidden).join("") });
  if (keepTail > 0) blocks.push({ kind: "same", text: lines.slice(lines.length - keepTail).join("") });
  return blocks;
}

/**
 * Build a readable diff of `before` → `after`.
 * `context` = unchanged lines kept visible around each change.
 */
export function buildDiffView(before: string, after: string, options: { context?: number } = {}): DiffView {
  const context = options.context ?? 2;
  const stats: DiffStats = { wordsAdded: 0, wordsRemoved: 0, passagesChanged: 0, identical: before === after };
  if (before === after) return { blocks: [], stats };

  const changes = diffLines(before, after);
  const blocks: DiffBlock[] = [];

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    if (!change.added && !change.removed) {
      const position = i === 0 ? "first" : i === changes.length - 1 ? "last" : "middle";
      blocks.push(...foldSame(change.value, position, context));
      continue;
    }

    stats.passagesChanged++;
    const next = changes[i + 1];
    if (change.removed && next?.added) {
      const parts = wordParts(change.value, next.value);
      i++;
      if (parts) {
        for (const p of parts) {
          if (p.kind === "added") stats.wordsAdded += countWords(p.text);
          if (p.kind === "removed") stats.wordsRemoved += countWords(p.text);
        }
        blocks.push({ kind: "changed", parts });
      } else {
        stats.wordsRemoved += countWords(change.value);
        stats.wordsAdded += countWords(next.value);
        blocks.push({ kind: "removed", text: change.value }, { kind: "added", text: next.value });
      }
      continue;
    }

    if (change.added) {
      stats.wordsAdded += countWords(change.value);
      blocks.push({ kind: "added", text: change.value });
    } else {
      stats.wordsRemoved += countWords(change.value);
      blocks.push({ kind: "removed", text: change.value });
    }
  }

  return { blocks, stats };
}

/** "+120 words · −45 words · 6 passages changed" */
export function formatDiffStats(stats: DiffStats): string {
  if (stats.identical) return "No differences";
  const parts: string[] = [];
  if (stats.wordsAdded) parts.push(`+${stats.wordsAdded.toLocaleString("en-US")} words`);
  if (stats.wordsRemoved) parts.push(`−${stats.wordsRemoved.toLocaleString("en-US")} words`);
  if (!stats.wordsAdded && !stats.wordsRemoved) parts.push("Whitespace and line breaks only");
  parts.push(`${stats.passagesChanged} ${stats.passagesChanged === 1 ? "passage" : "passages"} changed`);
  return parts.join(" · ");
}
