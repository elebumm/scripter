// Anchors are verbatim quotes of the writer's own text. Models copy them from
// markdown, the editor shows rendered text, and quotes/dashes/whitespace drift,
// so every comparison goes through the same projection and normalisation.

import { commentBlockText, splitFrontMatter } from "@/lib/markdown/serialize";

export interface NormalizedText {
  text: string;
  /** map[i] = index in the source string of normalized character i. */
  map: number[];
}

const SINGLE_QUOTES = /[‘’‚‛′]/;
const DOUBLE_QUOTES = /[“”„‟″]/;
const DASHES = /[‐‑‒–—―−]/;
// Table cells show on separate lines, so a pipe counts as whitespace too.
const SPACE = /[\s\u00A0\u2000-\u200B\u202F\u205F\u3000|]/;

/**
 * Normalise quotes, dashes, ellipses and whitespace (collapsed to one space,
 * trimmed) while remembering where each character came from.
 */
export function normalizeForMatch(source: string, options: { caseFold?: boolean } = {}): NormalizedText {
  let text = "";
  const map: number[] = [];
  let pendingSpace = false;

  for (let i = 0; i < source.length; i++) {
    let ch = source[i];
    if (SPACE.test(ch)) {
      pendingSpace = text.length > 0;
      continue;
    }
    if (pendingSpace) {
      text += " ";
      map.push(i);
      pendingSpace = false;
    }
    if (SINGLE_QUOTES.test(ch)) ch = "'";
    else if (DOUBLE_QUOTES.test(ch)) ch = '"';
    else if (DASHES.test(ch)) ch = "-";
    else if (ch === "…") {
      for (let k = 0; k < 3; k++) {
        text += ".";
        map.push(i);
      }
      continue;
    }
    if (options.caseFold) ch = ch.toLowerCase();
    text += ch;
    map.push(i);
  }

  return { text, map };
}

// The editor decodes these in text (decodeHtmlEntities in @tiptap/core); any
// other named entity (&nbsp;, &copy;) stays literal.
const ENTITY_OR_ESCAPE = /\\([!-/:-@[-`{-~])|&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|(lt|gt|quot|amp));/g;
const NAMED_ENTITIES: Record<string, string> = { lt: "<", gt: ">", quot: '"', amp: "&" };
// Numeric references 128-159 are read as Windows-1252, as the editor does.
const WINDOWS_1252: Record<number, number> = {
  128: 8364, 130: 8218, 131: 402, 132: 8222, 133: 8230, 134: 8224, 135: 8225, 136: 710, 137: 8240,
  138: 352, 139: 8249, 140: 338, 142: 381, 145: 8216, 146: 8217, 147: 8220, 148: 8221, 149: 8226,
  150: 8211, 151: 8212, 152: 732, 153: 8482, 154: 353, 155: 8250, 156: 339, 158: 382, 159: 376,
};

function decodeCodePoint(cp: number): string {
  if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return "\uFFFD";
  return String.fromCodePoint(WINDOWS_1252[cp] ?? cp);
}

// Code (spans and fenced lines) is shown raw: parked behind placeholders while
// the inline syntax around it is removed.
const PARKED = /\uE010(\d+)\uE011/g;
const CODE_SPAN = /(?<![`\\])(`+)(?!`)([^\n]+?)(?<!`)\1(?!`)/g;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const TABLE_DELIMITER = /^(?=[^\n]*\|)\s{0,3}\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const UNESCAPED_PIPE = /(?<!\\)\|/;

/**
 * How many lines the comment-only HTML block at line i spans (the editor
 * keeps it as a node with no text), or 0. Like CommonMark, the block ends on
 * the first line that closes the comment.
 */
function commentBlockAt(source: string[], i: number): number {
  const open = source[i].match(/^ {0,3}<!--/);
  if (!open) return 0;
  let j = i;
  while (j < source.length && !source[j].includes("-->", j === i ? open[0].length : 0)) j++;
  if (j === source.length) return 0;
  return commentBlockText(source.slice(i, j + 1).join("\n")) !== null ? j - i + 1 : 0;
}

/** A table row as the editor shows it: one cell per line. */
function tableRow(row: string): string {
  let r = row.trim();
  if (r.startsWith("|")) r = r.slice(1);
  if (r.endsWith("|") && !r.endsWith("\\|")) r = r.slice(0, -1);
  return r
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim())
    .join("\n");
}

/**
 * Project markdown onto the text the editor shows: drops front matter,
 * heading / list / quote markers, emphasis and code markers, link syntax,
 * backslash escapes, horizontal rules and comment-only blocks (the editor's
 * htmlComment node has no text), decodes the entities the editor decodes, and
 * puts each table cell on its own line. Other raw HTML and inline comments
 * stay, as markdown mode shows them. Line structure is kept.
 */
