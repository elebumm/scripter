// "Your words only": AI feedback may quote the writer, but must never hand
// them replacement lines. This guard strips supplied wording from any AI text
// shown to the writer (note issue/why/question, summary, overview, beat
// title/purpose, fact explanation) before it is stored or streamed.
//
// Supplied wording comes in three shapes:
// - a quoted span that isn't the writer's text: quotes of any kind, backticks,
//   capitalised italics, bold after a cue, [CUE: ...] brackets, blockquote
//   lines, fenced code. 4+ words, or any length right after a cue ('Try "Stop."');
// - the clause after an explicit cue: "Try:", "Open with:", "Something like:",
//   "Suggestion:", "e.g. <Sentence>", "Rewrite it as ...", "you could say ...";
// - in a streamed partial, a quote or cue clause that hasn't closed yet.
// Diagnosis stays as written: structural advice ("open with *the reveal*",
// "rewrite it to be shorter"), what the draft does ("you never say who ..."),
// and the writer's own words quoted with punctuation, case, number, cue or
// elision drift. Markdown structure is kept.

import { matchKey } from "@/lib/text/anchor";

export interface GuardResult {
  text: string;
  /** True when something was removed. */
  tripped: boolean;
}

export interface GuardOptions {
  /**
   * The text is a streamed partial: also hide a trailing quote or lead-in
   * clause that hasn't closed yet, so supplied wording never flashes on screen.
   */
  partial?: boolean;
}

const MIN_QUOTED_WORDS = 4;
/** Marks a removed span while the passes run; shown as "…". */
const CUT = "\uE000";

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

function wordCount(s: string): number {
  return s.split(/[\s\uE000]+/).filter((w) => LETTER_OR_DIGIT.test(w)).length;
}

// --- Is it the writer's text? ---------------------------------------------

/** The words of a matchKey, with punctuation, quotes and dashes as spaces. */
function toWords(key: string): string {
  return key
    .replace(/(?<=\p{N})[,.](?=\p{N}{3}(?!\p{N}))/gu, "")
    .replace(/(?<![\p{L}\p{N}])'|'(?![\p{L}\p{N}])/gu, " ")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim();
}

interface Writer {
  /** The writer's words, space-padded. */
  words: string;
  /** The same with [bracket cues] left out, so a quote may skip a cue. */
  spoken: string;
}

let lastWriter: { key: string; writer: Writer } | undefined;

function writerFor(scriptKey: string): Writer {
  if (lastWriter?.key !== scriptKey) {
    lastWriter = {
      key: scriptKey,
      writer: {
        words: ` ${toWords(scriptKey)} `,
        spoken: ` ${toWords(scriptKey.replace(/\[[^\]]*\]/g, " "))} `,
      },
    };
  }
  return lastWriter.writer;
}

function inOrder(hay: string, pieces: string[]): boolean {
  let from = 0;
  for (const piece of pieces) {
    const at = hay.indexOf(` ${piece} `, from);
    if (at === -1) return false;
    from = at + piece.length + 1;
  }
  return true;
}

/** The writer's own words, compared word by word (punctuation, case, quote and dash drift ignored). */
function isWriters(span: string, writer: Writer): boolean {
  if (span.includes(CUT)) return false;
  const key = matchKey(span);
  const whole = toWords(key);
  if (!whole) return true;
  const hays = [writer.words, writer.spoken];
  if (hays.some((h) => h.includes(` ${whole} `))) return true;
  // An elided quote: every piece in script order, none of them a lone word.
  const pieces = key.split(/\[?\.{3,}\]?/).map(toWords).filter(Boolean);
  return pieces.length > 1 && pieces.every((p) => p.includes(" ")) && hays.some((h) => inOrder(h, pieces));
}

/**
 * Is this unfinished span (so far) the start of the writer's words? A lone
 * partial word ("Nob") says too little, so it doesn't count.
 */
function isWritersSoFar(span: string, writer: Writer): boolean {
  if (span.includes(CUT)) return false;
  const words = toWords(matchKey(span));
  if (!words) return true;
  if (!words.includes(" ")) return false;
  return writer.words.includes(` ${words}`) || writer.spoken.includes(` ${words}`);
}

// --- Cues --------------------------------------------------------------------

const CUE_END = String.raw`[^\S\n]*[*_]{0,3}[^\S\n]*`;
const LINE_NOUN = String.raw`(?:line|lines|opener|hook|sentence|version|phrasing|wording|ending|close|cta|intro|outro|open|take)`;
const OBJECT = String.raw`(?: (?:it|this|the line|that))?`;

/** At the start of a sentence, list item or bold label. */
const LABEL_START = String.raw`(?<=(?:^|[.!?\n])[^\S\n]*(?:(?:[-*+>]|\d+[.)])[^\S\n]+)?(?:\*\*|__)?)`;

/**
 * Cues that introduce a line when a colon follows. Groups "example" (e.g., for
 * example) and "label" ("Suggestion:", "Better:" at the start of a sentence)
 * mark cues a diagnosis also uses: there a clause about the script stays.
 */
