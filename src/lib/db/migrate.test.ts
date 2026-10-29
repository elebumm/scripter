// Migration smoke test: runs every drizzle migration against (a) an empty DB
// and (b) a copy of the worktree's data/scripter.db when present, and checks
// the refresh schema (0010) landed without losing rows. Never opens the
// original file: it is copied byte for byte into a temp folder first.
// Then a regression test for runMigrations(): a drizzle-kit style table
// rebuild of a parent table must not cascade-delete its child rows.

import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb, getDbPath, getSqlite } from "./index";
import { runMigrations } from "./migrate";

const migrationsFolder = path.join(process.cwd(), "drizzle");
const devDb = path.join(process.cwd(), "data", "scripter.db");
const journal = JSON.parse(fs.readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8")) as {
  entries: Array<{ tag: string }>;
};
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scripter-migrate-test-"));

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function columns(sqlite: Database.Database, table: string): string[] {
  return (sqlite.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map((c) => c.name);
}

function tableExists(sqlite: Database.Database, table: string): boolean {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function count(sqlite: Database.Database, table: string): number {
  return tableExists(sqlite, table)
    ? (sqlite.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n
    : 0;
}

const DATA_TABLES = ["scripts", "script_versions", "evaluations", "evaluation_profiles", "fact_checks", "fact_issues"];

const cases: Array<{ name: string; prepare: (file: string) => void }> = [
  { name: "empty database", prepare: () => {} },
];
if (fs.existsSync(devDb)) {
  cases.push({
    name: "copy of data/scripter.db",
    prepare: (file) => {
      fs.copyFileSync(devDb, file);
      if (fs.existsSync(`${devDb}-wal`)) fs.copyFileSync(`${devDb}-wal`, `${file}-wal`);
    },
  });
}

describe.each(cases)("migrations on $name", ({ name, prepare }) => {
  const file = path.join(tmpDir, `${name.replace(/\W+/g, "-")}.db`);
  prepare(file);
  const sqlite = new Database(file);
  sqlite.pragma("foreign_keys = ON");
  const before = Object.fromEntries(DATA_TABLES.map((t) => [t, count(sqlite, t)]));
  migrate(drizzle(sqlite), { migrationsFolder });

  afterAll(() => sqlite.close());

  it("records every journal entry as applied", () => {
    expect(count(sqlite, "__drizzle_migrations")).toBe(journal.entries.length);
  });

  it("adds the draft/archive columns to scripts", () => {
    expect(columns(sqlite, "scripts")).toEqual(expect.arrayContaining(["draft_content", "archived", "icon"]));
  });

  it("adds run, persona and cost columns to evaluations", () => {
    expect(columns(sqlite, "evaluations")).toEqual(
      expect.arrayContaining(["run_id", "persona_id", "tokens_in", "tokens_out", "cost_usd"])
    );
  });

  it("adds persona columns to evaluation_profiles", () => {
    expect(columns(sqlite, "evaluation_profiles")).toEqual(
      expect.arrayContaining(["slug", "description", "model_id", "icon", "color", "is_active", "position"])
    );
  });

  it("links fact_issues to their fact check", () => {
    expect(columns(sqlite, "fact_issues")).toContain("fact_check_id");
  });

  it("creates notes and beats with cascading foreign keys", () => {
    expect(columns(sqlite, "notes")).toEqual(
      expect.arrayContaining(["script_id", "version_id", "run_id", "anchor_text", "issue", "why", "question", "status", "persona_slugs"])
    );
    expect(columns(sqlite, "beats")).toEqual(
      expect.arrayContaining(["script_id", "position", "title", "purpose", "writer_notes", "target_seconds", "status", "source", "anchor_text"])
    );
    const fks = (table: string) =>
      sqlite.prepare(`PRAGMA foreign_key_list("${table}")`).all() as Array<{ table: string; on_delete: string }>;
    expect(fks("notes")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "scripts", on_delete: "CASCADE" }),
        expect.objectContaining({ table: "script_versions", on_delete: "CASCADE" }),
      ])
    );
    expect(fks("beats")).toEqual(expect.arrayContaining([expect.objectContaining({ table: "scripts", on_delete: "CASCADE" })]));
  });

  it("keeps every existing row and a sound file", () => {
    for (const table of DATA_TABLES) {
      expect(count(sqlite, table), table).toBe(before[table]);
    }
    expect(sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
  });

  it("is a no-op when run again", () => {
    migrate(drizzle(sqlite), { migrationsFolder });
    expect(count(sqlite, "__drizzle_migrations")).toBe(journal.entries.length);
  });
});