export function markdownToPlain(md: string): string {
  let body = md.replace(/\r\n?/g, "\n");
  // The front matter the editor sets aside (a script opening with a rule keeps its words).
  body = splitFrontMatter(body).body;

  const parked: string[] = [];
  const park = (raw: string) => `\uE010${parked.push(raw) - 1}\uE011`;

  const source = body.split("\n");
  const lines: string[] = [];
  let fence: string | null = null;
  let table = false;
  for (let i = 0; i < source.length; i++) {
    let l = source[i];
    const open = l.match(FENCE);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length && !l.slice(open[0].length).trim()) {
        fence = null;
        lines.push("");
      } else {
        lines.push(park(l));
      }
      continue;
    }
    if (open) {
      fence = open[1];
      lines.push("");
      continue;
    }
    if (!l.trim()) table = false;
    else if (!table && UNESCAPED_PIPE.test(l) && TABLE_DELIMITER.test(source[i + 1] ?? "")) table = true;
    if (table) {
      lines.push(TABLE_DELIMITER.test(l) ? "" : tableRow(l));
      continue;
    }
    const comment = commentBlockAt(source, i);
    if (comment) {
      for (let k = 0; k < comment; k++) lines.push("");
      i += comment - 1;
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)) {
      lines.push("");
      continue;
    }
    if (/^\s{0,3}=+\s*$/.test(l) && (lines[lines.length - 1] ?? "").trim()) {
      lines.push("");
      continue;
    }
    l = l.replace(/^\s{0,3}(>\s?)+/, "");
    if (/^\s{0,3}#{1,6}\s+/.test(l)) l = l.replace(/^\s{0,3}#{1,6}\s+/, "").replace(/\s+#+\s*$/, "");
    l = l.replace(/^\s*(?:[-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, "");
    // A comment block inside a quote or list item.
    lines.push(commentBlockText(l) !== null ? "" : l);
  }

  return lines
    .join("\n")
    .replace(CODE_SPAN, (_m, _ticks: string, code: string) =>
      park(/^ .*[^ ].* $/.test(code) ? code.slice(1, -1) : code)
    )
    .replace(/<((?:https?|ftp|mailto):[^\s<>]+|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>/gi, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/(^|[\s(])([*_])(?=\S)([^*_\n]*?\S)\2(?=[\s).,;:!?]|$)/gm, "$1$3")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1")
    // GFM also strikes through with single tildes; "~30 seconds" alone stays.
    .replace(/(?<![~\\])~(?=[^\s~])((?:\\.|[^\\~\n])*?(?:\\.|[^\s~\\]))~(?!~)/g, "$1")
    .replace(/\\\n/g, "\n")
    .replace(ENTITY_OR_ESCAPE, (_m, escaped?: string, dec?: string, hex?: string, name?: string) => {
      if (escaped !== undefined) return escaped;
      if (dec !== undefined) return decodeCodePoint(Number(dec));
      if (hex !== undefined) return decodeCodePoint(parseInt(hex, 16));
      return NAMED_ENTITIES[name!];
    })
    .replace(PARKED, (_m, i: string) => parked[Number(i)]);
}

export interface AnchorMatch {
  /** Inclusive start index in the searched text. */
  start: number;
  /** Exclusive end index in the searched text. */
  end: number;
  /** How the match was found; "exact" is the strongest. */
  tier: "exact" | "normalized" | "casefold";
  /** Total occurrences at the winning tier (> 1 means the anchor is ambiguous). */
  occurrences: number;
}

function countOccurrences(hay: string, needle: string): number {
  let n = 0;
  let from = 0;
  while (needle && (from = hay.indexOf(needle, from)) !== -1) {
    n++;
    from += needle.length;
  }
  return n;
}

/**
 * Find an anchor (already projected with markdownToPlain if it came from a
 * model) inside plain text. Tries exact, then normalised, then case-folded.
 */
export function findAnchorInText(plain: string, anchor: string): AnchorMatch | null {
  const trimmed = anchor.trim();
  if (!trimmed) return null;

  const exact = plain.indexOf(trimmed);
  if (exact !== -1) {
    return { start: exact, end: exact + trimmed.length, tier: "exact", occurrences: countOccurrences(plain, trimmed) };
  }

  for (const tier of ["normalized", "casefold"] as const) {
    const caseFold = tier === "casefold";
    const hay = normalizeForMatch(plain, { caseFold });
    const needle = normalizeForMatch(trimmed, { caseFold }).text;
    if (!needle) return null;
    const idx = hay.text.indexOf(needle);
    if (idx !== -1) {
      const start = hay.map[idx];
      const end = hay.map[idx + needle.length - 1] + 1;
      return { start, end, tier, occurrences: countOccurrences(hay.text, needle) };
    }
  }
  return null;
}

/** Server-side validation: does this anchor quote the writer's script? */
export function anchorExistsInMarkdown(markdown: string, anchor: string): boolean {
  return findAnchorInText(markdownToPlain(markdown), markdownToPlain(anchor)) !== null;
}

/**
 * Server-side: the writer's own text an anchor points at (a slice of
 * markdownToPlain(markdown), as the editor shows it), or null when it doesn't
 * quote the script or is too short to point at one place. Store this, never
 * the model's string: whatever the model wrapped around the quote (markup,
 * link targets, its own words) is not in the slice.
 */
export function resolveAnchor(markdown: string, anchor: string): string | null {
  if (!isUsableAnchor(anchor)) return null;
  const plain = markdownToPlain(markdown);
  const match = findAnchorInText(plain, markdownToPlain(anchor));
  if (!match) return null;
  const text = plain.slice(match.start, match.end);
  // Stored anchors are projected again on the client; text that changes under
  // that (code showing "&amp;" or "\*") would never be found or highlighted.
  const again = findAnchorInText(plain, markdownToPlain(text));
  if (!again || plain.slice(again.start, again.end) !== text) return null;
  return isUsableAnchor(text) ? text : null;
}

/**
 * Anchors must be long enough to point at one place: at least two words, and
 * three words or 12 characters. A single word ("AI", "basically") matches all
 * over a script and inside other words.
 */
export function isUsableAnchor(anchor: string): boolean {
  const plain = normalizeForMatch(markdownToPlain(anchor)).text;
  const words = plain.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return words >= 2 && (words >= 3 || plain.length >= 12);
}

/** Normalised, case-folded form for "is this text in the script" checks. */
export function matchKey(s: string): string {
  return normalizeForMatch(markdownToPlain(s), { caseFold: true }).text;
}
