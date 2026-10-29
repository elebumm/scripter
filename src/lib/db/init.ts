import fs from "fs";
import path from "path";
import type Database from "better-sqlite3";
import { runMigrations, seedDefaults } from "./migrate";
import { checkpoint, getAutoBackupsDir, getBackupsRoot, getDbPath, getLocalBackupsRoot, getSqlite } from "./index";

export const DAILY_SNAPSHOTS_KEPT = 14;
export const PRE_MIGRATION_SNAPSHOTS_KEPT = 10;

const DAILY_SNAPSHOT = /^scripter-\d{4}-\d{2}-\d{2}\.db$/;
const PRE_MIGRATION_SNAPSHOT = /^scripter-\d{4}-\d{2}-\d{2}-\d{6}\.db$/;

// Survives HMR so a dev server doesn't re-run migrations on every edit.
const state = globalThis as typeof globalThis & {
  __scripterDbReady?: string;
  __scripterSnapshotDay?: string;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local calendar day, e.g. "2026-10-27". */
export function localDayStamp(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function dailySnapshotName(now: Date = new Date()): string {
  return `scripter-${localDayStamp(now)}.db`;
}

/** Write a self-contained copy (WAL included) via VACUUM INTO, atomically. */
export function vacuumInto(sqlite: Database.Database, target: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  fs.rmSync(tmp, { force: true });
  try {
    sqlite.prepare("VACUUM INTO ?").run(tmp);
    fs.renameSync(tmp, target);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** Delete all but the newest `keep` files in `dir` whose names match `pattern`. */
export function pruneSnapshots(dir: string, pattern: RegExp, keep: number): string[] {
  if (!fs.existsSync(dir)) return [];
  // Names embed the date, so a reverse name sort is newest first.
  const files = fs
    .readdirSync(dir)
    .filter((name) => pattern.test(name))
    .sort()
    .reverse();
  const removed: string[] = [];
  for (const name of files.slice(keep)) {
    fs.rmSync(path.join(dir, name), { force: true });
    removed.push(name);
  }
  return removed;
}

/**
 * pruneSnapshots that only logs: an old snapshot that can't be removed (open
 * in another program, say) must not count against the copy just written.
 */
function pruneAfterSnapshot(dir: string, pattern: RegExp, keep: number): void {
  try {
    pruneSnapshots(dir, pattern, keep);
  } catch (err) {
    console.error(`[db] couldn't prune old snapshots in ${dir}:`, err);
  }
}

/**
 * Once-per-day snapshot into `dir` (skipped when today's exists), keeping the
 * newest `keep`. Never throws: a failed backup must not take the app down.
 */
export function takeDailySnapshot(
  sqlite: Database.Database,
  dir: string,
  now: Date = new Date(),
  keep: number = DAILY_SNAPSHOTS_KEPT
): string | null {
  const target = path.join(dir, dailySnapshotName(now));
  try {
    if (fs.existsSync(target)) return null;
    vacuumInto(sqlite, target);
  } catch (err) {
    console.error("[db] daily snapshot failed:", err);
    return null;
  }
  pruneAfterSnapshot(dir, DAILY_SNAPSHOT, keep);
  return target;
}

/** Number of migrations in the journal that the DB hasn't recorded yet. */
export function pendingMigrationCount(sqlite: Database.Database, migrationsFolder: string): number {
  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { entries?: unknown[] };
  const total = journal.entries?.length ?? 0;
  const hasTable = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
    .get();
  if (!hasTable) return total;
  const row = sqlite.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number };
  return Math.max(0, total - row.n);
}

function hasUserTables(sqlite: Database.Database): boolean {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'scripts'").get());
}

export interface PreMigrationSnapshot {
  /** The DB holds data and has migrations pending, so a copy must come first. */
  needed: boolean;
  /** Where the copy was written; null when it wasn't needed or every attempt failed. */
  path: string | null;
}

/**
 * Before applying new migrations to a DB that already holds data, keep a copy
 * of it as it was. Tries each folder in `dirs` in turn. Never throws: the
 * caller decides what a failed copy means (ensureDb refuses to migrate).
 */
export function snapshotBeforeMigrations(
  sqlite: Database.Database,
  migrationsFolder: string,
  dirs: string | string[],
  now: Date = new Date()
): PreMigrationSnapshot {
  let needed: boolean;
  try {
    needed = hasUserTables(sqlite) && pendingMigrationCount(sqlite, migrationsFolder) > 0;
  } catch (err) {
    // Can't tell whether anything is pending: assume a copy is needed.
    console.error("[db] couldn't count pending migrations:", err);
    needed = true;
  }
  if (!needed) return { needed, path: null };

  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const name = `scripter-${localDayStamp(now)}-${time}.db`;
  for (const dir of [...new Set(typeof dirs === "string" ? [dirs] : dirs)]) {
    const target = path.join(dir, name);
    try {
      vacuumInto(sqlite, target);
    } catch (err) {
      console.error(`[db] pre-migration snapshot into ${dir} failed:`, err);
      continue;
    }
    pruneAfterSnapshot(dir, PRE_MIGRATION_SNAPSHOT, PRE_MIGRATION_SNAPSHOTS_KEPT);
    return { needed, path: target };
  }
  return { needed, path: null };
}

/**
 * Pre-migration snapshot folders, in order: the backups root, then the data
 * folder's own backups when SCRIPTER_BACKUP_DIR points somewhere else (an
 * offline or full drive must not leave the DB without a copy).
 */
export function preMigrationDirs(): string[] {
  return [...new Set([getBackupsRoot(), getLocalBackupsRoot()])].map((root) => path.join(root, "pre-migration"));
}

/**
 * Called at the top of every API route. The first call per process (and DB
 * path) snapshots before pending migrations, migrates, seeds, merges the WAL
 * into the main file and takes the daily snapshot. Later calls only take the
 * daily snapshot when the calendar day has changed.
 *
 * Throws (and the route fails) when migrations are pending on a DB that holds
 * data but no pre-migration copy could be written: nothing is migrated, and
 * the next request tries again.
 */
export function ensureDb(): void {
  const dbPath = getDbPath();
  if (state.__scripterDbReady !== dbPath) {
    const sqlite = getSqlite();
    const migrationsFolder = path.join(process.cwd(), "drizzle");
    const dirs = preMigrationDirs();
    const snapshot = snapshotBeforeMigrations(sqlite, migrationsFolder, dirs);
    if (snapshot.needed && !snapshot.path) {
      const message =
        `Couldn't back up ${dbPath} before applying pending database migrations, so none were applied. ` +
        `Check that ${dirs.join(" or ")} is writable and the disk has free space, then reload.`;
      console.error(`[db] ${message}`);
      throw new Error(message);
    }
    runMigrations(migrationsFolder);
    seedDefaults();
    try {
      checkpoint(sqlite);
    } catch (err) {
      console.error("[db] startup checkpoint failed:", err);
    }
    state.__scripterDbReady = dbPath;
    state.__scripterSnapshotDay = undefined;
  }

  const today = localDayStamp();
  if (state.__scripterSnapshotDay !== today) {
    state.__scripterSnapshotDay = today;
    takeDailySnapshot(getSqlite(), getAutoBackupsDir());
  }
}
