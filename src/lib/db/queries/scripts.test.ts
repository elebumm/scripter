import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Real migrations on a temp DB; the persona/template seed is owned elsewhere.
vi.mock("@/lib/db/migrate", async () => {
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { getDb } = await import("@/lib/db/index");
  const nodePath = await import("path");
  return {
    runMigrations: () => migrate(getDb(), { migrationsFolder: nodePath.join(process.cwd(), "drizzle") }),
    seedDefaults: () => {},
  };
});

import { closeDb, getSqlite } from "@/lib/db/index";
import { ensureDb } from "@/lib/db/init";
import {
  buildScriptExport,
  createScript,
  createScriptFromTemplate,
  deleteScript,
  displayTitle,
  firstHeading,
  getScriptDetail,
  getScriptVersions,
  listScriptSummaries,
  planVersionSave,
  saveVersion,
  slugify,
  updateScript,
  writeScriptExport,
} from "./scripts";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "scripter-scripts-test-"));

beforeAll(() => {
  process.env.SCRIPTER_DB_PATH = path.join(tmp, "data", "scripter.db");
  process.env.SCRIPTER_BACKUP_DIR = path.join(tmp, "backups");
  ensureDb();
});

afterAll(() => {
  closeDb();
  delete process.env.SCRIPTER_DB_PATH;
  delete process.env.SCRIPTER_BACKUP_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

function countWhere(table: string, scriptId: number): number {
  return (getSqlite().prepare(`SELECT count(*) AS n FROM "${table}" WHERE script_id = ?`).get(scriptId) as { n: number }).n;
}

describe("planVersionSave", () => {
  it("creates v1 when there is no version", () => {
    expect(planVersionSave(null, "Hello", null)).toEqual({ create: true, version: 1, clearDraft: false });
  });

  it("dedupes on an exact match", () => {
    expect(planVersionSave({ version: 4, content: "Hello" }, "Hello", null)).toEqual({ create: false, version: 4, clearDraft: false });
  });

  it("treats any byte difference as a new version (no normalisation)", () => {
    expect(planVersionSave({ version: 4, content: "Hello" }, "Hello ", null).create).toBe(true);
    expect(planVersionSave({ version: 4, content: "Hello" }, "Hello\r\n", null).version).toBe(5);
  });

  it("clears the draft only when it equals the saved content", () => {
    expect(planVersionSave({ version: 1, content: "a" }, "b", "b").clearDraft).toBe(true);
    expect(planVersionSave({ version: 1, content: "a" }, "b", "c").clearDraft).toBe(false);
    expect(planVersionSave({ version: 1, content: "a" }, "a", "a").clearDraft).toBe(true);
  });
});

describe("scripts and versions", () => {
  it("creates an empty script without a version row", () => {
    const script = createScript("", "", { context: "Brief" });
    expect(script.title).toBe("");
    expect(script.currentVersion).toBe(0);
    expect(getScriptVersions(script.id)).toHaveLength(0);
    expect(getScriptDetail(script.id)).toMatchObject({ latestVersion: null, content: "" });
    expect(getScriptDetail(script.id)?.script).not.toHaveProperty("draftContent");
  });

  it("creates version 1 when content is given, counting spoken words", () => {
    const script = createScript("Given", "# Heading\n\nFour spoken words here. [PAUSE]");
    const versions = getScriptVersions(script.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, wordCount: 4 });
    expect(script.currentVersion).toBe(1);
  });

  it("recounts version words on read, so counts stored under older rules are not shown", () => {
    const script = createScript("Blank lines", "Hello there.\n\n&nbsp;\n\n&nbsp;\n\nGoodbye now.");
    expect(getScriptVersions(script.id)[0].wordCount).toBe(4);
    getSqlite().prepare("UPDATE script_versions SET word_count = 99 WHERE script_id = ?").run(script.id);
    expect(getScriptVersions(script.id)[0].wordCount).toBe(4);
    // Saving the same text again returns that version, recounted too.
    const again = saveVersion(script.id, "Hello there.\n\n&nbsp;\n\n&nbsp;\n\nGoodbye now.")!;
    expect(again).toMatchObject({ created: false, version: { wordCount: 4 } });
  });

  it("saves immutable versions and never duplicates identical content", () => {
    const { id } = createScript("Versions");
    const v1 = saveVersion(id, "First draft.")!;
    expect(v1).toMatchObject({ created: true, version: { version: 1, content: "First draft." } });

    const again = saveVersion(id, "First draft.")!;
    expect(again.created).toBe(false);
    expect(again.version.id).toBe(v1.version.id);

    const v2 = saveVersion(id, "Second draft.")!;
    expect(v2).toMatchObject({ created: true, version: { version: 2 } });
    expect(getScriptVersions(id).map((v) => [v.version, v.content])).toEqual([
      [2, "Second draft."],
      [1, "First draft."],
    ]);
    expect(getScriptDetail(id)?.script.currentVersion).toBe(2);
  });

  it("autosaves into the draft, not the version", () => {
    const { id } = createScript("Draft");
    saveVersion(id, "Saved words.");
    updateScript(id, { draftContent: "Saved words. And new ones." });
    const detail = getScriptDetail(id)!;
    expect(detail.content).toBe("Saved words. And new ones.");
    expect(detail.latestVersion?.content).toBe("Saved words.");

    // Saving the draft's text clears the draft.
    saveVersion(id, "Saved words. And new ones.");
    expect(getSqlite().prepare("SELECT draft_content AS d FROM scripts WHERE id = ?").get(id)).toEqual({ d: null });
    expect(getScriptDetail(id)?.content).toBe("Saved words. And new ones.");

    // A draft identical to the latest version is stored as NULL.
    updateScript(id, { draftContent: "Saved words. And new ones." });
    expect(getSqlite().prepare("SELECT draft_content AS d FROM scripts WHERE id = ?").get(id)).toEqual({ d: null });
  });

  it("keeps a draft that differs from the saved version: it may be newer text", () => {
    // The client lands every older draft write before it saves a version
    // (DraftSaver.saveVersion), so a different stored draft is text typed
    // during the save (or another tab's), which clearing would lose.
    const { id } = createScript("Draft");
    saveVersion(id, "One.");
    updateScript(id, { draftContent: "One. Two. Three." });
    saveVersion(id, "One. Two.");
    expect(getScriptDetail(id)?.content).toBe("One. Two. Three.");
    expect(getScriptDetail(id)?.latestVersion?.content).toBe("One. Two.");
  });

  it("does not bump updated_at for archive or icon changes", () => {
    const { id } = createScript("Stamp");
    getSqlite().prepare("UPDATE scripts SET updated_at = '2020-01-01 00:00:00' WHERE id = ?").run(id);
    updateScript(id, { archived: true, icon: "Eye" });
    expect(getSqlite().prepare("SELECT updated_at AS u, archived AS a, icon AS i FROM scripts WHERE id = ?").get(id)).toEqual({
      u: "2020-01-01 00:00:00",
      a: 1,
      i: "Eye",
    });
    updateScript(id, { title: "Renamed" });
    expect((getSqlite().prepare("SELECT updated_at AS u FROM scripts WHERE id = ?").get(id) as { u: string }).u).not.toBe(
      "2020-01-01 00:00:00"
    );
  });

  it("creates exactly one script from a template, as an unsaved draft", () => {
    const template = createScript("Long-form Video", "# [Title]\n\n> [Insert cold open]", {
      isTemplate: true,
      context: "Template brief",
      targetLength: 3900,
    });
    const before = (getSqlite().prepare("SELECT count(*) AS n FROM scripts").get() as { n: number }).n;
    const copy = createScriptFromTemplate(template.id)!;
    const after = (getSqlite().prepare("SELECT count(*) AS n FROM scripts").get() as { n: number }).n;
    expect(after - before).toBe(1);
    expect(copy).toMatchObject({ title: "", isTemplate: false, context: "Template brief", targetLength: 3900, currentVersion: 0 });
    expect(getScriptVersions(copy.id)).toHaveLength(0);
    expect(getScriptDetail(copy.id)?.content).toBe("# [Title]\n\n> [Insert cold open]");
    expect(createScriptFromTemplate(template.id, "  My title ")?.title).toBe("My title");
    expect(createScriptFromTemplate(copy.id)).toBeNull();
  });
});

describe("listScriptSummaries", () => {
  it("filters archived, orders by last edit and reads the latest whole-script score", () => {
    const sqlite = getSqlite();
    const a = createScript("Summary A", "One two three.");
    const b = createScript("Summary B");
    updateScript(b.id, { draftContent: "Draft words only [CUE]" });
    const archived = createScript("Archived");
    updateScript(archived.id, { archived: true });
    sqlite.prepare("UPDATE scripts SET updated_at = '2026-01-01T10:00:00.000Z' WHERE id = ?").run(a.id);
    sqlite.prepare("UPDATE scripts SET updated_at = '2026-01-01 11:00:00' WHERE id = ?").run(b.id);

    const vA = saveVersion(a.id, "One two three.")!.version.id;
    sqlite.prepare("UPDATE scripts SET updated_at = '2026-01-01T10:00:00.000Z' WHERE id = ?").run(a.id);
    const insert = sqlite.prepare(
      "INSERT INTO evaluations (script_id, version_id, model_id, model_provider, is_master_summary, status, structured_result, run_id, section_only, created_at) VALUES (?, ?, 'm', 'openrouter', 1, 'complete', ?, ?, ?, ?)"
    );
    insert.run(a.id, vA, JSON.stringify({ overall: { average: 6.5 } }), "run-1", null, "2026-01-02 00:00:00");
    insert.run(a.id, vA, JSON.stringify({ overall: { average: 7.25 } }), "run-2", null, "2026-01-03 00:00:00");
    insert.run(a.id, vA, JSON.stringify({ overall: { average: 2 } }), "run-3", "## Act 2", "2026-01-04 00:00:00");
    insert.run(a.id, vA, "{not json", null, null, "2026-01-05 00:00:00"); // legacy row: ignored, and must not break json_extract

    const rows = listScriptSummaries();
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain(archived.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
    const rowA = rows.find((r) => r.id === a.id)!;
    expect(rowA).toMatchObject({ spokenWords: 3, lastScore: 7.25, lastReviewedAt: "2026-01-03 00:00:00" });
    expect(rowA).not.toHaveProperty("draftContent");
    expect(rows.find((r) => r.id === b.id)).toMatchObject({ spokenWords: 3, lastScore: null, lastReviewedAt: null, heading: null });

    const archivedRows = listScriptSummaries({ archived: true });
    expect(archivedRows.map((r) => r.id)).toContain(archived.id);
    expect(archivedRows.every((r) => r.archived)).toBe(true);
    expect(archivedRows.map((r) => r.id)).not.toContain(a.id);
  });
});

describe("deleteScript", () => {
  it("removes the script and every dependent row, leaving other scripts alone", () => {
    const sqlite = getSqlite();
    const keep = createScript("Keep", "Kept words.");
    const doomed = createScript("Doomed", "Some words.");
    const vid = getScriptVersions(doomed.id)[0].id;
    const keepVid = getScriptVersions(keep.id)[0].id;

    for (const [sid, v] of [
      [doomed.id, vid],
      [keep.id, keepVid],
    ]) {
      sqlite.prepare("INSERT INTO evaluations (script_id, version_id, model_id, model_provider) VALUES (?, ?, 'm', 'p')").run(sid, v);
      sqlite.prepare("INSERT INTO suggestions (script_id, version_id, original_text, suggested_text, reasoning) VALUES (?, ?, 'a', 'b', 'c')").run(sid, v);
      const check = sqlite.prepare("INSERT INTO fact_checks (script_id, version_id, model_id, model_provider) VALUES (?, ?, 'm', 'p')").run(sid, v);
      sqlite
        .prepare("INSERT INTO fact_issues (script_id, version_id, fact_check_id, claim_text, verdict, reasoning) VALUES (?, ?, ?, 'c', 'verified', 'r')")
        .run(sid, v, check.lastInsertRowid);
      sqlite.prepare("INSERT INTO notes (script_id, version_id, anchor_text, issue) VALUES (?, ?, 'a', 'i')").run(sid, v);
      sqlite.prepare("INSERT INTO beats (script_id, position, title) VALUES (?, 0, 't')").run(sid);
      sqlite.prepare("INSERT INTO direction_runs (script_id, version_id, model_id, model_provider) VALUES (?, ?, 'm', 'p')").run(sid, v);
      sqlite
        .prepare("INSERT INTO production_directions (script_id, version_id, original_text, direction_type, reasoning) VALUES (?, ?, 'o', 'b-roll', 'r')")
        .run(sid, v);
      const tag = sqlite.prepare("INSERT INTO tags (name) VALUES (?)").run(`tag-${sid}`);
      sqlite.prepare("INSERT INTO script_tags (script_id, tag_id) VALUES (?, ?)").run(sid, tag.lastInsertRowid);
    }

    const tables = [
      "evaluations",
      "suggestions",
      "fact_checks",
      "fact_issues",
      "notes",
      "beats",
      "direction_runs",
      "production_directions",
      "script_tags",
      "script_versions",
    ];
    expect(deleteScript(doomed.id)).toBe(true);
    for (const table of tables) {
      expect(countWhere(table, doomed.id), table).toBe(0);
      expect(countWhere(table, keep.id), table).toBeGreaterThan(0);
    }
    expect(getScriptDetail(doomed.id)).toBeNull();
    expect(deleteScript(doomed.id)).toBe(false);
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});

describe("markdown export", () => {
  it("slugifies and derives display titles", () => {
    expect(slugify("Ça va? SQLite: the 2000s!")).toBe("ca-va-sqlite-the-2000s");
    expect(slugify("!!!")).toBe("untitled");
    expect(displayTitle("", "intro\n# The Real Title\n")).toBe("The Real Title");
    expect(displayTitle("  ", "no heading")).toBe("Untitled script");
    expect(displayTitle("Set", "# Other")).toBe("Set");
    expect(firstHeading("## Not this\n# **The** _Title_\n")).toBe("The Title");
    expect(firstHeading("No heading here")).toBeNull();
  });

  it("ignores the legacy default title and a template's placeholder heading (findings 76, 77)", () => {
    expect(firstHeading("# [Title]\n\n## Hook")).toBeNull();
    expect(displayTitle("", "# [Title]\n\nBody.")).toBe("Untitled script");
    expect(displayTitle("Untitled Script", "# Chips\n\nBody.")).toBe("Chips");
    expect(displayTitle("Untitled Scriptt", "No heading")).toBe("Untitled script");
    expect(displayTitle("Untitled ScriptA tutorial", "# Chips")).toBe("A tutorial");
    expect(displayTitle("Untitled Scripture Study", "# Chips")).toBe("Untitled Scripture Study");
  });

  it("titles an untitled script by its real H1, not a code comment or a bare '#'", () => {
    expect(displayTitle("", "# Learn C#\n\nBody.")).toBe("Learn C#");
    expect(displayTitle("", "Intro\n\n```bash\n# install the cli\nnpm i\n```\n\n# Real Title")).toBe("Real Title");
    expect(displayTitle("", "#\nThis paragraph is not a heading")).toBe("Untitled script");

    const { id } = createScript("", "", { draftContent: "# Learn C#\n\nBody." });
    expect(listScriptSummaries().find((s) => s.id === id)?.heading).toBe("Learn C#");
    expect(buildScriptExport(id)!.dirName).toBe(`${id}-learn-c`);
    expect(buildScriptExport(id)!.files["script.md"]).toContain('title: "Learn C#"');
  });

  it("writes script, versions, notes and beats", () => {
    const { id } = createScript("", "", { context: 'Brief with "quotes"\nand lines' });
    saveVersion(id, "# Export Me\n\nVersion one.");
    saveVersion(id, "# Export Me\n\nVersion two.");
    updateScript(id, { draftContent: "# Export Me\n\nUnsaved draft." });
    const vid = getScriptVersions(id)[0].id;
    getSqlite()
      .prepare("INSERT INTO notes (script_id, version_id, anchor_text, issue, why, persona_slugs, source_models, status) VALUES (?, ?, 'Version two.', 'Ends abruptly', 'No payoff', '[\"story-architect\",\"clarity-editor\",\"hook-doctor\"]', '[\"Sonnet\",\"Sonnet\",\"\"]', 'open')")
      .run(id, vid);
    getSqlite().prepare("INSERT INTO beats (script_id, position, title, purpose) VALUES (?, 0, 'Cold open', 'Hook the viewer')").run(id);

    const exp = buildScriptExport(id, new Date("2026-10-27T12:00:00Z"))!;
    expect(exp.dirName).toBe(`${id}-export-me`);
    expect(Object.keys(exp.files).sort()).toEqual(["beats.md", "notes.md", "script.md", "versions/v001.md", "versions/v002.md"]);
    expect(exp.files["script.md"]).toContain('title: "Export Me"');
    expect(exp.files["script.md"]).toContain('brief: "Brief with \\"quotes\\"\\nand lines"');
    expect(exp.files["script.md"]).toContain("unsaved_draft: true");
    expect(exp.files["script.md"].endsWith("Unsaved draft.")).toBe(true);
    expect(exp.files["versions/v001.md"]).toContain("Version one.");
    expect(exp.files["notes.md"]).toContain("### Ends abruptly");
    expect(exp.files["notes.md"]).toContain("> Version two.");
    expect(exp.files["notes.md"]).toContain("Lenses: story-architect, clarity-editor, hook-doctor");
    // Models are stored 1:1 with lenses ("" when unknown); the export lists each once.
    expect(exp.files["notes.md"]).toContain("Models: Sonnet ·");
    expect(exp.files["beats.md"]).toContain("1. **Cold open** (planned, writer)");

    const folder = writeScriptExport(path.join(tmp, "exports"), exp);
    expect(fs.readFileSync(path.join(folder, "versions", "v002.md"), "utf8")).toContain("Version two.");
  });
});
