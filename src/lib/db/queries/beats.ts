import { db } from "../index";
import { beats } from "../schema";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { Beat, BeatStatus } from "@/types/review";

// The writer's beat sheet. Positions are always 0..n-1 per script; every
// write that changes the set or order renumbers inside one transaction.

type BeatRow = typeof beats.$inferSelect;

export const BEAT_STATUSES = ["planned", "drafted", "cut"] as const satisfies readonly BeatStatus[];

const now = sql`(datetime('now'))`;

function asStatus(value: string): BeatStatus {
  return (BEAT_STATUSES as readonly string[]).includes(value) ? (value as BeatStatus) : "planned";
}

export function toBeat(row: BeatRow): Beat {
  return {
    id: row.id,
    scriptId: row.scriptId,
    position: row.position,
    title: row.title,
    purpose: row.purpose,
    writerNotes: row.writerNotes,
    targetSeconds: row.targetSeconds,
    status: asStatus(row.status),
    source: row.source === "ai" ? "ai" : "writer",
    anchorText: row.anchorText,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * The full order after a reorder request: requested ids that belong to the
 * script (first occurrence wins), then any of the script's beats the request
 * left out, in their current order. Unknown ids are ignored.
 */
export function orderBeatIds(currentIds: readonly number[], requestedIds: readonly number[]): number[] {
  const known = new Set(currentIds);
  const seen = new Set<number>();
  const ordered: number[] = [];
  for (const id of requestedIds) {
    if (known.has(id) && !seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  for (const id of currentIds) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function orderedRows(tx: Tx, scriptId: number): BeatRow[] {
  return tx.select().from(beats).where(eq(beats.scriptId, scriptId)).orderBy(asc(beats.position), asc(beats.id)).all();
}

/** Write positions 0..n-1 in the given id order (only rows whose position changes). */
function writePositions(tx: Tx, rows: BeatRow[], orderedIds: number[]) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  orderedIds.forEach((id, index) => {
    const row = byId.get(id);
    if (row && row.position !== index) {
      tx.update(beats).set({ position: index }).where(eq(beats.id, id)).run();
    }
  });
}

export function listBeats(scriptId: number): Beat[] {
  return db
    .select()
    .from(beats)
    .where(eq(beats.scriptId, scriptId))
    .orderBy(asc(beats.position), asc(beats.id))
    .all()
    .map(toBeat);
}

export interface NewBeat {
  title: string;
  purpose?: string;
  targetSeconds?: number | null;
  source?: "ai" | "writer";
}

/** Add one beat, appended unless `position` is given (clamped to 0..n). */
export function createBeat(scriptId: number, data: NewBeat & { position?: number }): Beat {
  return db.transaction((tx) => {
    const rows = orderedRows(tx, scriptId);
    const inserted = tx
      .insert(beats)
      .values({
        scriptId,
        position: rows.length,
        title: data.title,
        purpose: data.purpose ?? "",
        targetSeconds: data.targetSeconds ?? null,
        source: data.source ?? "writer",
      })
      .returning()
      .get();

    const ids = rows.map((r) => r.id);
    const at = data.position === undefined ? ids.length : Math.max(0, Math.min(ids.length, Math.trunc(data.position)));
    ids.splice(at, 0, inserted.id);
    writePositions(tx, [...rows, inserted], ids);
    return toBeat({ ...inserted, position: at });
  });
}

/**
 * Partial update. When the writer changes an AI beat's title, purpose, notes
 * or target time it becomes their own plan (source "writer"), so a later "Use
 * these beats" never replaces it.
 */
export function updateBeat(
  id: number,
  data: Partial<{ title: string; purpose: string; writerNotes: string; status: BeatStatus; targetSeconds: number | null }>
): Beat | undefined {
  return db.transaction((tx) => {
    const current = tx.select().from(beats).where(eq(beats.id, id)).get();
    if (!current) return undefined;
    const rewritten =
      (data.title !== undefined && data.title !== current.title) ||
      (data.purpose !== undefined && data.purpose !== current.purpose) ||
      (data.writerNotes !== undefined && data.writerNotes !== current.writerNotes) ||
      (data.targetSeconds !== undefined && data.targetSeconds !== current.targetSeconds);
    const row = tx
      .update(beats)
      .set({ ...data, ...(rewritten ? { source: "writer" } : {}), updatedAt: now })
      .where(eq(beats.id, id))
      .returning()
      .get();
    return row ? toBeat(row) : undefined;
  });
}

/** Delete one beat and close the gap. Returns false when it didn't exist. */
export function deleteBeat(id: number): boolean {
  return db.transaction((tx) => {
    const row = tx.select().from(beats).where(eq(beats.id, id)).get();
    if (!row) return false;
    tx.delete(beats).where(eq(beats.id, id)).run();
    const rows = orderedRows(tx, row.scriptId);
    writePositions(
      tx,
      rows,
      rows.map((r) => r.id)
    );
    return true;
  });
}

export function reorderBeats(scriptId: number, requestedIds: number[]): Beat[] {
  db.transaction((tx) => {
    const rows = orderedRows(tx, scriptId);
    writePositions(tx, rows, orderBeatIds(rows.map((r) => r.id), requestedIds));
  });
  return listBeats(scriptId);
}

/**
 * "Use these beats": delete the script's AI beats that are still planned and
 * append the given beats (source "ai") after the beats that remain. Writer
 * beats and AI beats the writer has drafted or cut keep their relative order.
 */
export function replaceAiBeats(scriptId: number, items: NewBeat[]): Beat[] {
  db.transaction((tx) => {
    tx.delete(beats)
      .where(and(eq(beats.scriptId, scriptId), eq(beats.source, "ai"), eq(beats.status, "planned")))
      .run();
    const kept = orderedRows(tx, scriptId);
    const created = items.map((item, i) =>
      tx
        .insert(beats)
        .values({
          scriptId,
          position: kept.length + i,
          title: item.title,
          purpose: item.purpose ?? "",
          targetSeconds: item.targetSeconds ?? null,
          source: "ai",
        })
        .returning()
        .get()
    );
    const all = [...kept, ...created];
    writePositions(
      tx,
      all,
      all.map((r) => r.id)
    );
  });
  return listBeats(scriptId);
}

export interface CoverageUpdate {
  id: number;
  status: "planned" | "drafted";
  anchorText: string | null;
}

/**
 * Persist a draft check. Beats the writer cut are never touched; only the
 * planned <-> drafted transition and the anchor change.
 */
export function applyCoverageUpdates(scriptId: number, updates: CoverageUpdate[]): Beat[] {
  db.transaction((tx) => {
    for (const u of updates) {
      tx.update(beats)
        .set({ status: u.status, anchorText: u.anchorText, updatedAt: now })
        .where(and(eq(beats.id, u.id), eq(beats.scriptId, scriptId), ne(beats.status, "cut")))
        .run();
    }
  });
  return listBeats(scriptId);
}
