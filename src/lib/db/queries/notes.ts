// Notes: anchored diagnoses from the council's synthesis. They never carry
// replacement wording. Rows follow the draft: each synthesis carries the
// visible notes forward onto the reviewed version (see planNoteCarryOver).

import { db } from "../index";
import { notes, scriptVersions } from "../schema";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { Note, NoteStatus } from "@/types/review";
import { NOTE_CATEGORIES, PRIORITIES, type NoteCategory, type Priority } from "@/lib/llm/schemas";
import { parseDbDate } from "@/lib/utils/dates";
import { getLatestPass, getPreviousWholeRunId, type LatestPass } from "./evaluations";

export type NoteRow = typeof notes.$inferSelect;

export const NOTE_STATUSES = ["open", "addressed", "dismissed"] as const satisfies readonly NoteStatus[];

function parseStringArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function asCategory(value: string): NoteCategory {
  return (NOTE_CATEGORIES as readonly string[]).includes(value) ? (value as NoteCategory) : "other";
}

function asPriority(value: string): Priority {
  return (PRIORITIES as readonly string[]).includes(value) ? (value as Priority) : "medium";
}

function asStatus(value: string): NoteStatus {
  return (NOTE_STATUSES as readonly string[]).includes(value) ? (value as NoteStatus) : "open";
}

export function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    scriptId: row.scriptId,
    versionId: row.versionId,
    runId: row.runId,
    anchorText: row.anchorText,
    issue: row.issue,
    why: row.why,
    question: row.question,
    category: asCategory(row.category),
    priority: asPriority(row.priority),
    personaSlugs: parseStringArray(row.personaSlugs),
    sourceModels: parseStringArray(row.sourceModels),
    status: asStatus(row.status),
    statusChangedAt: row.statusChangedAt,
    createdAt: row.createdAt,
  };
}

/** The version (highest version number) of the script's newest notes. */
function latestNotedVersion(scriptId: number): { versionId: number; versionNumber: number } | null {
  const row = db
    .select({ versionId: notes.versionId, versionNumber: scriptVersions.version })
    .from(notes)
    .innerJoin(scriptVersions, eq(scriptVersions.id, notes.versionId))
    .where(eq(notes.scriptId, scriptId))
    .orderBy(desc(scriptVersions.version), desc(notes.id))
    .limit(1)
    .get();
  return row ?? null;
}

/**
 * The version whose notes the writer sees: the one the latest pass reviewed
 * (every synthesis carries the visible notes onto it, so a pass that left no
 * notes shows none, not an older version's leftovers), unless notes sit on a
 * newer version. `pass` is set when the latest pass reviewed that version.
 */
function visibleNotesVersion(scriptId: number): { versionId: number; pass: LatestPass | null } | null {
  const pass = getLatestPass(scriptId);
  const noted = latestNotedVersion(scriptId);
  if (pass && (!noted || pass.versionNumber >= noted.versionNumber)) return { versionId: pass.versionId, pass };
  return noted ? { versionId: noted.versionId, pass: null } : null;
}

/**
 * Notes on the visible version, any status. Addressed notes are shown only
 * while they are news, mirroring planNoteCarryOver: addressed since the
 * latest pass started (by the writer or by that pass), or carried forward by
 * it from the pass before. Older ones stay behind even on the same version.
 */
export function listNotesForLatestVersion(scriptId: number): Note[] {
  const visible = visibleNotesVersion(scriptId);
  if (!visible) return [];
  const rows = db
    .select()
    .from(notes)
    .where(and(eq(notes.scriptId, scriptId), eq(notes.versionId, visible.versionId)))
    .orderBy(asc(notes.id))
    .all();

  const { pass } = visible;
  if (!pass) return rows.map(toNote);
  const since = parseDbDate(pass.startedAt)?.getTime() ?? -Infinity;
  const carried = getPreviousWholeRunId(scriptId, pass.runId);
  const isNews = (row: NoteRow) => {
    if (row.status !== "addressed" || row.statusChangedAt === null) return true;
    if (row.runId !== null && row.runId === carried) return true;
    return (parseDbDate(row.statusChangedAt)?.getTime() ?? Infinity) >= since;
  };
  return rows.filter(isNews).map(toNote);
}

export function getNotesForRun(scriptId: number, runId: string): NoteRow[] {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.scriptId, scriptId), eq(notes.runId, runId)))
    .orderBy(asc(notes.id))
    .all();
}

/**
 * The writer's dismissals (newest first): never resurfaced by the council.
 * Without a limit, every one (server-side suppression); prompts pass a cap.
 */
