import { diffLines, diffWords, type Change } from "diff";

export interface DiffResult {
  changes: Change[];
}

export function computeLineDiff(
  oldText: string,
  newText: string
): DiffResult {
  return { changes: diffLines(oldText, newText) };
}

export function computeWordDiff(
  oldText: string,
  newText: string
): DiffResult {
  return { changes: diffWords(oldText, newText) };
}
