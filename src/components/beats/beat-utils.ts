// Pure helpers for the Beat Sheet: ordering, runtime totals, durations and the
// streamed proposal. Beats are the writer's plan; nothing here touches script
// text.

import type { Beat } from "@/types/review";
import type { BeatCheck, BeatSuggestion } from "@/lib/llm/schemas";

type SuggestedBeat = BeatSuggestion["beats"][number];

/** A beat proposal as it streams in: every field may still be missing. */
export interface PartialProposal {
  beats?: Array<Partial<SuggestedBeat> | undefined>;
  rationale?: string;
}

/** A beat check as it streams in. */
export interface PartialCheck {
  coverage?: Array<Partial<BeatCheck["coverage"][number]> | undefined>;
  missing?: Array<Partial<BeatCheck["missing"][number]> | undefined>;
}

export interface ProposalItem {
  /** Index in the proposal (stable while it streams). */
  index: number;
  title: string;
  purpose: string;
  targetSeconds: number | null;
  /** False for the last item while the stream is still writing it. */
  settled: boolean;
}

/** Beats in display order. */
export function sortBeats(beats: Beat[]): Beat[] {
  return [...beats].sort((a, b) => a.position - b.position || a.id - b.id);
}

/**
 * Move one beat up (-1) or down (+1). Returns the reordered list with
 * positions renumbered from 0, or null when the beat can't move that way.
 */
export function moveBeat(beats: Beat[], id: number, direction: -1 | 1): Beat[] | null {
  const index = beats.findIndex((b) => b.id === id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= beats.length) return null;
  const next = [...beats];
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((b, i) => (b.position === i ? b : { ...b, position: i }));
}

