/**
 * Post-processing for markdown produced by Tiptap's serializer.
 *
 * Since @tiptap/markdown 3.25 every text node is backslash-escaped for
 * `\ ` * _ [ ] ~`, whether or not the character could ever be read as syntax.
 * Saving that output would turn `> [!tip]` callouts into `> \[!tip\]`,
 * `snake_case` into `snake\_case`, `~30s` into `\~30s`, and so on, rewriting
 * the writer's stored script on the first keystroke.
 *
 * `cleanSerializedMarkdown` removes the escapes that cannot change how the
 * markdown parses. It is deliberately conservative: an escape is only removed
 * when, by CommonMark/GFM rules (and marked's single-tilde strikethrough), the
 * bare character cannot open or close emphasis, strikethrough, a code span, a
 * link, a link reference definition, a task item, a list item or a thematic
 * break. Everything it cannot prove safe stays escaped.
 *
 * It only understands the shape of Tiptap's own output (all literal text
 * characters escaped, code always fenced, links inline, no reference
 * definitions). Do not run it on arbitrary hand-written markdown.
 *
 * This module has no imports so plain Node scripts can load it directly
 * (scripts/roundtrip-check.mjs). It also holds the two helpers that keep the
 * WYSIWYG editor from rewriting markdown it can't represent:
 * `splitFrontMatter` and `findRewrittenLine`.
 */

type Token =
  | { kind: "esc"; ch: string; pos: number } // `\x`
  | { kind: "ent"; ch: string; text: string; pos: number } // `&amp;` `&lt;` `&gt;`
  | { kind: "text"; ch: string; pos: number }
  | { kind: "raw"; text: string; pos: number }; // code span, link destination, inline HTML

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">" };
/** Text that would turn a preceding bare `&` into a character reference. */
const ENTITY_TAIL = /^(?:[A-Za-z][A-Za-z0-9]*;|#[0-9]+;|#[xX][0-9A-Fa-f]+;)/;

const ALNUM = /[\p{L}\p{N}]/u;
const WS = /\s/;

/** Line prefix made only of container markers: blockquote `>`, list bullets, ordered markers. */
const CONTAINER_PREFIX = /^(?:[ \t]*(?:>|[-+*](?=[ \t]|$)|\d{1,9}[.)](?=[ \t]|$)))*[ \t]*$/;
/** Same prefix, matched at the start of a line (used to find fences / list content). */
const LEADING_CONTAINERS = /^(?:[ \t]*(?:>|[-+*](?=[ \t])|\d{1,9}[.)](?=[ \t])))*[ \t]*/;
/** A list item marker inside the leading container prefix. */
const HAS_LIST_MARKER = /(?:^|[ \t>])(?:[-+*]|\d{1,9}[.)])[ \t]+$/;
const FENCE_OPEN = /^(`{3,}|~{3,})/;

export function cleanSerializedMarkdown(md: string): string {
  if (!md || (md.indexOf("\\") === -1 && md.indexOf("&") === -1)) return md;

  const lines = md.split("\n");
  const out: string[] = [];
  let block: string[] = [];
  let fence: { ch: string; len: number; depth: number } | null = null;

  const flush = () => {
    if (block.length > 0) {
      out.push(cleanBlock(block.join("\n")));
      block = [];
    }
  };

  for (const line of lines) {
    if (fence) {
      // Inside a fence only the blockquote depth of the opening line counts as
      // container prefix; a line without it ends the blockquote and the fence.
      const quotes = line.match(new RegExp(`^(?:[ \\t]*>){${fence.depth}}`));
      if (quotes) {
        out.push(line);
        const rest = line.slice(quotes[0].length);
        const close = rest.match(/^[ \t]*(`{3,}|~{3,})[ \t]*$/);
        if (close && close[1][0] === fence.ch && close[1].length >= fence.len) fence = null;
        continue;
      }
      fence = null;
    }

    const content = line.replace(LEADING_CONTAINERS, "");
    const open = content.match(FENCE_OPEN);
    if (open && !(open[1][0] === "`" && content.slice(open[1].length).includes("`"))) {
      flush();
      const depth = (line.match(/^(?:[ \t]*>)*/)?.[0].match(/>/g) ?? []).length;
      fence = { ch: open[1][0], len: open[1].length, depth };
      out.push(line);
      continue;
    }

    if (line.trim() === "") {
      flush();
      out.push(line);
      continue;
    }

    block.push(line);
  }
  flush();

  return out.join("\n");
}

