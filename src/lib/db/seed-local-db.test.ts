// Runs scripts/seed-local-db.mjs (npm run db:seed-local) against temp folders.

import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import vm from "vm";
import Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";

const script = path.join(process.cwd(), "scripts", "seed-local-db.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "scripter-seed-local-test-"));
let n = 0;

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A backups folder shaped like a shared SCRIPTER_BACKUP_DIR: <root>/<db>-<hash>/auto/<snapshot>. */
function backupSource(scripts: number): { source: string; target: string } {
  const dir = path.join(tmp, `case-${++n}`);
  const auto = path.join(dir, "backups", "scripter-1a2b3c4d", "auto");
  fs.mkdirSync(auto, { recursive: true });
  const db = new Database(path.join(auto, "scripter-2026-10-27.db"));
  db.exec("CREATE TABLE scripts (id INTEGER PRIMARY KEY, title TEXT); CREATE TABLE script_versions (id INTEGER PRIMARY KEY)");
  const insert = db.prepare("INSERT INTO scripts (title) VALUES (?)");
  for (let i = 0; i < scripts; i++) insert.run(`s${i}`);
  db.close();
  return { source: path.join(dir, "backups"), target: path.join(dir, "data", "scripter.db") };
}

function seed(source: string, target: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, SCRIPTER_BACKUP_SOURCE: source, SCRIPTER_DB_PATH: target };
  const out = spawnSync(process.execPath, [script], { env, encoding: "utf8" });
  return { status: out.status, output: `${out.stdout}${out.stderr}` };
}

describe("db:seed-local", () => {
  it("copies the newest snapshot from a shared backups layout and describes the file the app will open", () => {
    const { source, target } = backupSource(3);
    const run = seed(source, target);
    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain("3 scripts, 0 versions");
    const db = new Database(target, { readonly: true });
    expect(db.prepare("SELECT count(*) AS n FROM scripts").get()).toEqual({ n: 3 });
    db.close();
    expect(fs.readdirSync(path.dirname(target))).toEqual(["scripter.db"]);
  });

  it("refuses to seed next to a leftover WAL from the old database", () => {
    const { source, target } = backupSource(2);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(`${target}-wal`, "stale frames");
    fs.writeFileSync(`${target}-shm`, "stale index");

    const run = seed(source, target);
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/leftover .*scripter\.db-wal, .*scripter\.db-shm/);
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.readFileSync(`${target}-wal`, "utf8")).toBe("stale frames");
    expect(fs.readdirSync(path.dirname(target)).filter((f) => f.includes(".tmp"))).toEqual([]);
  });

  it("defaults to the main checkout's backups folder, spelled with real backslashes", () => {
    // Evaluated rather than run: running it would read the owner's real backups.
    const literal = fs.readFileSync(script, "utf8").match(/^const DEFAULT_SOURCE = (.+);$/m)?.[1];
    expect(literal).toBeDefined();
    expect(vm.runInNewContext(literal!)).toBe("C:\\Users\\lewis\\scripter\\data\\backups");
  });

  it("leaves an existing database untouched", () => {
    const { source, target } = backupSource(1);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "mine");
    const run = seed(source, target);
    expect(run.status).toBe(0);
    expect(run.output).toContain("already exists");
    expect(fs.readFileSync(target, "utf8")).toBe("mine");
  });
});
