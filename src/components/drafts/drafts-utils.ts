// Pure helpers for the Drafts page (filtering, labels, file names).

import type { ScriptSummary } from "@/lib/api";
import { parseDbDate } from "@/lib/utils/dates";
import { displayTitle, headingTitle } from "@/lib/utils/titles";

export { displayTitle, headingTitle, isLegacyDefaultTitle, isPlaceholderHeading, writerTitle } from "@/lib/utils/titles";

export type DraftsFilter = "all" | "recent" | "archive";

/** RECENT shows scripts edited within this many days. */
export const RECENT_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isRecent(updatedAt: string | null | undefined, now: number, days = RECENT_DAYS): boolean {
  const date = parseDbDate(updatedAt);
  if (!date) return false;
  return now - date.getTime() <= days * DAY_MS;
}

/** Newest edit first; unparseable dates sink to the bottom. */
export function sortByUpdated<T extends Pick<ScriptSummary, "updatedAt" | "id">>(scripts: readonly T[]): T[] {
  return [...scripts].sort((a, b) => {
    const ta = parseDbDate(a.updatedAt)?.getTime() ?? 0;
    const tb = parseDbDate(b.updatedAt)?.getTime() ?? 0;
    return tb - ta || b.id - a.id;
  });
}

/** What the search box matches: the shown title and the draft's headline (a stored title can hide it). */
function searchText(script: { title: string; heading?: string | null }): string {
  return `${displayTitle(script.title, script.heading)}
${headingTitle(script.heading)}`.toLowerCase();
}

/**
 * Apply the sidebar filter and the search box. The ARCHIVE list is fetched
 * separately (archived scripts only), so "archive" only applies the search.
 */
export function filterScripts<T extends Pick<ScriptSummary, "title" | "updatedAt" | "id"> & { heading?: string | null }>(
  scripts: readonly T[],
  options: { filter: DraftsFilter; search: string; now: number }
): T[] {
  const query = options.search.trim().toLowerCase();
  const filtered = scripts.filter((s) => {
    if (options.filter === "recent" && !isRecent(s.updatedAt, options.now)) return false;
    if (query && !searchText(s).includes(query)) return false;
    return true;
  });
  return sortByUpdated(filtered);
}

/** "7.4" for a council average, null when the script was never reviewed. */
export function formatScore(score: number | null | undefined): string | null {
  if (score == null || !Number.isFinite(score)) return null;
  return score.toFixed(1);
}

export function formatWords(words: number): string {
  if (!words) return "No words yet";
  return `${words.toLocaleString("en-US")} ${words === 1 ? "word" : "words"}`;
}

export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function exportFilename(title: string, id: number): string {
  const slug = slugify(title);
  return `${slug || `script-${id}`}.md`;
}

/** Where to go after creating a script (optionally straight into beat suggestions). */
export function scriptHref(id: number, options: { suggestBeats?: boolean } = {}): string {
  return options.suggestBeats ? `/script/${id}?beats=suggest` : `/script/${id}`;
}

export function headingFor(filter: DraftsFilter): string {
  if (filter === "recent") return "Recent";
  if (filter === "archive") return "Archive";
  return "Drafts";
}

/** The line under the page heading. */
export function countLabel(filter: DraftsFilter, count: number): string {
  if (filter === "archive") {
    return count === 1 ? "1 archived script" : `${count} archived scripts`;
  }
  if (filter === "recent") {
    return `${count} edited in the last ${RECENT_DAYS} days`;
  }
  return count === 1 ? "1 script" : `${count} scripts`;
}

/**
 * What to say when the grid is empty. `totalCount` is the size of the list
 * before the filter and search, so "No scripts yet" only shows when there
 * really are none.
 */
export function emptyState(
  filter: DraftsFilter,
  search: string,
  totalCount: number
): { title: string; body: string; showCreate: boolean } {
  const query = search.trim();
  if (query && totalCount > 0) {
    return { title: `No scripts match “${query}”`, body: "Try a different word from the title or headline.", showCreate: false };
  }
  if (filter === "archive") {
    return { title: "The archive is empty", body: "Scripts you archive from Drafts show up here.", showCreate: false };
  }
  if (totalCount === 0) {
    return { title: "No scripts yet", body: "Start a script and it will show up here.", showCreate: true };
  }
  return {
    title: `Nothing edited in the last ${RECENT_DAYS} days`,
    body: "Older scripts are under All drafts.",
    showCreate: false,
  };
}