/**
 * Clean one run of consecutive non-blank, non-fenced lines. Every inline
 * context (paragraph, heading, table cell) lies inside exactly one such run,
 * so counting characters per run is a safe over-approximation.
 */
function cleanBlock(src: string): string {
  // Raw HTML blocks: backslashes inside them are literal, leave untouched.
  for (const line of src.split("\n")) {
    if (/^</.test(line.replace(LEADING_CONTAINERS, ""))) return src;
  }

  const comment = restoreCommentLine(src);
  if (comment !== null) return comment;

  const tokens = tokenize(src);
  const unescape = new Set<number>(); // indexes of esc/ent tokens to write as the bare character

  const charAt = (i: number): string | undefined => (i >= 0 && i < src.length ? src[i] : undefined);
  const isWs = (c: string | undefined) => c === undefined || WS.test(c);
  const isAlnum = (c: string | undefined) => c !== undefined && ALNUM.test(c);
  const atLineStart = (pos: number) => {
    const ls = src.lastIndexOf("\n", pos - 1) + 1;
    return CONTAINER_PREFIX.test(src.slice(ls, pos));
  };
  const count = (ch: string) => src.split(ch).length - 1;

  // --- literal backslash: `\\x` -> `\x` when x is a letter/digit (not escapable)
  tokens.forEach((t, i) => {
    if (t.kind === "esc" && t.ch === "\\" && isAlnum(charAt(t.pos + 2))) unescape.add(i);
  });

  // --- emphasis characters `*` and `_`: runs of escaped delimiters
  for (const ch of ["*", "_"]) {
    const total = count(ch);
    forEachEscRun(tokens, ch, (first, last) => {
      const start = (tokens[first] as { pos: number }).pos;
      const end = (tokens[last] as { pos: number }).pos + 2;
      const before = charAt(start - 1);
      const after = charAt(end) === "\\" ? charAt(end + 1) : charAt(end);
      const runLen = last - first + 1;
      const lineStart = atLineStart(start);
      // marked judges a `*` run without counting a neighbouring `_` as
      // punctuation (and vice versa), and treats `~` as a word character.
      const touchesDelimiter = [before, after].some((c) => c === "*" || c === "_" || c === "~");
      let safe = false;
      // `_` between two letters/digits can neither open nor close emphasis.
      if (ch === "_" && isAlnum(before) && isAlnum(after)) safe = true;
      // Whitespace on both sides: neither left- nor right-flanking.
      // Not at line start, where `* ` would start a list item.
      if (!lineStart && before !== undefined && isWs(before) && isWs(after)) safe = true;
      // The only delimiter run of this character in the block cannot pair.
      if (!lineStart && !touchesDelimiter && runLen === total) safe = true;
      if (safe) for (let i = first; i <= last; i++) unescape.add(i);
    });
  }

  // --- tildes: marked parses single-tilde strikethrough (`~a~`)
  tildes(src, tokens, unescape);

  // --- backticks: only a lone backtick in the block cannot form a code span.
  //     Not near brackets: marked's link pattern rejects link text with an
  //     unpaired backtick.
  if (count("`") === 1 && count("[") === 0 && count("]") === 0) {
    tokens.forEach((t, i) => {
      if (t.kind !== "esc" || t.ch !== "`") return;
      // A backtick next to `~` would be read as one text run with it, eating `~~`.
      if (charAt(t.pos - 1) === "~" || charAt(t.pos + 2) === "~" || charAt(t.pos + 3) === "~") return;
      unescape.add(i);
    });
  }

  // --- brackets: `\[text\]` pairs that cannot become a link, image,
  //     reference definition or task item
  brackets(src, tokens, unescape);

  // --- HTML entities Tiptap adds for `&`, `<`, `>` in text
  const bareLt = tokens.some((t) => t.kind === "text" && t.ch === "<");
  tokens.forEach((t, i) => {
    if (t.kind !== "ent") return;
    const next = charAt(t.pos + t.text.length);
    // `&` unless it would start a character reference (`&amp;copy;` stays).
    if (t.ch === "&" && !ENTITY_TAIL.test(src.slice(t.pos + t.text.length))) unescape.add(i);
    // `< ` cannot open a tag or an autolink (marked also skips `<` + space
    // when masking HTML; a tab or newline would not be skipped).
    if (t.ch === "<" && next === " ") unescape.add(i);
    // `>` mid-line is literal unless it closes a tag opened by a bare `<`.
    if (t.ch === ">" && !bareLt && !atLineStart(t.pos)) unescape.add(i);
  });

  let result = "";
  tokens.forEach((t, i) => {
    if (t.kind === "esc") result += unescape.has(i) ? t.ch : "\\" + t.ch;
    else if (t.kind === "ent") result += unescape.has(i) ? t.ch : t.text;
    else if (t.kind === "text") result += t.ch;
    else result += t.text;
  });
  return result;
}

