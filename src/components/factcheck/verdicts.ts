// Labels, colours and grouping for fact notes. Pure so it can be unit-tested.

import type { FactClaimsDroppedBy } from "@/lib/api/facts";
import type { FactVerdict } from "@/lib/llm/schemas";
import type { FactNote } from "@/types/review";

export interface VerdictInfo {
  label: string;
  /** One line for screen readers and tooltips. */
  description: string;
  /** Tailwind classes for the badge (light theme, AA contrast). */
  badgeClass: string;
  /** Lower = needs the writer's attention sooner. */
  severity: number;
}

export const VERDICT_INFO: Record<FactVerdict, VerdictInfo> = {
  inaccurate: {
    label: "Inaccurate",
    description: "The sources contradict this claim.",
    badgeClass: "bg-red-50 text-red-800 border-red-200",
    severity: 0,
  },
  misleading: {
    label: "Misleading",
    description: "Technically true, but likely to leave the wrong impression.",
    badgeClass: "bg-orange-50 text-orange-800 border-orange-200",
    severity: 1,
  },
  unverifiable: {
    label: "Couldn't verify",
    description: "No reliable source confirmed or contradicted this claim.",
    badgeClass: "bg-stone-100 text-stone-700 border-stone-300",
    severity: 2,
  },
  "exaggeration-ok": {
    label: "Fair exaggeration",
    description: "Overstated on purpose, and reads as rhetoric rather than fact.",
    badgeClass: "bg-sky-50 text-sky-800 border-sky-200",
    severity: 3,
  },
  verified: {
    label: "Verified",
    description: "The sources back this claim.",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
    severity: 4,
  },
};

const UNKNOWN_VERDICT: VerdictInfo = {
  label: "Unrated",
  description: "The fact-check returned an unknown verdict.",
  badgeClass: "bg-stone-100 text-stone-700 border-stone-300",
  severity: 2,
};

export function verdictInfo(verdict: string): VerdictInfo {
  return (VERDICT_INFO as Record<string, VerdictInfo>)[verdict] ?? UNKNOWN_VERDICT;
}

export const STATUS_LABELS: Record<FactNote["status"], string> = {
  pending: "Open",
  acknowledged: "Acknowledged",
  dismissed: "Dismissed",
};

/** Only http(s) links are rendered; anything else (javascript:, data:) is dropped. */
export function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/** A source's title, else its host name without "www.". */
export function sourceLabel(source: { url: string; title?: string | null }): string {
  const title = source.title?.trim();
  if (title) return title;
  try {
    return new URL(source.url).hostname.replace(/^www\./, "") || source.url;
  } catch {
    return source.url;
  }
}

export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function sortBySeverity<T extends Pick<FactNote, "verdict" | "id">>(notes: readonly T[]): T[] {
  return [...notes].sort((a, b) => verdictInfo(a.verdict).severity - verdictInfo(b.verdict).severity || a.id - b.id);
}

export interface FactNoteGroups<T> {
  /** Open notes whose verdict asks the writer to look again. */
  toReview: T[];
  /** Open notes the sources back. */
  verified: T[];
  acknowledged: T[];
  dismissed: T[];
}

/**
 * An open note whose verdict asks the writer to look again (the "To review"
 * group). Only these are underlined in the text, so a verified claim never
 * looks like one that needs attention.
 */
export function needsReview(note: Pick<FactNote, "verdict" | "status">): boolean {
  return note.status === "pending" && note.verdict !== "verified";
}

export function groupFactNotes<T extends Pick<FactNote, "verdict" | "id" | "status">>(notes: readonly T[]): FactNoteGroups<T> {
  const groups: FactNoteGroups<T> = { toReview: [], verified: [], acknowledged: [], dismissed: [] };
  for (const note of sortBySeverity(notes)) {
    if (note.status === "dismissed") groups.dismissed.push(note);
    else if (note.status === "acknowledged") groups.acknowledged.push(note);
    else if (needsReview(note)) groups.toReview.push(note);
    else groups.verified.push(note);
  }
  return groups;
}

/** Counts from a finished fact-check (the stream's final meta). */
export interface FactRunCounts {
  claimsSaved?: number;
  claimsDropped?: number;
  /** claimsDropped by reason (absent from older servers). */
  claimsDroppedBy?: Partial<FactClaimsDroppedBy>;
  searchCount?: number;
}

function count(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

const DROP_REASONS: ReadonlyArray<[keyof FactClaimsDroppedBy, string]> = [
  ["notInScript", "not quoted exactly from your text"],
  ["duplicate", "repeated"],
  ["tooThin", "with nothing to report"],
  ["overLimit", "over the claim limit"],
];

/** "2 not quoted exactly from your text, 1 repeated", or `fallback` when the reasons aren't known. */
function dropReasons(by: Partial<FactClaimsDroppedBy> | undefined, fallback: string): string {
  const parts = DROP_REASONS.flatMap(([key, label]) => ((by?.[key] ?? 0) > 0 ? [[by![key]!, label] as const] : []));
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0][1];
  return parts.map(([n, label]) => `${n.toLocaleString("en-US")} ${label}`).join(", ");
}

/**
 * One line about a finished fact-check, so a run that kept no claims still
 * says what happened instead of looking like nothing ran. It names why claims
 * were left out from `claimsDroppedBy`; without it, `claimsDropped` lumps every
 * reason (not quoted from the script, a repeat, nothing to report, over the
 * claim limit), so the wording lists the possible ones. With none kept, only
 * the first and third apply.
 */
export function describeFactRun(meta: FactRunCounts | null): string {
  const saved = meta?.claimsSaved ?? 0;
  const dropped = meta?.claimsDropped ?? 0;
  const sources = meta?.searchCount ?? 0;
  if (saved === 0) {
    if (dropped > 0) {
      const lead =
        dropped === 1 ? "the 1 claim it found couldn't be kept" : `none of the ${count(dropped, "claim", "claims")} it found could be kept`;
      const why = dropReasons(meta?.claimsDroppedBy, "not quoted exactly from your text, or with nothing to report");
      return `Fact-check finished, but ${lead} (${why}), so there are no fact notes for this version.`;
    }
    return "Fact-check finished: no checkable claims were found in this version.";
  }
  const checked = `${count(saved, "claim", "claims")} checked${sources > 0 ? ` against ${count(sources, "source", "sources")}` : ""}.`;
  const why = dropReasons(meta?.claimsDroppedBy, "repeated, not quoted exactly from your text, or with nothing to report");
  const left = dropped > 0 ? ` ${dropped.toLocaleString("en-US")} more ${dropped === 1 ? "was" : "were"} left out (${why}).` : "";
  return `Fact-check finished: ${checked}${left}`;
}