const COLON_CUE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:(?<example>e\.? ?g\.?|eg|for (?:example|instance)|such as)|(?<label>` +
    LABEL_START +
    String.raw`(?:example(?: (?:line|opener|opening|hook|rewrite|phrasing|wording))?|suggestion|suggested (?:lines?|wording|phrasing|rewrite|version|opener|opening|hook|text|copy)|alternative(?:ly| (?:line|version|phrasing|opener|wording))?|(?:one|another) option|(?:something |even )?(?:better|stronger|punchier|tighter|sharper|cleaner|simpler|clearer)|like this|(?:something )?along the lines of|consider|perhaps|maybe|here(?:['’]s| is) (?:one|a|an|another)(?: [\p{L}-]+){0,4} (?:way|version|option|take|line|opener|rewrite|phrasing)(?: [\p{L}-]+){0,3}))|` +
    [
      String.raw`try(?: (?:saying|writing|something like|opening with|starting with|ending with|leading with))?`,
      String.raw`something(?: \p{L}+)? like|(?:a |an |the )?(?:line|sentence|opener|phrase) (?:like|such as)`,
      String.raw`(?:open|start|end|close|lead|finish)(?:ing|s)?(?: (?:the video|the script|the piece|the section|it|this|things))? (?:with|on)(?: (?:a|an|one) [\p{L}-]+(?: [\p{L}-]+)?)?`,
      String.raw`(?:a |an |the |your )?(?:better|stronger|punchier|tighter|cleaner|sharper|simpler|clearer|new|alternative|revised|suggested|possible)(?: (?:first|opening|closing|final|last))? ${LINE_NOUN}(?: (?:would be|could be|might be|is|like|such as))?`,
      String.raw`(?:the |a |your )?(?:(?:first|opening|closing|final|last|new) )?${LINE_NOUN} (?:could|might|should|would) (?:be|read|say)`,
      String.raw`(?:it |this |that )?(?:could|might|would) (?:read|go)(?: something like)?`,
      String.raw`(?:suggested |possible )?(?:rewrite|rephrase|reword)${OBJECT}(?: (?:as|to))?`,
      String.raw`(?:change|turn)${OBJECT} (?:to|into)|replace${OBJECT} with|swap${OBJECT} (?:for|with)|swap in|make it`,
      String.raw`(?:you|we) (?:could|might|should|can) (?:say|write|try)|instead(?: of [^.!?\n:]{1,80}?)?,? (?:say|write|try)|consider (?:saying|writing|something like|opening with)`,
      String.raw`(?<=(?:^|[.!?\n])[^\S\n]*)(?:say|write)`,
    ].join("|") +
    String.raw`)${CUE_END}:[*_]{0,3}[^\S\n]*`,
  "giu"
);

/** Cues that hand over a line without a colon ("Rewrite it as ..."). */
const STRONG_CUE =
  /(?<![\p{L}\p{N}])(?:try (?:saying|writing|something like)|consider (?:saying|writing)|(?:rewrite|rephrase|reword) (?:it |this |the line |that )?(?:as|to)|instead(?: of [^.!?\n:]{1,80}?)?,? (?:say|write)|(?:you|we) (?:could|might|should|can) (?:say|write))[^\S\n]+(?=[^\s:])/giu;
/** A question after "Try:" or "Open with:" is a line, unless it is put to the writer. */
const WRITER_QUESTION = /^(?:what if|how about|why not|could you|would it|should you|can you|do you|is there|does)\b/i;

/** "e.g." / "for example," without a colon: only a line-like clause counts. */
const EXAMPLE_CUE = /(?<![\p{L}\p{N}])(?:e\.? ?g\.,?|e\.g,?|eg,|for (?:example|instance),?)[^\S\n]+(?=[^\s:])/giu;

/** A quoted span right after one of these is a supplied line at any length. */
const QUOTE_CUE_BEFORE = new RegExp(
  String.raw`(?:^|[^\p{L}\p{N}])(?:` +
    [
      String.raw`try(?: (?:saying|writing|something like|opening with|starting with|ending with|leading with))?`,
      String.raw`e\.? ?g\.?|eg|for (?:example|instance)|such as`,
      String.raw`something(?: \p{L}+)? like|(?:a |an |the )?(?:line|sentence|opener|phrase) (?:like|such as)`,
      String.raw`(?:open|start|end|close|lead|finish)(?:ing|s)?(?: (?:the video|the script|the piece|the section|it|this|things))? (?:with|on)`,
      String.raw`(?:better|stronger|punchier|tighter|cleaner|sharper|simpler|clearer|alternative|revised|suggested)(?: (?:first|opening|closing|final|last))? ${LINE_NOUN}(?: (?:would be|could be|might be|is|like|such as))?`,
      String.raw`(?:rewrite|rephrase|reword)${OBJECT} (?:as|to)|(?:change|turn)${OBJECT} (?:to|into)|replace${OBJECT} with|make it`,
      String.raw`(?:swap|replace|change|switch|trade|substitute)[^.!?\n]{0,80}?[^\p{L}\p{N}](?:for|with|to|into)`,
      String.raw`(?:you|we) (?:could|might|should|can) (?:say|write|try|use)|(?:instead|just|simply),? (?:say|write|try|use)|instead of [^.!?\n]{1,80}?,`,
    ].join("|") +
    String.raw`)${CUE_END}[:,—–-]?${CUE_END}$`,
  "iu"
);

const QUOTE_CUE_AFTER =
  /^[^\S\n]*(?:instead\b(?! of)|(?:would|could|might) (?:work|land|read|hit|play|sound) (?:better|harder|stronger|cleaner)|(?:works|lands|reads|hits|plays|sounds) (?:better|harder|stronger|cleaner))/iu;

/** Words that make a clause a diagnosis of the script rather than a line for it. */
const META =
  /(?<![\p{L}\p{N}])(?:script|draft|version|section|paragraph|sentence|line|act|scene|beat|hook|intro|outro|opening|ending|transition|segment|viewer|audience|reader|writer|narrat\p{L}*|voice-?over|stakes|reveal|payoff|pacing|tone|claim|stat|statistic|source|example|cta|b-?roll|cue|jargon|term|title|thumbnail|explanation|introduced|explained|defined|mentioned|repeated|unclear|review|feedback|scored|lens|evaluation|critique|rubric|cold open)s?(?![\p{L}\p{N}])/iu;
/** The model's own labelled aside: "**Key tension:** …", "[!tip] …", "Note: …". */
const LABELLED =
  /^[^\p{L}\p{N}*[]*(?:\[![^\]]*\]|\*\*[^*\n]{1,40}(?::\*\*|\*\*:)|(?:note|nb|ps|aside|update|context|caveat|disclaimer|summary|verdict|tl;?dr|(?:key|unresolved|prior|previous) [\p{L} ]{1,30})\s*:)/iu;
const WH_START = /^(?:which|what|who|whom|whose|where|when|why|how|whether|if)\b/i;
/** Tells the writer what the draft does: "you mention X but never explain it", "we never learn ...". */
const DIAGNOSIS =
  /^(?:(?:but|and|so|here|also|then|still|again),?\s+)?(?:(?:you|we)(?:['’](?:re|ve))?|the (?:video|piece|episode|essay|text))\s+(?:(?:never|don['’]t|do not|doesn['’]t|does not|didn['’]t|only|also|briefly|barely|first|then|later|still|just|already|again|repeatedly|quickly|immediately|suddenly|abruptly|clearly|explicitly|rarely|often|keep)\s+)*(?:(?:mention|explain|introduce|describe|cite|claim|reference|define|address|skip|repeat|cover|jump|switch|shift|rush|tease|hint|frame|list|state|establish|promise|answer|lean|assume|pivot|segue|summari[sz]e|recap|learn|hear|meet)(?:s|es|d|ed|ing)?|clarif(?:y|ies|ied)|bur(?:y|ies|ied)|impl(?:y|ies|ied)|rel(?:y|ies|ied)|skipped|spen[dt]s?|sets? up|finds? out|(?:say|tell|show|give|name|ask)s?(?=\s+(?:who|what|why|how|where|when|whether|if|us|anything|enough|more|much)\b))(?![\p{L}])/iu;
/** "Rewrite it to <verb> ...": the purpose of the rewrite, not the new line. */
const TO_VERB =
  /^(?:be|sound|feel|read|flow|avoid|match|fit|include|reflect|emphasi[sz]e|highlight|address|simplify|reduce|lean|get|stay|work|follow|connect|earn|hit|take|carry|mirror|echo|create|build|raise|lower|lose|signal|sharpen|vary|eliminate|ditch|kill|remove|cut|make|put|keep|drop|use|show|explain|answer|clarify|tighten|shorten|land|lead|start|open|end|close|move|set|give|let|bring|add|name|ask|state|cite|mention|introduce|define|frame|pay|hold|spend|split|merge|replace|swap|reorder|trim|expand|delay|establish|reveal|return|break|combine|flip|pull|push|slow|speed|fix|rework|restructure|cover|run|fill|front-load|focus|centre|center)\b/i;
/** Imperatives a narrator says to the viewer ("Let that sink in", "Ask yourself ..."). */
const NARRATION_IMPERATIVE = /^(?:let|ask|keep|hold)\b|\byoursel(?:f|ves)\b/i;
/** "Try saying it out loud": how to deliver the writer's text, not a new line. */
const DELIVERY =
  /^(?:it|this|that|these|those|them|(?:the|each|every) [\p{L}-]+)\s+(?:out loud|aloud|slowly|slower|faster|again|twice|to yourself|in your own voice|with)(?![\p{L}])/iu;
const EDIT_START =
  /^(?:(?:then|and|also|just|maybe|perhaps|or)\s+)?(?:open|start|end|clos|lead|cut|mov|trim|add|remov|drop|swap|reorder|split|merg|tighten|shorten|expand|consider|nam|show|explain|ask|mak|giv|put|use|using|keep|introduc|delay|establish|set|pay|land|fram|focus|sav|hold|answer|stat|mention|clarif|defin|cit|fix|rework|restructur|front-load|replac|reveal|spend|bring|let|return|break|combin|flip|pull|push|slow|speed|try|highlight|emphasi[sz]|simplif|includ|avoid|ensur|specif|strengthen|reinforc|preview|ground|connect|link|tie|balanc|address|acknowledg|referenc|illustrat|quantif|provid|offer|describ|develop|explor|vary|weav|revisit|resolv|justif|sourc|check|verif|condens|compress|streamlin|sharpen)\p{L}*/iu;
const DET_START = /^(?:the|a|an|one|two|three|this|that|these|those|your|their|her|his|its|our)\s/i;
const DESCRIBE_START = /^(?:about|toward|towards|around|more|less|fewer|exactly|explicitly|clearly|directly|something about)\b/i;
const COMMENTARY_START =
  /^(?:(?:and|but|so|then)\s+)?(?:this|that|it|which|these|those|doing so)\s+(?:would|could|should|might|will|makes?|gives?|sets?|lands?|works?|helps?|feels?|reads?|is|keeps?|puts?|lets?|turns?|earns?)\b/i;
/** Pronouns and auxiliaries: a clause with one of these reads as a sentence, not a list of things. */
const SENTENCE_WORD =
  /(?<![\p{L}\p{N}'’])(?:is|are|was|were|be|been|has|have|had|will|would|can|could|should|do|does|did|never|nobody|everyone|everybody|someone|somebody|nothing|everything|you|we|i|they|he|she|it|there|them|us|me)(?:['’](?:s|re|ve|ll|d|m))?(?![\p{L}\p{N}'’])|\p{L}n['’]t(?!\p{L})/iu;
/** Starts the way a line does: a capital, a quote, emphasis or a cue bracket. */
const LINE_START = /^[\p{Lu}“"‘'`*_[]/u;
const QUOTED = /[“"`]([^"“”`\n]+)[”"`]|‘((?:[^‘’\n]|’(?=\p{L}))+)’/gu;

// --- Passes ------------------------------------------------------------------

interface Ctx {
  writer: Writer;
  partial: boolean;
  tripped: boolean;
}

function previousLine(lines: string[]): string {
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].trim()) return lines[i];
  return "";
}

/** Fenced code blocks: a supplied snippet is removed whole. */
function stripFences(text: string, ctx: Ctx): string {
  return text.replace(
    /^([^\S\n]*)(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n[^\S\n]*\2[^\S\n]*$/gm,
    (whole: string, indent: string, _fence: string, inner: string, at: number, src: string) => {
      const cued = /:[*_]*\s*$/.test(src.slice(0, at).trimEnd());
      if (wordCount(inner) < (cued ? 1 : MIN_QUOTED_WORDS) || isWriters(inner, ctx.writer)) return whole;
      ctx.tripped = true;
      return indent + CUT;
    }
  );
}

/** A callout or bold title that announces a replacement line ("[!example] **Suggested Rewrite**"). */
const REWRITE_HEADER =
  /^(?:\[![^\]\n]*\])?[^\p{L}\n]*(?:[\p{L}'’-]+ ){0,3}(?:(?:rewrite|rephrased?|reworded)(?! (?:the|this|that|these|those|it|your|a|an|each|every|all)\b)|suggested (?:lines?|wording|phrasing|rewrite|version|opener|opening|hook|text|copy|cta)|alternative (?:lines?|version|phrasing|opener|opening|wording)|(?:better|stronger|punchier|tighter|new) (?:lines?|opener|opening|hook|version|close|ending|cta))(?: (?:for|of|in|on|at) [^\n]{1,40}?)?[^\p{L}\n]*$/iu;

/** Blockquote lines read as a quoted line: a supplied block is removed whole. */
function stripBlockquotes(text: string, ctx: Ctx): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; ) {
    const quote = lines[i].match(/^([^\S\n]*)>/);
    if (!quote) {
      out.push(lines[i++]);
      continue;
    }
    let j = i;
    while (j < lines.length && /^[^\S\n]*>/.test(lines[j])) j++;
    const content = lines
      .slice(i, j)
      .map((l) => l.replace(/^[^\S\n]*(?:>[^\S\n]?)+/, ""))
      .join("\n");
    const open = ctx.partial && j === lines.length;
    const [first, ...body] = content.split("\n");
    if (body.length && REWRITE_HEADER.test(first)) {
      // "> [!example] Suggested rewrite" over the line itself: the header stays, the line goes.
      const rest = body.join("\n");
      if (wordCount(rest) && !(open ? isWritersSoFar(rest, ctx.writer) : isWriters(rest, ctx.writer))) {
        out.push(lines[i], `${quote[1]}> ${CUT}`);
        ctx.tripped = true;
      } else {
        out.push(...lines.slice(i, j));
      }
      i = j;
      continue;
    }
    const cued = /:[*_]*\s*$/.test(previousLine(out));
    const floor = open || cued ? 1 : MIN_QUOTED_WORDS;
    const writers = open ? isWritersSoFar(content, ctx.writer) : isWriters(content, ctx.writer);
    // An uncued callout, labelled aside or block about the script is the model's own commentary.
    const commentary = !cued && (LABELLED.test(content) || META.test(content));
    if (wordCount(content) >= floor && !writers && !commentary) {
      out.push(quote[1] + CUT);
      ctx.tripped = true;
    } else {
      out.push(...lines.slice(i, j));
    }
    i = j;
  }
  return out.join("\n");
}

interface SpanPattern {
  /** The last capture group is the quoted text. */
  re: RegExp;
  /**
   * Emphasis: only a span that starts like a line and doesn't talk about the
   * script counts ("Open with *the reveal*" is emphasis, not a line).
   */
  lineOnly?: boolean;
  /** Bold: a line only right after a cue; otherwise the model's own label or stress. */
  cueOnly?: boolean;
}

function spanPatterns(partial: boolean): SpanPattern[] {
  // In a partial, a single quote at the very end may be an apostrophe still being written.
  const closeSingle = partial ? String.raw`(?=[^\p{L}\p{N}])` : String.raw`(?![\p{L}\p{N}])`;
  return [
    { re: /(?:“|(?<![\p{L}\p{N}"])")((?:[^"“”\n]|\n(?![^\S\n]*\n)){1,600})(?:”|"(?![\p{L}\p{N}]))/gu },
    { re: new RegExp(String.raw`‘(?!\d)((?:[^‘’\n]|’(?=\p{L})){1,600})’` + closeSingle, "gu") },
    {
      re: new RegExp(
        String.raw`(?<=^|[\s(\[{:—–\-/*_>])'(?![\s\d]|(?:em|cause|til|n|bout|round|cept|twas)(?!\p{L}))((?:[^'\n]|'(?=\p{L})){1,600})'` +
          closeSingle,
        "giu"
      ),
    },
    { re: /(?<!`)`([^`\n]{1,600})`(?!`)/g },
    { re: /(?<![*_\p{L}\p{N}\\])([*_])(?![*_\s])([^*_\n]{1,600}?)(?<![\s\\])\1(?![*_\p{L}\p{N}])/gu, lineOnly: true },
    { re: /(?<![*_\p{L}\p{N}\\])(\*{2,3}|_{2,3})(?![*_\s])([^*_\n]{1,600}?)(?<![\s\\])\1(?![*_\p{L}\p{N}])/gu, lineOnly: true, cueOnly: true },
    { re: /\[(\p{Lu}[\p{Lu}\p{N} &/'’-]{1,30}:[^\]\n]{1,600})\]/gu },
  ];
}

const STRUCTURE_CUE = /(?:open|start|end|close|lead|finish)(?:ing|s)?(?: [\p{L}-]+)? (?:with|on)[^\S\n]*[:,—–-]?[^\S\n]*$/iu;

/**
 * Emphasis after a cue that stresses a part of the script or a move rather
 * than handing over a line: "Open with *the reveal*", "Try *cutting it*".
 */
function isStress(inner: string, before: string): boolean {
  if (META.test(inner)) return true;
  if (LINE_START.test(inner)) return false;
  return STRUCTURE_CUE.test(before) || EDIT_START.test(inner) || (DET_START.test(inner) && wordCount(inner) <= 3);
}

/** Quoted spans the writer didn't write: 4+ words, or any length after a cue. */
function stripSpans(text: string, ctx: Ctx): string {
  let out = text;
  // Twice, so a quote wrapped around a stripped quote is judged on its own.
  for (let pass = 0; pass < 2; pass++) {
    for (const { re, lineOnly, cueOnly } of spanPatterns(ctx.partial)) {
      // End of the last cued span: 'change "A" to "B" or "C"' cues "C" too.
      let cuedEnd = -1;
      out = out.replace(re, (...args: unknown[]) => {
        const whole = args[0] as string;
        const inner = args[args.length - 3] as string;
        const at = args[args.length - 2] as number;
        const src = args[args.length - 1] as string;
        const words = wordCount(inner);
        if (words === 0) return whole;
        const lineStart = src.lastIndexOf("\n", at - 1) + 1;
        const before = src.slice(Math.max(lineStart, at - 160), at);
        const after = src.slice(at + whole.length, at + whole.length + 60);
        const cued =
          QUOTE_CUE_BEFORE.test(before) ||
          QUOTE_CUE_AFTER.test(after) ||
          (cuedEnd >= lineStart && /^[\s,]*(?:or|and|,)?[^\S\n]*$/.test(src.slice(cuedEnd, at)));
        if (cued) cuedEnd = at + whole.length;
        if (cueOnly && !cued) return whole;
        if (lineOnly && !inner.startsWith("[")) {
          const stress = cued ? isStress(inner, before) : !LINE_START.test(inner) || META.test(inner) || LABELLED.test(inner);
          if (stress) return whole;
        }
        if (words < (cued ? 1 : MIN_QUOTED_WORDS) || isWriters(inner, ctx.writer)) return whole;
        ctx.tripped = true;
        return CUT;
      });
    }
  }
  return out;
}

/** Does the span open with two of the writer's words in a row? */
function startsWithWriters(span: string, writer: Writer): boolean {
  const two = toWords(matchKey(span)).split(" ").slice(0, 2).join(" ");
  return two.includes(" ") && (writer.words.includes(` ${two} `) || writer.spoken.includes(` ${two} `));
}

/**
 * A double quote that never closes in its paragraph ('Open with "Imagine a
 * world where ...'): the rest of the paragraph is the quoted text. After a cue
 * any length counts. Uncued, a missing closer may just end a quote of the
 * writer ('The word "alone is ...'), so only a line-like run of 4+ words that
 * doesn't open with the writer's words counts. In a partial, the last
 * paragraph is still growing and is left to hideOpenTail.
 */
function stripDanglingQuotes(text: string, ctx: Ctx): string {
  const parts = text.split(/(\n[^\S\n]*\n)/);
  for (let p = 0; p < parts.length; p += 2) {
    if (ctx.partial && p === parts.length - 1) continue;
    const para = parts[p];
    let open = -1;
    for (let i = 0; i < para.length; i++) {
      const c = para[i];
      if (c === "“") open = open < 0 ? i : open;
      else if (c === "”") open = -1;
      else if (c === '"') open = open >= 0 ? -1 : LETTER_OR_DIGIT.test(para[i - 1] ?? "") ? -1 : i;
    }
    if (open < 0) continue;
    const before = para.slice(Math.max(para.lastIndexOf("\n", open - 1) + 1, open - 160), open);
    const inner = para.slice(open + 1);
    if (!wordCount(inner) || isWriters(inner, ctx.writer)) continue;
    const lineLike =
      LINE_START.test(inner) && wordCount(inner) >= MIN_QUOTED_WORDS && !startsWithWriters(inner, ctx.writer);
    if (!QUOTE_CUE_BEFORE.test(before) && !lineLike) continue;
    parts[p] = para.slice(0, open) + CUT;
    ctx.tripped = true;
  }
  return parts.join("");
}

type CueKind = "replace" | "example" | "label";

interface ClauseEnd {
  end: number;
  by: "punctuation" | "line" | "paren" | "end";
}

/** Where the sentence starting at `from` ends (the terminator is included). */
function sentenceEnd(text: string, from: number, inParen: boolean): ClauseEnd {
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === "\n") return { end: i, by: "line" };
    if (inParen && c === ")") return { end: i, by: "paren" };
    if (".!?…".includes(c)) {
      let j = i + 1;
      while (j < text.length && (text[j] === "*" || text[j] === "_")) j++;
      if (j >= text.length || /\s/.test(text[j])) return { end: j, by: "punctuation" };
    }
  }
  return { end: text.length, by: "end" };
}

/** "RLHF, ImageNet and Mechanical Turk": short items and no sentence in sight. */
function isListOfThings(clause: string): boolean {
  const items = clause
    .replace(/[.!?…]+$/, "")
    .split(/[,;]|\s(?:and|or|vs\.?|&)\s/i)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length >= 2 && items.every((item) => wordCount(item) <= 4) && !SENTENCE_WORD.test(clause);
}

function quotesTheWriter(clause: string, writer: Writer): boolean {
  for (const m of clause.matchAll(QUOTED)) {
    const quoted = m[1] ?? m[2];
    if (wordCount(quoted) >= 2 && isWriters(quoted, writer)) return true;
  }
  return false;
}

interface ClauseContext {
  kind: CueKind;
  colon: boolean;
  /** The cue opens its sentence ("For example, ..."). */
  sentenceStart: boolean;
  /** The cue sits inside parentheses ("(e.g. tracing, retries)"). */
  inParen?: boolean;
  /** Partial text that ends inside this clause. */
  open: boolean;
  /** The cue itself ("Rewrite it to"). */
  cue?: string;
}

/** Is the clause after a cue a line for the script (rather than a diagnosis)? */
function isSuppliedClause(raw: string, c: ClauseContext, writer: Writer): boolean {
  const clause = raw.replace(/^[\s*_]+/, "").trim();
  const words = wordCount(clause);
  if (!words || clause.startsWith(CUT)) return false;
  const meta = META.test(clause);
  const lineLike = LINE_START.test(clause);
  const question = clause.endsWith("?") || WH_START.test(clause);
  // A capitalised question after "Try:" is the line itself ("Try: Who built it?").
  const askedLine = question && c.kind === "replace" && c.colon && lineLike && !meta && !WRITER_QUESTION.test(clause);
  if ((question && !askedLine) || quotesTheWriter(clause, writer)) return false;
  // A list can turn into a sentence as it streams ("Let that sink in, because ..."), so only a settled one counts.
  if ((!c.open && isListOfThings(clause)) || DIAGNOSIS.test(clause)) return false;
  // "Rewrite it to be shorter", "Try saying it out loud": the purpose, not a line.
  if (c.cue && /\bto$/i.test(c.cue) && !c.colon && (TO_VERB.test(clause) || EDIT_START.test(clause))) return false;
  if (c.cue && /(?:saying|reading|writing)$/i.test(c.cue) && DELIVERY.test(clause)) return false;
  let floor = MIN_QUOTED_WORDS;
  if (c.kind !== "replace") {
    if (meta || !(lineLike || c.sentenceStart)) return false;
    // "Suggestion: Highlight the benefit" is advice to the writer; "Let that sink in" is a line.
    if (c.kind === "label" && EDIT_START.test(clause) && !NARRATION_IMPERATIVE.test(clause)) return false;
    // A parenthesised example is a list of things unless it ends like a sentence.
    if (c.inParen && !c.colon && !c.open && !/[.!?…]$/.test(clause)) return false;
    if (c.colon && lineLike) floor = 1;
  } else if (c.colon) {
    // "Open with: the moment she sees the dataset, then the stakes" describes a part of the script.
    if (meta && (EDIT_START.test(clause) || (DET_START.test(clause) && (words <= 6 || !lineLike)))) return false;
    if (lineLike) floor = 1;
  } else if (meta || DESCRIBE_START.test(clause)) {
    return false;
  }
  if (c.open) floor = 1;
  if (words < floor) return false;
  return !(c.open ? isWritersSoFar(clause, writer) : isWriters(clause, writer));
}

/** Does a following sentence carry on the supplied line? */
function continuesLine(raw: string, open: boolean, writer: Writer): boolean {
  const s = raw.trim();
  if (!wordCount(s) || s.startsWith(CUT) || s.endsWith("?") || WH_START.test(s)) return false;
  if (META.test(s) || COMMENTARY_START.test(s) || EDIT_START.test(s) || DIAGNOSIS.test(s) || quotesTheWriter(s, writer)) return false;
  return !(open ? isWritersSoFar(s, writer) : isWriters(s, writer));
}

/** The clause after each explicit cue, when it is a supplied line. */
function stripCueClauses(text: string, ctx: Ctx): string {
  const cuts: Array<[number, number]> = [];

  const consider = (cueStart: number, from: number, kind: CueKind, colon: boolean) => {
    const lineStart = text.lastIndexOf("\n", cueStart - 1) + 1;
    const beforeCue = text.slice(lineStart, cueStart).trimEnd();
    const sentenceStart = !beforeCue || /[.!?:]$/.test(beforeCue) || /^[\s>]*(?:(?:[-*+]|\d+[.)])(?:\s+(?:\*\*|__))?|\*\*|__)$/.test(beforeCue);
    const cue = text.slice(cueStart, from).replace(/[\s*_:]+$/, "");
    const inParen = (beforeCue.match(/\(/g)?.length ?? 0) > (beforeCue.match(/\)/g)?.length ?? 0);

    let start = from;
    while (start < text.length && /[^\S\n]/.test(text[start])) start++;

    if (colon && (start >= text.length || text[start] === "\n")) {
      // "Open with:" and the lines on the following lines (list items or text).
      let at = start;
      while (at < text.length && /\s/.test(text[at])) at++;
      for (let n = 0; n < 5 && at < text.length; n++) {
        const eol = text.indexOf("\n", at) === -1 ? text.length : text.indexOf("\n", at);
        const line = text.slice(at, eol);
        if (!line.trim() || /^[^\S\n]*(?:>|#)/.test(line)) break;
        const marker = line.match(/^[^\S\n]*(?:(?:[-*+]|\d+[.)])[^\S\n]+)?/)?.[0].length ?? 0;
        const open = ctx.partial && eol === text.length;
        if (isSuppliedClause(line.slice(marker), { kind, colon, sentenceStart: true, open, cue }, ctx.writer)) {
          cuts.push([at + marker, eol]);
        }
        at = eol + 1;
      }
      return;
    }

    const first = sentenceEnd(text, start, inParen);
    const open = ctx.partial && first.by === "end";
    if (!isSuppliedClause(text.slice(start, first.end), { kind, colon, sentenceStart, inParen, open, cue }, ctx.writer)) return;

    let end = first.end;
    if (kind === "replace" && first.by === "punctuation") {
      for (let n = 0; n < 3; n++) {
        let next = end;
        while (next < text.length && /[^\S\n]/.test(text[next])) next++;
        if (next >= text.length || text[next] === "\n") break;
        const sentence = sentenceEnd(text, next, inParen);
        if (!continuesLine(text.slice(next, sentence.end), ctx.partial && sentence.by === "end", ctx.writer)) break;
        end = sentence.end;
        if (sentence.by !== "punctuation") break;
      }
    }
    cuts.push([start, end]);
  };

  for (const m of text.matchAll(COLON_CUE)) consider(m.index, m.index + m[0].length, m.groups?.example ? "example" : m.groups?.label ? "label" : "replace", true);
  for (const m of text.matchAll(STRONG_CUE)) consider(m.index, m.index + m[0].length, "replace", false);
  for (const m of text.matchAll(EXAMPLE_CUE)) consider(m.index, m.index + m[0].length, "example", false);
  if (cuts.length === 0) return text;

  cuts.sort((a, b) => a[0] - b[0]);
  let out = "";
  let pos = 0;
  for (const [s, e] of cuts) {
    if (e <= pos) continue;
    out += text.slice(pos, Math.max(s, pos)) + (s >= pos ? CUT : "");
    pos = e;
  }
  ctx.tripped = true;
  return out + text.slice(pos);
}

// --- Streamed partials: openings that haven't closed yet -----------------------

function isBlankLineAt(text: string, i: number): boolean {
  return text[i] === "\n" && /^\n[^\S\n]*\n/.test(text.slice(i, i + 40));
}

/** Index of an opening quote/emphasis whose closer hasn't been seen yet. */
function scanPairs(text: string, isOpener: (i: number) => boolean, isCloser: (i: number, open: number) => boolean): number {
  for (let i = 0; i < text.length; i++) {
    if (!isOpener(i)) continue;
    let closed = -1;
    for (let j = i + 1; j < text.length && !isBlankLineAt(text, j); j++) {
      if (isCloser(j, i)) {
        closed = j;
        break;
      }
    }
    if (closed === -1) return i;
    i = closed;
  }
  return -1;
}

/** The last emphasis run (*, **, ***) whose closer hasn't been seen yet. */
function openEmphasis(text: string): { at: number; run: string } | null {
  const opener = /(?<![*_\p{L}\p{N}\\])(\*{1,3}|_{1,3})(?![*_\s])/gu;
  for (let m = opener.exec(text); m; m = opener.exec(text)) {
    const run = m[1];
    const from = m.index + run.length;
    const blank = text.slice(from).search(/\n[^\S\n]*\n/);
    const stop = blank === -1 ? text.length : from + blank;
    const closer = new RegExp(String.raw`(?<=[^\s*_])${run.replace(/\*/g, "\\*")}(?![*_\p{L}\p{N}])`, "u");
    const close = text.slice(from, stop).search(closer);
    if (close === -1) {
      if (stop === text.length) return { at: m.index, run };
      opener.lastIndex = stop;
    } else {
      opener.lastIndex = from + close + run.length;
    }
  }
  return null;
}

function openTailStart(text: string): number {
  const starts: number[] = [];
  const letterAt = (i: number) => LETTER_OR_DIGIT.test(text[i] ?? "");

  const fences = [...text.matchAll(/^[^\S\n]*(?:`{3,}|~{3,})/gm)];
  if (fences.length % 2 === 1) starts.push(fences[fences.length - 1].index);

  let open = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (isBlankLineAt(text, i)) open = -1;
    else if (c === "“") open = open < 0 ? i : open;
    else if (c === "”") open = -1;
    else if (c === '"') open = open >= 0 ? -1 : letterAt(i - 1) ? -1 : i;
  }
  if (open >= 0) starts.push(open);

  // A closing single quote must be followed by something: at the very end it may be an apostrophe.
  const curly = scanPairs(
    text,
    (i) => text[i] === "‘" && !/\d/.test(text[i + 1] ?? ""),
    (j) => text[j] === "’" && j + 1 < text.length && !/\p{L}/u.test(text[j + 1])
  );
  if (curly >= 0) starts.push(curly);

  const straight = scanPairs(
    text,
    (i) =>
      text[i] === "'" &&
      (i === 0 || /[\s(\[{:—–\-/*_>]/.test(text[i - 1])) &&
      /[^\s\d]/.test(text[i + 1] ?? " ") &&
      !/^(?:em|cause|til|n|bout|round|cept|twas)(?!\p{L})/iu.test(text.slice(i + 1, i + 8)),
    (j) => text[j] === "'" && j + 1 < text.length && !letterAt(j + 1)
  );
  if (straight >= 0) starts.push(straight);

  const outsideFences = text.replace(/^[^\S\n]*(?:`{3,}|~{3,}).*$/gm, (line) => " ".repeat(line.length));
  const ticks = [...outsideFences.matchAll(/(?<!`)`(?!`)/g)];
  if (ticks.length % 2 === 1) starts.push(ticks[ticks.length - 1].index);

  const emphasis = openEmphasis(text);
  if (emphasis) {
    // Hidden when the final guard could strip it: a line-like italic, or emphasis right after a cue.
    const inner = text.slice(emphasis.at + emphasis.run.length);
    const before = text.slice(Math.max(text.lastIndexOf("\n", emphasis.at - 1) + 1, emphasis.at - 160), emphasis.at);
    const cued = QUOTE_CUE_BEFORE.test(before);
    const lineLike = LINE_START.test(inner) && !META.test(inner) && !LABELLED.test(inner);
    if (cued ? !isStress(inner, before) : emphasis.run.length === 1 && lineLike) starts.push(emphasis.at);
  }

  const bracket = text.search(/\[\p{Lu}[\p{Lu}\p{N} &/'’-]{1,30}:[^\]\n]*$/u);
  if (bracket >= 0) starts.push(bracket);

  return starts.length ? Math.min(...starts) : -1;
}

function hideOpenTail(text: string, ctx: Ctx): string {
  const start = openTailStart(text);
  if (start < 0) return text;
  const tail = text.slice(start).replace(/^(?:[`~]{3,}[^\n]*\n?|[*_]{1,3}|[“"‘'`[])/, "");
  if (!wordCount(tail) || isWritersSoFar(tail, ctx.writer)) return text;
  ctx.tripped = true;
  return text.slice(0, start) + CUT;
}

/** Put "…" where text was removed, tidying only the spaces around it. */
function closeCuts(text: string): string {
  return text
    .replace(/([*_]{1,3})\uE000\1(?![*_])/g, CUT)
    .replace(/\uE000(?:[^\S\n]*\uE000)+/g, CUT)
    .replace(/\uE000\.(?!\.)/g, CUT)
    .replace(/(?<=\S)[^\S\n]{2,}\uE000/g, ` ${CUT}`)
    .replace(/\uE000[^\S\n]{2,}(?=\S)/g, `${CUT} `)
    .replaceAll(CUT, "…")
    .trim();
}

/**
 * Remove wording the writer didn't write. `scriptKey` is matchKey(script),
 * computed once per request by the caller. Text with nothing to remove comes
 * back as it was (trimmed).
 */
export function stripSuppliedWording(text: string, scriptKey: string, options: GuardOptions = {}): GuardResult {
  const ctx: Ctx = { writer: writerFor(scriptKey), partial: !!options.partial, tripped: false };
  let out = text.replaceAll(CUT, "");
  out = stripFences(out, ctx);
  out = stripBlockquotes(out, ctx);
  out = stripSpans(out, ctx);
  out = stripDanglingQuotes(out, ctx);
  if (ctx.partial) out = hideOpenTail(out, ctx);
  out = stripCueClauses(out, ctx);
  return ctx.tripped ? { text: closeCuts(out), tripped: true } : { text: text.trim(), tripped: false };
}

/** True when what is left after stripping is too thin to be useful. */
export function isTooThin(text: string, minWords = 6): boolean {
  return wordCount(text.replace(/…/g, "")) < minWords;
}
