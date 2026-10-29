#!/usr/bin/env node
// Give a worktree its own copy of the real data.
//
// Copies the newest snapshot found under SCRIPTER_BACKUP_SOURCE (default
// C:\Users\lewis\scripter\data\backups, searched two folders deep, which also
// covers a shared SCRIPTER_BACKUP_DIR's <db>-<hash>/auto/ folders) into
// SCRIPTER_DB_PATH (default ./data/scripter.db), but ONLY when that file does
// not exist yet. The copy is made with VACUUM INTO from a read-only
// connection, so any WAL next to the snapshot is included and the source is
// never written.
//
// Leftover -wal/-shm/-journal files next to the target belong to the old
// database: SQLite would replay them over the fresh copy on its first open,
// so the script refuses to run until they are moved away.
//
//   npm run db:seed-local

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// String.raw: in a plain literal "\b" is a backspace and "\U", "\l"... drop their backslash.
const DEFAULT_SOURCE = String.raw`C:\Users\lewis\scripter\data\backups`;
const source = path.resolve(process.env.SCRIPTER_BACKUP_SOURCE?.trim() || DEFAULT_SOURCE);
const target = path.resolve(process.env.SCRIPTER_DB_PATH?.trim() || path.join(process.cwd(), "data", "scripter.db"));

function fail(message) {
  console.error(`db:seed-local: ${message}`);
  process.exit(1);
}

function findSnapshots(dir, depth) {
  let found = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && depth > 0) {
      found = found.concat(findSnapshots(full, depth - 1));
    } else if (entry.isFile() && entry.name.endsWith(".db") && !entry.name.endsWith(".tmp")) {
      found.push({ file: full, mtimeMs: fs.statSync(full).mtimeMs });
    }
  }
  return found;
}

/** -wal, -shm or -journal files left next to `file` by an earlier database. */
function leftoverSidecars(file) {
  return ["-wal", "-shm", "-journal"].map((suffix) => file + suffix).filter((f) => fs.existsSync(f));
}

function sidecarMessage(sidecars) {
  return (
    `leftover ${sidecars.join(", ")} next to ${target}. They belong to the old database and SQLite ` +
    `would replay them over the new copy. Move or delete them and run again.`
  );
}

/** Integrity check and row counts of a database file, opened read-only. */
function summarize(file) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const check = db.pragma("integrity_check", { simple: true });
    if (check !== "ok") throw new Error(`integrity_check on ${file} returned: ${check}`);
    const count = (table) => {
      const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
      return exists ? db.prepare(`SELECT count(*) AS n FROM "${table}"`).get().n : 0;
    };
    return `${count("scripts")} scripts, ${count("script_versions")} versions, ${count("__drizzle_migrations")} migrations applied`;
  } finally {
    db.close();
  }
}

if (fs.existsSync(target)) {
  console.log(`db:seed-local: ${target} already exists; leaving it untouched.`);
  process.exit(0);
}

const initialSidecars = leftoverSidecars(target);
if (initialSidecars.length > 0) fail(sidecarMessage(initialSidecars));

if (!fs.existsSync(source)) fail(`backup folder not found: ${source} (set SCRIPTER_BACKUP_SOURCE)`);

const snapshots = findSnapshots(source, 2).sort((a, b) => b.mtimeMs - a.mtimeMs);
if (snapshots.length === 0) fail(`no .db snapshots under ${source}`);
const newest = snapshots[0].file;

const Database = require("better-sqlite3");
fs.mkdirSync(path.dirname(target), { recursive: true });
const tmp = `${target}.seed-${process.pid}.tmp`;
fs.rmSync(tmp, { force: true });

try {
  const src = new Database(newest, { readonly: true, fileMustExist: true });
  try {
    src.prepare("VACUUM INTO ?").run(tmp);
  } finally {
    src.close();
  }
  summarize(tmp);

  // Re-check right before the move: never replace an existing database, and
  // never put the copy next to another database's WAL or journal.
  if (fs.existsSync(target)) throw new Error(`${target} appeared while copying; leaving it untouched.`);
  const sidecars = leftoverSidecars(target);
  if (sidecars.length > 0) throw new Error(sidecarMessage(sidecars));
  fs.renameSync(tmp, target);

  // Describe the file the app will actually open.
  let summary;
  try {
    summary = summarize(target);
  } catch (err) {
    throw new Error(
      `the copy at ${target} failed its check after the move (${err instanceof Error ? err.message : String(err)}). ` +
        `Delete it and any ${target}-wal/-shm/-journal, then run again.`
    );
  }
  console.log(`db:seed-local: copied ${newest}\n  -> ${target}\n  (${summary}; pending migrations run on the first request)`);
} catch (err) {
  console.error(`db:seed-local: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  fs.rmSync(tmp, { force: true });
}