/**
 * A paragraph that is exactly an escaped HTML comment (`&lt;!-- note --&gt;`)
 * came from a `<!-- note -->` line, which Tiptap keeps as literal paragraph
 * text. Writing the raw comment back parses to the same paragraph and keeps
 * the line a real comment for the preview and the runtime counter.
 */
function restoreCommentLine(src: string): string | null {
  if (src.includes("\n") || !src.startsWith("&lt;!--") || !src.endsWith("--&gt;")) return null;
  const ESCAPE_OR_ENTITY = /\\([!-/:-@[-`{-~])|&(?:amp|lt|gt);/g;
  // Any unescaped syntax (marks, links, inline HTML, underline `++`) would be
  // flattened to literal text inside an HTML comment block: leave the line.
  if (/[*_~`[\]<>&\\+]/.test(src.replace(ESCAPE_OR_ENTITY, ""))) return null;
  const raw = src.replace(ESCAPE_OR_ENTITY, (m, esc: string | undefined) =>
    esc !== undefined ? esc : ENTITIES[m],
  );
  if (!raw.startsWith("<!--") || !raw.endsWith("-->") || raw.length < 7) return null;
  return raw;
}

/** One or more HTML comments with only whitespace around and between them. */
const COMMENT_BLOCK = /^\s*(?:<!--(?:(?!-->)[\s\S])*-->\s*)+$/;

/**
 * An HTML block that is only comments (the templates' `<!-- guidance -->`),
 * trimmed, or null when it holds anything else. The editor keeps such a block
 * as an `htmlComment` node and shows no text for it.
 */
export function commentBlockText(raw: string): string | null {
  return COMMENT_BLOCK.test(raw) ? raw.trim() : null;
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let lastText = ""; // last literal char emitted, for `](` detection
  while (i < src.length) {
    const c = src[i];
    if (c === "\\" && i + 1 < src.length && src[i + 1] !== "\n") {
      tokens.push({ kind: "esc", ch: src[i + 1], pos: i });
      lastText = "";
      i += 2;
      continue;
    }
    if (c === "&") {
      const ent = src.slice(i, i + 5).match(/^&(?:amp|lt|gt);/);
      if (ent) {
        tokens.push({ kind: "ent", ch: ENTITIES[ent[0]], text: ent[0], pos: i });
        lastText = "";
        i += ent[0].length;
        continue;
      }
    }
    if (c === "`") {
      let j = i;
      while (src[j] === "`") j++;
      const run = src.slice(i, j);
      const close = findBacktickRun(src, j, run.length);
      if (close !== -1) {
        tokens.push({ kind: "raw", text: src.slice(i, close + run.length), pos: i });
        i = close + run.length;
      } else {
        tokens.push({ kind: "raw", text: run, pos: i });
        i = j;
      }
      lastText = "";
      continue;
    }
    if (c === "(" && lastText === "]") {
      // Inline link destination: keep verbatim up to the matching paren.
      const end = matchParen(src, i);
      tokens.push({ kind: "raw", text: src.slice(i, end), pos: i });
      i = end;
      lastText = "";
      continue;
    }
    if (c === "<" && /[A-Za-z/!?]/.test(src[i + 1] ?? "")) {
      // Inline HTML or autolink: keep verbatim up to `>`.
      const end = src.indexOf(">", i);
      if (end !== -1) {
        tokens.push({ kind: "raw", text: src.slice(i, end + 1), pos: i });
        i = end + 1;
        lastText = "";
        continue;
      }
    }
    tokens.push({ kind: "text", ch: c, pos: i });
    lastText = c;
    i++;
  }
  return tokens;
}

function findBacktickRun(src: string, from: number, len: number): number {
  let i = from;
  while (i < src.length) {
    if (src[i] === "`") {
      let j = i;
      while (src[j] === "`") j++;
      if (j - i === len) return i;
      i = j;
    } else {
      i++;
    }
  }
  return -1;
}

function matchParen(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "\n" && src[i + 1] === "\n") break;
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return src.length;
}