export function getDismissedNotes(scriptId: number, limit?: number): NoteRow[] {
  const query = db
    .select()
    .from(notes)
    .where(and(eq(notes.scriptId, scriptId), eq(notes.status, "dismissed")))
    .orderBy(desc(notes.id));
  return (limit === undefined ? query : query.limit(limit)).all();
}

/**
 * "Issues raised last time": the previous whole-script pass's notes with their
 * statuses, any other note still open on the writer's list (from a section
 * review, or kept when a pass's notes were dropped), plus every note the
 * writer has dismissed (never resurfaced).
 */
export function getIssuesRaisedLastTime(scriptId: number, previousRunId: string | null, limit = 40): NoteRow[] {
  const rows = previousRunId ? getNotesForRun(scriptId, previousRunId) : [];
  const ids = new Set(rows.map((r) => r.id));
  const add = (row: NoteRow) => {
    if (ids.has(row.id)) return;
    ids.add(row.id);
    rows.push(row);
  };
  const visible = visibleNotesVersion(scriptId);
  if (visible) {
    db.select()
      .from(notes)
      .where(and(eq(notes.scriptId, scriptId), eq(notes.versionId, visible.versionId), eq(notes.status, "open")))
      .orderBy(asc(notes.id))
      .all()
      .forEach(add);
  }
  getDismissedNotes(scriptId, limit).forEach(add);
  return rows.slice(0, limit);
}

/**
 * Notes a synthesis may carry forward, address or replace: everything on the
 * currently visible version, plus open notes on the reviewed version and open
 * notes from this run (a re-synthesis).
 */
export function getCarryOverCandidates(scriptId: number, versionId: number, runId: string): NoteRow[] {
  const visible = visibleNotesVersion(scriptId);
  const conditions = [and(eq(notes.versionId, versionId), eq(notes.status, "open")), and(eq(notes.runId, runId), eq(notes.status, "open"))];
  if (visible) conditions.push(eq(notes.versionId, visible.versionId));
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.scriptId, scriptId), or(...conditions)))
    .orderBy(asc(notes.id))
    .all();
}

export interface NewNote {
  anchorText: string;
  issue: string;
  why: string;
  question: string | null;
  category: NoteCategory;
  priority: Priority;
  personaSlugs: string[];
  sourceModels: string[];
}

export interface NoteCarryOverPlan {
  /** Open notes whose anchor is gone: mark addressed and carry to the reviewed version. */
  address: number[];
  /** Carry to the reviewed version unchanged. */
  move: number[];
  /** Superseded open notes. */
  remove: number[];
  /** Also in `move`: open notes kept because this pass's notes on them were dropped. */
  kept: number[];
}

/** Apply a synthesis's note changes and insert its notes, atomically. Returns the inserted notes. */
export function applySynthesisNotes(args: {
  scriptId: number;
  versionId: number;
  runId: string;
  plan: NoteCarryOverPlan;
  newNotes: NewNote[];
}): Note[] {
  const { scriptId, versionId, runId, plan, newNotes } = args;
  return db.transaction((tx) => {
    if (plan.remove.length) {
      tx.delete(notes).where(and(eq(notes.scriptId, scriptId), inArray(notes.id, plan.remove))).run();
    }
    if (plan.address.length) {
      tx.update(notes)
        .set({ status: "addressed", statusChangedAt: sql`(datetime('now'))`, versionId })
        .where(and(eq(notes.scriptId, scriptId), inArray(notes.id, plan.address)))
        .run();
    }
    if (plan.move.length) {
      tx.update(notes)
        .set({ versionId })
        .where(and(eq(notes.scriptId, scriptId), inArray(notes.id, plan.move)))
        .run();
    }
    if (newNotes.length === 0) return [];
    return tx
      .insert(notes)
      .values(
        newNotes.map((n) => ({
          scriptId,
          versionId,
          runId,
          anchorText: n.anchorText,
          issue: n.issue,
          why: n.why,
          question: n.question,
          category: n.category,
          priority: n.priority,
          personaSlugs: JSON.stringify(n.personaSlugs),
          sourceModels: JSON.stringify(n.sourceModels),
          status: "open",
        }))
      )
      .returning()
      .all()
      .map(toNote);
  });
}

export function updateNoteStatus(id: number, status: NoteStatus): Note | null {
  const row = db
    .update(notes)
    .set({ status, statusChangedAt: sql`(datetime('now'))` })
    .where(eq(notes.id, id))
    .returning()
    .get();
  return row ? toNote(row) : null;
}