// What drizzle-kit generates for any default, NOT NULL, type or FK change on
// an existing table. The PRAGMAs are no-ops inside drizzle's transaction.
function rebuildMigration(sqlite: Database.Database, table: string): string {
  const ddl = (sqlite.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { sql: string }).sql;
  const createNew = ddl.replace(new RegExp(`^CREATE TABLE [\`"]?${table}[\`"]?`), `CREATE TABLE \`__new_${table}\``);
  if (createNew === ddl) throw new Error(`unexpected DDL for ${table}: ${ddl}`);
  const cols = columns(sqlite, table)
    .map((c) => `"${c}"`)
    .join(", ");
  return [
    "PRAGMA foreign_keys=OFF;",
    `${createNew};`,
    `INSERT INTO \`__new_${table}\`(${cols}) SELECT ${cols} FROM \`${table}\`;`,
    `DROP TABLE \`${table}\`;`,
    `ALTER TABLE \`__new_${table}\` RENAME TO \`${table}\`;`,
    "PRAGMA foreign_keys=ON;",
  ].join("--> statement-breakpoint\n");
}

/** A copy of drizzle/ in `dir` with extra migrations appended to its journal. */
function migrationsWith(dir: string, extra: Array<{ tag: string; sql: string }>): string {
  const folder = path.join(dir, "drizzle");
  fs.cpSync(migrationsFolder, folder, { recursive: true });
  const journalFile = path.join(folder, "meta", "_journal.json");
  const copy = JSON.parse(fs.readFileSync(journalFile, "utf8")) as { entries: Array<Record<string, unknown>> };
  for (const { tag, sql } of extra) {
    const last = copy.entries.at(-1)!;
    copy.entries.push({ ...last, idx: copy.entries.length, when: Number(last.when) + 1000, tag });
    fs.writeFileSync(path.join(folder, `${tag}.sql`), sql);
  }
  fs.writeFileSync(journalFile, JSON.stringify(copy, null, 2));
  return folder;
}

/** A copy of drizzle/ plus a generated-style 0011 that rebuilds `table`. */
function migrationsWithRebuild(dir: string, sqlite: Database.Database, table: string): string {
  return migrationsWith(dir, [{ tag: `0011_rebuild_${table}`, sql: rebuildMigration(sqlite, table) }]);
}

const CHILD_TABLES = ["script_versions", "evaluations", "notes", "beats", "fact_checks", "fact_issues"];