/** Calls `fn(firstIndex, lastIndex)` for each run of consecutive esc tokens of `ch`. */
function forEachEscRun(tokens: Token[], ch: string, fn: (first: number, last: number) => void) {
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.kind === "esc" && t.ch === ch) {
      let j = i;
      while (j + 1 < tokens.length) {
        const n = tokens[j + 1];
        if (n.kind === "esc" && n.ch === ch && n.pos === (tokens[j] as { pos: number }).pos + 2) j++;
        else break;
      }
      fn(i, j);
      i = j + 1;
    } else {
      i++;
    }
  }
}

function tildes(src: string, tokens: Token[], unescape: Set<number>) {
  // A bare `~` already in the block (strikethrough markers) could pair with
  // anything we unescape; leave the whole block alone.
  if (tokens.some((t) => t.kind === "text" && t.ch === "~")) return;

  // Unescape single tildes left to right, never creating a closer after an
  // opener: a `~` followed by non-space can open; preceded by non-space can close.
  let openerSeen = false;
  tokens.forEach((t, i) => {
    if (t.kind !== "esc" || t.ch !== "~") return;
    const before = src[t.pos - 1];
    const after = src[t.pos + 2] === "\\" ? src[t.pos + 3] : src[t.pos + 2];
    if (before === "~" || after === "~") return;
    // marked's GFM emphasis rules treat a bare `~` as a word character, so next
    // to `*`/`_` it would change whether that delimiter can open or close; and
    // its text rule swallows a `~` + backtick run, breaking a code span.
    if ([before, after].some((c) => c === "*" || c === "_" || c === "`")) return;
    const canClose = before !== undefined && !WS.test(before);
    const canOpen = after !== undefined && !WS.test(after);
    if (canClose && openerSeen) return;
    unescape.add(i);
    if (canOpen) openerSeen = true;
  });
}

