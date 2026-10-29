#!/usr/bin/env node
// Round-trips every stored script version through the editor's markdown
// pipeline and reports what saving it again would change.
//
//   markdown (DB) -> Tiptap parse -> ProseMirror doc -> Tiptap serialize
//                 -> cleanSerializedMarkdown -> compare with the DB text
//
// It uses the same extensions as src/components/editor/editor-content.ts
// (minus the highlight plugins, which add no markdown). Read-only: the DB is
// opened with node:sqlite in readOnly mode.
//
// It also lists the versions the editor would keep in markdown mode: those
// whose text saving through the WYSIWYG editor would change in substance
// (findRewrittenLine; front matter is set aside and kept as written, like
// the editor does).
//
// Usage:
//   node scripts/roundtrip-check.mjs [path/to/scripter.db] [--diffs=N] [--json=out.json]
//
// Exit code 1 when a callout line is lost, a backslash is added, or the
// cleanup breaks a document that Tiptap's own output preserved.

import { createRequire, register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

// Silence Node's experimental/typeless-module warnings for the .ts import and node:sqlite.
process.removeAllListeners("warning");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(ROOT, "package.json"));

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const dbPath = resolve(
  args.find((a) => !a.startsWith("--")) ?? process.env.SCRIPTER_DB_PATH ?? resolve(ROOT, "data", "scripter.db"),
);
const maxDiffs = Number(flag("diffs", "6"));
const jsonOut = flag("json", null);

const { DatabaseSync } = await import("node:sqlite");
const { cleanSerializedMarkdown, findRewrittenLine, splitFrontMatter } = await import(
  pathToFileURL(resolve(ROOT, "src/lib/markdown/serialize.ts")).href
);

