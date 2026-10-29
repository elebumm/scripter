// Runtime is estimated from the words the narrator will actually say. Headings,
// front matter, production callouts (> [!note] VISUAL …), [bracketed cues],
// HTML comments and code blocks are planning text, not narration.

import { splitFrontMatter } from "@/lib/markdown/serialize";
import { markdownToPlain } from "@/lib/text/anchor";

export const DEFAULT_WORDS_PER_MINUTE = 155;

/**
 * Callout types whose body is read aloud. Every other `> [!type]` block is a
 * production note and is not counted. Plain `>` quotes are always spoken.
 */
export const SPOKEN_CALLOUT_TYPES: ReadonlySet<string> = new Set([
  "quote",
  "cite",
  "spoken",
  "say",
  "vo",
  "voiceover",
  "narration",
  "dialogue",
]);

export interface SpokenWordOptions {
  /** Override which callout types count as spoken (case-insensitive). */
  spokenCalloutTypes?: Iterable<string>;
}

/** Raw whitespace-separated token count (everything, markup included). */
export function getWordCount(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const CALLOUT = /^\s{0,3}>\s?\[!([\w-]+)\][+-]?(.*)$/;
const QUOTE_LINE = /^\s{0,3}>/;
const HEADING = /^\s{0,3}#{1,6}(\s|$)/;
const SETEXT_H1 = /^\s{0,3}=+\s*$/;
const BLOCK_START = /^\s{0,3}(#{1,6}(\s|$)|>|[-*+]\s|\d+[.)]\s|`{3,}|~{3,}|\|)/;

/** LF line endings, without a BOM, front matter or HTML comments. */
function documentBody(markdown: string): string {
  let body = markdown.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  // Front matter at the very start: YAML as the editor sets it aside, or TOML.
  body = splitFrontMatter(body).body;
  body = body.replace(/^\+\+\+\n[\s\S]*?\n\+\+\+[ \t]*(?:\n|$)/, "");
  // HTML comments; an unclosed one hides the rest of the document when rendered.
  return body.replace(/<!--[\s\S]*?(?:-->|$)/g, " ");
}

/** True when `line` closes a code block opened with `fence`. */
function closesFence(line: string, fence: string): boolean {
  const close = line.match(FENCE);
  return Boolean(
    close && close[1][0] === fence[0] && close[1].length >= fence.length && !line.trim().slice(close[1].length).trim()
  );
}

// A closing "#" run only counts when whitespace precedes it ("# Learn C#" keeps its "#").
// Up to three spaces of indent; a leading tab makes it indented code.
const ATX_H1 = /^ {0,3}#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;

/** Plain text of a single line that is an ATX `# Heading`, else null. */
export function h1LineText(line: string): string | null {
  const match = line.match(ATX_H1);
  return match ? markdownToPlain(match[1]).trim() || null : null;
}

/**
 * Plain text of the first `# Heading` of a script, or null. Front matter,
 * HTML comments and fenced code are skipped, so a `# comment` in a bash block
 * is never taken for the title.
 */
export function firstH1Text(markdown: string): string | null {
  let fence: string | null = null;
  for (const line of documentBody(markdown).split("\n")) {
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    const opening = line.match(FENCE);
    if (opening) {
      fence = opening[1];
      continue;
    }
    const heading = h1LineText(line);
    if (heading) return heading;
  }
  return null;
}

/**
 * Plain text of the `# Heading` the script opens with (front matter, HTML
 * comments and blank lines before it skipped), or null when it opens with
 * anything else.
 */
export function leadingH1Text(markdown: string): string | null {
  const first = documentBody(markdown)
    .split("\n")
    .find((line) => line.trim() !== "");
  return first === undefined ? null : h1LineText(first);
}

/** The narration only, as plain-ish text (line structure kept). */
export function spokenText(markdown: string, options: SpokenWordOptions = {}): string {
  const spokenTypes = new Set(
    [...(options.spokenCalloutTypes ?? SPOKEN_CALLOUT_TYPES)].map((t) => t.toLowerCase())
  );

  const body = documentBody(markdown);

  const out: string[] = [];
  let fence: string | null = null;
  let inUnspokenCallout = false;
  let calloutLineHadText = false;
  let previousWasParagraph = false;

  for (const line of body.split("\n")) {
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }

    if (inUnspokenCallout) {
      const isLazyContinuation = calloutLineHadText && line.trim() !== "" && !BLOCK_START.test(line);
      if (QUOTE_LINE.test(line) || isLazyContinuation) {
        calloutLineHadText = line.replace(/^\s{0,3}(>\s?)+/, "").trim() !== "";
        continue;
      }
      inUnspokenCallout = false;
    }

    const opening = line.match(FENCE);
    if (opening) {
      fence = opening[1];
      previousWasParagraph = false;
      continue;
    }

    const callout = line.match(CALLOUT);
    if (callout) {
      if (!spokenTypes.has(callout[1].toLowerCase())) {
        inUnspokenCallout = true;
        calloutLineHadText = callout[2].trim() !== "";
      }
      // A spoken callout's title line is a label, not narration.
      previousWasParagraph = false;
      continue;
    }

    if (HEADING.test(line)) {
      previousWasParagraph = false;
      continue;
    }

    if (SETEXT_H1.test(line) && previousWasParagraph) {
      out.pop();
      previousWasParagraph = false;
      continue;
    }

    const text = line
      .replace(/^\s{0,3}(>\s?)+/, "")
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, "");
    previousWasParagraph = text.trim() !== "";
    out.push(text);
  }

  return out
    .join("\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links keep their text
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1") // reference links
    .replace(/\[[^\]\n]*\]/g, " ") // [CUES], [B-ROLL: …], footnote refs
    .replace(/<\/?[A-Za-z][^>]*>/g, " ") // HTML tags
    .replace(/&(?:nbsp|#160|#x0*a0);/gi, " "); // Tiptap writes "&nbsp;" for repeated blank paragraphs
}

/** Words the narrator says (tokens containing a letter or digit). */
export function countSpokenWords(markdown: string, options: SpokenWordOptions = {}): number {
  if (!markdown.trim()) return 0;
  let count = 0;
  for (const token of spokenText(markdown, options).split(/\s+/)) {
    if (/[\p{L}\p{N}]/u.test(token)) count++;
  }
  return count;
}

/** Seconds of narration at `wpm` words per minute. */
export function estimateRuntimeSeconds(words: number, wpm: number = DEFAULT_WORDS_PER_MINUTE): number {
  const rate = Number.isFinite(wpm) && wpm > 0 ? wpm : DEFAULT_WORDS_PER_MINUTE;
  if (!Number.isFinite(words) || words <= 0) return 0;
  return Math.round((words / rate) * 60);
}

/** "m:ss" (minutes keep counting past 59, e.g. "72:05"). */
export function formatRuntime(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}