function brackets(src: string, tokens: Token[], unescape: Set<number>) {
  const isBracket = (t: Token) => (t.kind === "esc" || t.kind === "text") && (t.ch === "[" || t.ch === "]");

  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i];
    if (open.kind !== "esc" || open.ch !== "[") continue;

    // Innermost pair on the same line: the next bracket must be an escaped `]`.
    let j = i + 1;
    let crossesLine = false;
    while (j < tokens.length && !isBracket(tokens[j])) {
      const t = tokens[j];
      if ((t.kind === "text" && t.ch === "\n") || (t.kind === "raw" && t.text.includes("\n"))) {
        crossesLine = true;
        break;
      }
      j++;
    }
    if (crossesLine || j >= tokens.length) continue;
    const close = tokens[j];
    if (close.kind !== "esc" || close.ch !== "]") continue;

    const before = src[open.pos - 1];
    let after = src[close.pos + 2];
    if (after === "\\") after = src[close.pos + 3];
    // `](` inline link, `][` reference, `]:` definition, nested brackets.
    if (after === "(" || after === "[" || after === "]" || after === ":") continue;
    if (before === "[" || before === "]") continue;
    // Inside link text marked strips `\` before any bracket before lexing, so a
    // bracket right after a literal backslash (`\\[`) would lose that backslash.
    const inner = src.slice(open.pos + 2, close.pos);
    if (before === "\\" || inner.endsWith("\\")) continue;

    // `- [ ] item` / `- [x] item` would become a task checkbox.
    // (marked: /^\[[ xX]\] +\S/; a bare `- [ ]` at end of line stays text.)
    if (/^[ xX]$/.test(inner) && (after === " " || after === "\t")) {
      const ls = src.lastIndexOf("\n", open.pos - 1) + 1;
      const prefix = src.slice(ls, open.pos);
      if (CONTAINER_PREFIX.test(prefix) && HAS_LIST_MARKER.test(prefix)) continue;
    }

    unescape.add(i);
    unescape.add(j);
  }
}

// --- Front matter -------------------------------------------------------------

/**
 * Leading YAML front matter: a `---` line, a `key:` line straight after it,
 * YAML-shaped lines, and a closing `---` / `...` line, plus the blank lines
 * that follow. The `key:` requirement keeps a script that opens with a
 * horizontal rule (`---` and then a blank line, as Tiptap writes it) from
 * being taken for front matter.
 */