function seedScriptWithHistory(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO scripts (id, title) VALUES (1, 'Kept');
    INSERT INTO script_versions (id, script_id, version, content, word_count) VALUES
      (1, 1, 1, 'First take of the opening line here.', 7),
      (2, 1, 2, 'Second take of the opening line here.', 7);
    INSERT INTO evaluations (script_id, version_id, model_id, model_provider, result) VALUES (1, 2, 'm', 'openrouter', 'ok');
    INSERT INTO notes (script_id, version_id, anchor_text, issue) VALUES (1, 2, 'opening line', 'The opening line is vague.');
    INSERT INTO beats (script_id, position, title) VALUES (1, 0, 'Hook');
    INSERT INTO fact_checks (id, script_id, version_id, model_id, model_provider) VALUES (1, 1, 2, 'm', 'openrouter');
    INSERT INTO fact_issues (script_id, version_id, fact_check_id, claim_text, verdict, reasoning) VALUES (1, 2, 1, 'opening line', 'supported', 'Sources agree.');
  `);
}

function childCounts(sqlite: Database.Database): Record<string, number> {
  return Object.fromEntries(CHILD_TABLES.map((t) => [t, count(sqlite, t)]));
}

describe("runMigrations on a table-rebuild migration", () => {
  const dir = path.join(tmpDir, "rebuild");
  const dbFile = path.join(dir, "data", "scripter.db");
  let before: Record<string, number>;

  beforeAll(() => {
    process.env.SCRIPTER_DB_PATH = dbFile;
    if (getDbPath() !== path.resolve(dbFile)) throw new Error(`DB path override not honoured: ${getDbPath()}`);
    runMigrations(migrationsFolder);
    seedScriptWithHistory(getSqlite());
    before = childCounts(getSqlite());
  });

  afterAll(() => {
    closeDb();
    delete process.env.SCRIPTER_DB_PATH;
  });

  it("seeds a row in every child table", () => {
    expect(Object.values(before).every((n) => n > 0)).toBe(true);
  });

  it("would lose every child row if drizzle ran it with foreign keys on", () => {
    // Control: the same migration through drizzle directly on a foreign-keys-ON
    // connection (what runMigrations used to do) cascades the DROP TABLE.
    const controlFile = path.join(dir, "control.db");
    const sqlite = getSqlite();
    sqlite.prepare("VACUUM INTO ?").run(controlFile);
    const control = new Database(controlFile);
    try {
      control.pragma("foreign_keys = ON");
      migrate(drizzle(control), { migrationsFolder: migrationsWithRebuild(path.join(dir, "control"), control, "scripts") });
      expect(count(control, "scripts")).toBe(1);
      expect(count(control, "script_versions")).toBe(0);
    } finally {
      control.close();
    }
  });

  it("keeps every child row, leaves foreign keys on and records the migration", () => {
    const sqlite = getSqlite();
    runMigrations(migrationsWithRebuild(path.join(dir, "real"), sqlite, "scripts"));
    expect(count(sqlite, "__drizzle_migrations")).toBe(journal.entries.length + 1);
    expect(count(sqlite, "scripts")).toBe(1);
    expect(childCounts(sqlite)).toEqual(before);
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
    expect(sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
  });

  it("logs foreign key violations a migration leaves behind instead of failing", () => {
    const sqlite = getSqlite();
    const folder = migrationsWith(path.join(dir, "orphan"), [
      { tag: "0011_rebuild_scripts", sql: fs.readFileSync(path.join(dir, "real", "drizzle", "0011_rebuild_scripts.sql"), "utf8") },
      { tag: "0012_orphan_beat", sql: "INSERT INTO beats (script_id, position, title) VALUES (999, 0, 'Orphan');" },
    ]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => runMigrations(folder)).not.toThrow();
      expect(spy).toHaveBeenCalledWith(expect.stringMatching(/1 foreign key violation/), expect.any(Array));
      expect(count(sqlite, "__drizzle_migrations")).toBe(journal.entries.length + 2);
      expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);

      // Every later startup runs with nothing pending: the old orphan is not
      // blamed on a migration again.
      spy.mockClear();
      runMigrations(folder);
      expect(spy).not.toHaveBeenCalled();
      expect(sqlite.pragma("foreign_key_check")).toHaveLength(1);
      expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("0011_clear_legacy_titles", () => {
  /** A copy of drizzle/ whose journal stops before `tag`. */
  function migrationsBefore(dir: string, tag: string): string {
    const folder = path.join(dir, "drizzle");
    fs.cpSync(migrationsFolder, folder, { recursive: true });
    const journalFile = path.join(folder, "meta", "_journal.json");
    const copy = JSON.parse(fs.readFileSync(journalFile, "utf8")) as { entries: Array<{ tag: string }> };
    copy.entries = copy.entries.slice(0, copy.entries.findIndex((e) => e.tag === tag));
    fs.writeFileSync(journalFile, JSON.stringify(copy, null, 2));
    return folder;
  }

  it("clears only the exact defaults older builds set, once (finding 77)", () => {
    const dir = path.join(tmpDir, "legacy-titles");
    const sqlite = new Database(path.join(tmpDir, "legacy-titles.db"));
    try {
      migrate(drizzle(sqlite), { migrationsFolder: migrationsBefore(dir, "0011_clear_legacy_titles") });
      const titles = [
        "Untitled Script",
        "Long-form Video (Copy)",
        "Untitled Scriptt",
        "Untitled ScriptA tutorial about AI tools",
        "Long-form Video (Copy) notes",
        "My video (Copy)",
        "Chips",
      ];
      sqlite.prepare("INSERT INTO scripts (title, is_template) VALUES ('Long-form Video', 1), ('Template (Copy)', 1)").run();
      for (const title of titles) sqlite.prepare("INSERT INTO scripts (title) VALUES (?)").run(title);

      migrate(drizzle(sqlite), { migrationsFolder });
      const after = () => (sqlite.prepare("SELECT title FROM scripts WHERE is_template = 0 ORDER BY id").all() as Array<{ title: string }>).map((r) => r.title);
      expect(after()).toEqual(["", "", "Untitled Scriptt", "Untitled ScriptA tutorial about AI tools", "Long-form Video (Copy) notes", "My video (Copy)", "Chips"]);
      expect(sqlite.prepare("SELECT title FROM scripts WHERE is_template = 1 ORDER BY id").all()).toEqual([
        { title: "Long-form Video" },
        { title: "Template (Copy)" },
      ]);

      // Applied once: a title typed later is never touched by a restart.
      sqlite.prepare("UPDATE scripts SET title = 'Long-form Video (Copy)' WHERE title = 'Chips'").run();
      migrate(drizzle(sqlite), { migrationsFolder });
      expect(after().at(-1)).toBe("Long-form Video (Copy)");
    } finally {
      sqlite.close();
    }
  });
});