const { getSchema } = require("@tiptap/core");
const StarterKit = require("@tiptap/starter-kit").default;
const { Markdown, MarkdownManager } = require("@tiptap/markdown");
const Placeholder = require("@tiptap/extension-placeholder").default;
const LinkExtension = require("@tiptap/extension-link").default;
const { Table } = require("@tiptap/extension-table");
const { TableRow } = require("@tiptap/extension-table-row");
const { TableCell } = require("@tiptap/extension-table-cell");
const { TableHeader } = require("@tiptap/extension-table-header");
const CodeBlockLowlight = require("@tiptap/extension-code-block-lowlight").default;
const { common, createLowlight } = require("lowlight");
// The editor's own extension files import with the app's `@/` alias; .ts files
// are ES modules (saying so keeps Node from warning about package.json).
register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, next) {
        const r = await next(s.startsWith("@/") ? ${JSON.stringify(pathToFileURL(resolve(ROOT, "src")).href)} + s.slice(1) + ".ts" : s, c);
        return r.url.endsWith(".ts") ? { ...r, format: "module-typescript" } : r;
      }`,
    ),
);
const { HtmlComment } = await import(
  pathToFileURL(resolve(ROOT, "src/components/editor/html-comment-extension.ts")).href
);
const tiptapVersion = JSON.parse(
  readFileSync(resolve(ROOT, "node_modules/@tiptap/markdown/package.json"), "utf8"),
).version;

// Keep in sync with editorExtensions() in src/components/editor/editor-content.ts.
const extensions = [
  StarterKit.configure({ codeBlock: false, link: false, underline: false }),
  Markdown,
  Placeholder.configure({ placeholder: "Write your script..." }),
  LinkExtension.configure({ openOnClick: false }),
  Table.configure({ resizable: false }),
  TableRow,
  TableCell,
  TableHeader,
  CodeBlockLowlight.configure({ lowlight: createLowlight(common) }),
  HtmlComment,
];

const schema = getSchema(extensions);
const manager = new MarkdownManager({ extensions });

const parse = (md) => schema.nodeFromJSON(manager.parse(md));
const serialize = (doc) => manager.serialize(doc.toJSON());
const docKey = (md) => JSON.stringify(parse(md).toJSON());
const save = (md) => cleanSerializedMarkdown(serialize(parse(md))); // what Tiptap writes back
// What the editor stores once the writer types (wysiwygRoundTrip in editor-content.ts).
const editorSave = (md) => {
  const { frontMatter, body } = splitFrontMatter(md);
  return body.trim() ? frontMatter + save(body) : md;
};

const countOf = (s, re) => (s.match(re) || []).length;
const BACKSLASH = /\\/g;
const CALLOUT = /^>\s*\[![\w-]+\]/;
const ESCAPED_CALLOUT = /^>\s*\\\[!/;
// Whitespace-only: same lines once trailing spaces, blank lines and the
// `&nbsp;` lines Tiptap writes for empty paragraphs are ignored.
const normWs = (s) =>
  s
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .filter((l) => l.trim() !== "" && l.trim() !== "&nbsp;")
    .join("\n");

/** Minimal line diff (LCS). Returns "- Ln: old" / "+ Ln: new" entries, at most `limit`. */
function lineDiff(a, b, limit = 12) {
  const al = a.split("\n");
  const bl = b.split("\n");
  const m = al.length;
  const n = bl.length;
  const lcs = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i][j] = al[i] === bl[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while ((i < m || j < n) && out.length < limit) {
    if (i < m && j < n && al[i] === bl[j]) {
      i++;
      j++;
    } else if (i < m && (j >= n || lcs[i + 1][j] >= lcs[i][j + 1])) {
      out.push(`  - L${i + 1}: ${JSON.stringify(al[i])}`);
      i++;
    } else {
      out.push(`  + L${j + 1}: ${JSON.stringify(bl[j])}`);
      j++;
    }
  }
  return out;
}

const db = new DatabaseSync(dbPath, { readOnly: true });
const versions = db.prepare("SELECT id, script_id, content FROM script_versions ORDER BY id").all();

const results = [];
for (const v of versions) {
  const original = v.content ?? "";
  const r = { id: v.id, scriptId: v.script_id };
  try {
    const raw = serialize(parse(original));
    const cleaned = cleanSerializedMarkdown(raw);
    r.identical = cleaned === original;
    r.whitespaceOnly = !r.identical && normWs(cleaned) === normWs(original);
    r.rawIdentical = raw === original;
    r.backslashesRaw = countOf(raw, BACKSLASH) - countOf(original, BACKSLASH);
    r.backslashesAdded = countOf(cleaned, BACKSLASH) - countOf(original, BACKSLASH);
    const origLines = original.split("\n");
    const cleanLines = cleaned.split("\n");
    r.calloutsOrig = origLines.filter((l) => CALLOUT.test(l)).length;
    r.calloutsKept = cleanLines.filter((l) => CALLOUT.test(l)).length;
    r.calloutsEscaped = cleanLines.filter((l) => ESCAPED_CALLOUT.test(l)).length;
    r.calloutLinesIdentical = origLines.filter((l) => CALLOUT.test(l)).join("\n") ===
      cleanLines.filter((l) => CALLOUT.test(l)).join("\n");
    r.sameDocAsTiptap = docKey(cleaned) === docKey(raw);
    r.sameDocAsOriginal = docKey(cleaned) === docKey(original);
    r.tiptapKeepsDoc = docKey(raw) === docKey(original);
    r.stable = save(cleaned) === cleaned;
    r.rewrite = findRewrittenLine(original, editorSave(original));
    if (!r.identical) r.diff = lineDiff(original, cleaned);
    if (raw !== cleaned) r.fixed = lineDiff(raw, cleaned, 4);
  } catch (e) {
    r.error = String(e?.stack ?? e).slice(0, 400);
  }
  results.push(r);
}

// Stored anchors (quoted script text) that were found in a version before a
// save should still be found after it.
const savedById = new Map();
for (const v of versions) {
  try {
    savedById.set(v.id, cleanSerializedMarkdown(serialize(parse(v.content ?? ""))));
  } catch {
    /* reported above */
  }
}
const contentById = new Map(versions.map((v) => [v.id, v.content ?? ""]));
const anchorStats = {};
for (const [table, col] of [
  ["suggestions", "original_text"],
  ["fact_issues", "claim_text"],
  ["notes", "anchor_text"],
]) {
  let rows;
  try {
    rows = db.prepare(`SELECT version_id AS v, ${col} AS t FROM ${table} WHERE ${col} IS NOT NULL`).all();
  } catch {
    continue; // table not in this DB
  }
  const s = { total: rows.length, foundBefore: 0, foundAfter: 0, lost: 0 };
  for (const r of rows) {
    const before = (contentById.get(r.v) ?? "").includes(r.t);
    const after = (savedById.get(r.v) ?? "").includes(r.t);
    if (before) s.foundBefore++;
    if (after) s.foundAfter++;
    if (before && !after) s.lost++;
  }
  anchorStats[table] = s;
}

const sum = (k) => results.reduce((s, r) => s + (r[k] || 0), 0);
const n = (pred) => results.filter(pred).length;
const summary = {
  tiptapMarkdown: tiptapVersion,
  db: dbPath,
  versions: results.length,
  errors: n((r) => r.error),
  byteIdentical: n((r) => r.identical),
  whitespaceOnly: n((r) => r.whitespaceOnly),
  otherDifferences: n((r) => !r.error && !r.identical && !r.whitespaceOnly),
  otherDifferencesSameDocument: n((r) => !r.error && !r.identical && !r.whitespaceOnly && r.sameDocAsOriginal),
  byteIdenticalWithoutCleanup: n((r) => r.rawIdentical),
  backslashesAddedWithoutCleanup: sum("backslashesRaw"),
  backslashesAdded: results.reduce((s, r) => s + Math.max(0, r.backslashesAdded || 0), 0),
  versionsWithAddedBackslashes: n((r) => r.backslashesAdded > 0),
  calloutLines: { original: sum("calloutsOrig"), kept: sum("calloutsKept"), escaped: sum("calloutsEscaped") },
  versionsWithCalloutsIntact: `${n((r) => r.calloutsOrig > 0 && r.calloutLinesIdentical)}/${n((r) => r.calloutsOrig > 0)}`,
  cleanupChangedParse: n((r) => r.sameDocAsTiptap === false),
  cleanupBrokeDocument: n((r) => r.tiptapKeepsDoc && !r.sameDocAsOriginal),
  docDiffersFromOriginalParse: results.filter((r) => r.sameDocAsOriginal === false).map((r) => r.id),
  unstableAfterSecondSave: results.filter((r) => r.stable === false).map((r) => r.id),
  keptInMarkdownMode: results.filter((r) => r.rewrite).map((r) => ({ id: r.id, ...r.rewrite })),
  anchors: anchorStats,
};

console.log(JSON.stringify(summary, null, 2));

console.log("\n== What the cleanup removes (Tiptap output -> saved) ==");
for (const r of results.filter((x) => x.fixed).slice(0, maxDiffs)) {
  console.log(`version ${r.id}`);
  for (const line of r.fixed) console.log(line);
}

console.log("\n== Remaining differences (stored text -> saved) ==");
const rank = (r) => (!r.sameDocAsOriginal ? 0 : !r.whitespaceOnly ? 1 : 2);
const shown = results
  .filter((r) => r.diff && r.diff.length)
  .sort((a, b) => rank(a) - rank(b) || a.id - b.id)
  .slice(0, maxDiffs);
for (const r of shown) {
  const tag = r.whitespaceOnly ? "whitespace only" : r.sameDocAsOriginal ? "same document" : "document differs";
  console.log(`\nversion ${r.id} (script ${r.scriptId}) — ${tag}, backslashes ${r.backslashesAdded >= 0 ? "+" : ""}${r.backslashesAdded}`);
  for (const line of r.diff) console.log(line);
}
for (const r of results.filter((x) => x.error)) console.log(`\nversion ${r.id} ERROR ${r.error}`);

if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ summary, results }, null, 1));

const failed =
  summary.errors > 0 ||
  summary.backslashesAdded > 0 ||
  summary.calloutLines.kept !== summary.calloutLines.original ||
  summary.calloutLines.escaped > 0 ||
  summary.cleanupBrokeDocument > 0;
process.exit(failed ? 1 : 0);