/** Put beats in the given id order; ids not listed keep their relative order at the end. */
export function orderBeats(beats: Beat[], orderedIds: number[]): Beat[] {
  const rank = new Map(orderedIds.map((id, i) => [id, i]));
  const listed = beats.filter((b) => rank.has(b.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  const rest = sortBeats(beats.filter((b) => !rank.has(b.id)));
  return [...listed, ...rest].map((b, i) => (b.position === i ? b : { ...b, position: i }));
}

export interface BeatTotals {
  /** Beats that aren't cut. */
  activeBeats: number;
  draftedBeats: number;
  /** Sum of target seconds over beats that aren't cut. */
  plannedSeconds: number;
  /** Beats that aren't cut and have no target yet. */
  beatsWithoutTarget: number;
  /** The script's target runtime, if it has a target length. */
  targetSeconds: number | null;
  /** plannedSeconds minus targetSeconds (null without a target). */
  differenceSeconds: number | null;
}

export function beatTotals(beats: Beat[], targetSeconds: number | null): BeatTotals {
  let activeBeats = 0;
  let draftedBeats = 0;
  let plannedSeconds = 0;
  let beatsWithoutTarget = 0;
  for (const beat of beats) {
    if (beat.status === "cut") continue;
    activeBeats++;
    if (beat.status === "drafted") draftedBeats++;
    if (typeof beat.targetSeconds === "number" && beat.targetSeconds > 0) plannedSeconds += beat.targetSeconds;
    else beatsWithoutTarget++;
  }
  const target = targetSeconds && targetSeconds > 0 ? targetSeconds : null;
  return {
    activeBeats,
    draftedBeats,
    plannedSeconds,
    beatsWithoutTarget,
    targetSeconds: target,
    differenceSeconds: target === null ? null : plannedSeconds - target,
  };
}

/** "m:ss" (negative values are formatted by magnitude). */
export function formatSeconds(total: number): string {
  const seconds = Math.round(Math.abs(total));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** The beats API accepts 1 s to 2 h per beat. */
export const MAX_BEAT_SECONDS = 2 * 60 * 60;

/**
 * Parse a writer-typed duration: "90", "1:30", "1m30s", "2m", "45s", "2 min".
 * Returns null for an empty field (or zero: no target) and undefined when it
 * can't be read or is longer than MAX_BEAT_SECONDS.
 */
export function parseDuration(input: string): number | null | undefined {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  let seconds: number | undefined;
  let match: RegExpMatchArray | null;
  if ((match = text.match(/^(\d{1,5})\s*(?:s|sec|secs|seconds?)?$/))) {
    seconds = Number(match[1]);
  } else if ((match = text.match(/^(\d{1,3}):([0-5]\d)$/))) {
    seconds = Number(match[1]) * 60 + Number(match[2]);
  } else if ((match = text.match(/^(\d{1,3})\s*(?:m|min|mins|minutes?)(?:\s*(\d{1,2})\s*(?:s|sec|secs|seconds?)?)?$/))) {
    const secs = match[2] ? Number(match[2]) : 0;
    if (secs >= 60) return undefined;
    seconds = Number(match[1]) * 60 + secs;
  }

  if (seconds === undefined || seconds > MAX_BEAT_SECONDS) return undefined;
  return seconds === 0 ? null : seconds;
}

/**
 * Items of a (possibly partial) proposal. While streaming, the last item is
 * marked unsettled because its fields may still be growing. Items without a
 * title are skipped.
 */
export function proposalItems(proposal: PartialProposal | null | undefined, streaming: boolean): ProposalItem[] {
  const raw = proposal?.beats ?? [];
  const items: ProposalItem[] = [];
  raw.forEach((beat, index) => {
    const title = beat?.title?.trim();
    if (!title) return;
    items.push({
      index,
      title,
      purpose: beat?.purpose?.trim() ?? "",
      targetSeconds: typeof beat?.targetSeconds === "number" ? beat.targetSeconds : null,
      settled: !streaming || index < raw.length - 1,
    });
  });
  return items;
}

/** Proposal items that can be added (settled ones). */
export function settledProposalItems(proposal: PartialProposal | null | undefined, streaming: boolean): ProposalItem[] {
  return proposalItems(proposal, streaming).filter((item) => item.settled);
}

function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Is a beat with this title already on the sheet? (case and punctuation ignored) */
export function isOnSheet(title: string, beats: Beat[]): boolean {
  const key = titleKey(title);
  return key.length > 0 && beats.some((b) => titleKey(b.title) === key);
}

/** AI-suggested beats still marked planned: "Use these beats" replaces them. */
export function replaceableAiBeats(beats: Beat[]): Beat[] {
  return beats.filter((b) => b.source === "ai" && b.status === "planned");
}

export interface CoverageRow {
  beat: Beat;
  covered: boolean;
  comment: string;
  /** Where the beat happens in the draft (the saved anchor first). */
  anchorText: string | null;
}

/** Join a (possibly partial) check onto the current beats, in sheet order. */
export function coverageRows(beats: Beat[], check: PartialCheck | BeatCheck | null | undefined): CoverageRow[] {
  const byId = new Map<number, Partial<BeatCheck["coverage"][number]>>();
  for (const item of check?.coverage ?? []) {
    if (item && typeof item.beatId === "number") byId.set(item.beatId, item);
  }
  const rows: CoverageRow[] = [];
  for (const beat of sortBeats(beats)) {
    const item = byId.get(beat.id);
    if (!item || typeof item.covered !== "boolean") continue;
    const anchor = item.covered ? beat.anchorText || item.anchorText?.trim() || null : null;
    rows.push({ beat, covered: item.covered, comment: item.comment?.trim() ?? "", anchorText: anchor });
  }
  return rows;
}

/** Missing-beat proposals from a check that have a title. */
export function missingItems(check: PartialCheck | BeatCheck | null | undefined): Array<{ index: number; title: string; purpose: string }> {
  const items: Array<{ index: number; title: string; purpose: string }> = [];
  (check?.missing ?? []).forEach((m, index) => {
    const title = m?.title?.trim();
    if (title) items.push({ index, title, purpose: m?.purpose?.trim() ?? "" });
  });
  return items;
}