const FRONT_MATTER =
  /^\uFEFF?---[ \t]*\r?\n(?=[^\s#:][^\n]*:(?:[ \t]|\r?\n))([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)(?:[ \t]*\r?\n)*/;
/**
 * A line front matter can hold: `key: value`, an indented or `- ` line, a
 * comment or a blank. A line of prose means the `---` was a rule opening the
 * script (`---` / `Narrator: Welcome back.` / `Today we...`), whose words must
 * stay in the editor.
 */
const YAML_LINE = /^(?:[^\s#:-][^:]*:(?:[ \t].*)?|[ \t]+\S.*|-(?:[ \t].*)?|#.*|[ \t]*)$/;

/**
 * Splits leading front matter off a script. The WYSIWYG editor has no node
 * for it, so it edits only `body` and writes `frontMatter` back byte for byte.
 */
export function splitFrontMatter(markdown: string): { frontMatter: string; body: string } {
  const match = markdown.match(FRONT_MATTER);
  if (!match || !match[1].split("\n").every((line) => YAML_LINE.test(line.replace(/\r$/, "")))) {
    return { frontMatter: "", body: markdown };
  }
  return { frontMatter: match[0], body: markdown.slice(match[0].length) };
}

// --- Rewrite detection --------------------------------------------------------

export interface RewrittenLine {
  /** 1-based line in the writer's markdown. */
  line: number;
  /** That line as written, trimmed. */
  text: string;
}

const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
/** Blockquote and list markers at the start of a (whitespace-collapsed) line. */
const BLOCK_MARKERS = /^(?:(?:>|[-+*]|\d{1,9}[.)])(?: |$))+/;
const BACKSLASH_ESCAPE = /\\([!-/:-@[-`{-~])/g;
/**
 * An escape at the start of a line's text that keeps the line a paragraph
 * rather than a heading, list item, quote, fence, table or HTML block
 * (`\# not a heading`, `1\. not a list`). Tiptap doesn't write these back.
 */
const LEADING_BLOCK_ESCAPE = /^(?:\\[#>+\-*=`~<|]|\d{1,9}\\[.)])/;

/**
 * A line reduced to what it says, so that only real changes count: escapes,
 * spacing, bullet characters, list numbering, `_` vs `*` emphasis, rule and
 * fence styles, closing `#`s, hard break style, table padding and autolinks
 * are all ignored. Lines that carry no words (blank, `&nbsp;`, an empty list
 * item or quote marker) become "".
 */
function canonicalLine(line: string): string {
  if (THEMATIC_BREAK.test(line)) return "---";
  // A trailing `\` is a hard break, like two trailing spaces.
  const s = line.replace(BACKSLASH_ESCAPE, "$1").replace(/\s+/g, " ").replace(/\\$/, "").trim();
  const fence = s.match(/^(?:`{3,}|~{3,}) ?(.*)$/);
  if (fence) return "```" + fence[1];

  const markers = s.match(BLOCK_MARKERS)?.[0] ?? "";
  let rest = s.slice(markers.length);
  if (rest === "" || rest === "&nbsp;") return "";
  const prefix = markers.replace(/[+*]/g, "-").replace(/\d{1,9}[.)]/g, "1.").replace(/ /g, "");

  rest = rest
    .replace(/^(#{1,6}) (.*?)(?: #+)?$/, "$1 $2")
    .replace(/_/g, "*")
    .replace(/<((?:https?:\/\/|mailto:)[^\s<>]+|[^\s<>@]+@[^\s<>]+)>/g, "$1")
    .replace(/\[([^\]]+)\]\((?:mailto:)?\1\)/g, "$1");
  if (rest.includes("|")) {
    const cells = rest.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    rest = cells.every((c) => /^:?-+:?$/.test(c))
      ? cells.map((c) => `${c.startsWith(":") ? ":" : ""}-${c.length > 1 && c.endsWith(":") ? ":" : ""}`).join("|")
      : cells.join("|");
  }
  return prefix ? `${prefix} ${rest}` : rest;
}

interface CanonicalLine {
  line: number;
  canon: string;
  raw: string;
  /** Escaped double brackets (`\[\[`, `\]\]`): added ones turn `[[wikilinks]]` into plain text elsewhere. */
  escapedWikilinks: number;
  /** Starts with an escape that keeps it a paragraph (LEADING_BLOCK_ESCAPE). */
  leadingEscape: boolean;
}

function canonicalLines(markdown: string): CanonicalLine[] {
  const out: CanonicalLine[] = [];
  markdown.split("\n").forEach((raw, i) => {
    const canon = canonicalLine(raw);
    if (!canon) return;
    const collapsed = raw.replace(/\s+/g, " ").trim();
    out.push({
      line: i + 1,
      canon,
      raw,
      escapedWikilinks: (raw.match(/\\\[\\\[|\\\]\\\]/g) ?? []).length,
      leadingEscape: LEADING_BLOCK_ESCAPE.test(collapsed.slice(collapsed.match(BLOCK_MARKERS)?.[0].length ?? 0)),
    });
  });
  return out;
}

/**
 * The first line of `original` that saving it as `saved` would change in
 * substance (words, links, images, checkboxes, footnotes, HTML, front
 * matter, wikilinks, a paragraph turning into a heading or list...), or null
 * when the two say the same thing.
 */
export function findRewrittenLine(original: string, saved: string): RewrittenLine | null {
  const a = canonicalLines(original);
  const b = canonicalLines(saved);
  for (let i = 0; i < a.length; i++) {
    if (
      i >= b.length ||
      a[i].canon !== b[i].canon ||
      b[i].escapedWikilinks > a[i].escapedWikilinks ||
      (a[i].leadingEscape && !b[i].leadingEscape)
    ) {
      return { line: a[i].line, text: a[i].raw.trim() };
    }
  }
  // Lines added after the end: point at the last line, which left something open.
  if (b.length > a.length) {
    const last = a[a.length - 1];
    return last ? { line: last.line, text: last.raw.trim() } : { line: 1, text: "" };
  }
  return null;
}
