"use client";

// Data for the Beat Sheet: the writer's beats, the streamed beat proposal and
// the draft check. Beats are a plan; nothing here reads or writes script text
// except the version the caller saves before a check.

import { useCallback, useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";
import * as api from "@/lib/api";
import type { Beat, BeatStatus } from "@/types/review";
import type { BeatCheck } from "@/lib/llm/schemas";
import { errorMessage } from "@/lib/stream/ndjson";
import { orderBeats, sortBeats, type PartialCheck, type PartialProposal } from "@/components/beats/beat-utils";

export type SuggestStatus = "idle" | "streaming" | "done" | "stopped" | "error";

export interface SuggestState {
  status: SuggestStatus;
  /** Partial while streaming; the full proposal once done. */
  proposal: PartialProposal | null;
  error: string | null;
}

export type CheckStatus = "idle" | "saving" | "checking" | "done" | "stopped" | "error";

export interface CheckState {
  status: CheckStatus;
  /** Streamed progress while checking. */
  partial: PartialCheck | null;
  /** The finished check (coverage comments and missing-beat proposals). */
  result: BeatCheck | null;
  error: string | null;
}

export interface BeatBrief {
  /** Target length in words (scripts.target_length). */
  targetWords: number | null;
  /** The script has a brief (scripts.context) for suggestions to work from. */
  hasBrief: boolean;
}

export type BeatPatch = Partial<{
  title: string;
  purpose: string;
  writerNotes: string;
  status: BeatStatus;
  targetSeconds: number | null;
}>;

export interface NewBeat {
  title: string;
  purpose?: string;
  targetSeconds?: number | null;
  source?: "ai" | "writer";
}

export interface BeatsController {
  /** Beats in sheet order. */
  beats: Beat[];
  loading: boolean;
  loadError: string | null;
  /** The last failed change (add, edit, delete, reorder, replace). */
  error: string | null;
  clearError(): void;
  brief: BeatBrief | null;
  reload(): void;
  create(data: NewBeat): Promise<Beat | null>;
  update(id: number, patch: BeatPatch): Promise<void>;
  remove(id: number): Promise<void>;
  reorder(orderedIds: number[]): Promise<void>;
  /** Replace the planned AI beats with these (the writer's own beats stay). */
  replaceAi(items: Array<{ title: string; purpose: string; targetSeconds?: number | null }>): Promise<boolean>;
  suggestion: SuggestState;
  suggest(): Promise<void>;
  stopSuggest(): void;
  dismissSuggestion(): void;
  check: CheckState;
  /** Save a version (via the caller), then check it against the beats. */
  runCheck(saveVersion: () => Promise<{ id: number } | null>): Promise<void>;
  stopCheck(): void;
  dismissCheck(): void;
}

const IDLE_SUGGESTION: SuggestState = { status: "idle", proposal: null, error: null };
const IDLE_CHECK: CheckState = { status: "idle", partial: null, result: null, error: null };
const NO_BEATS: Beat[] = [];

// Suggestions and draft checks live outside the Beat Sheet, per script, for
// this tab: switching to Revision unmounts the sheet, and a paid request in
// flight keeps running and is shown (finished, stopped or failed) when the
// sheet comes back. Only Stop, Dismiss or a new request ends one.
interface BeatSession {
  suggestion?: SuggestState;
  check?: CheckState;
}
const sessions = new Map<number, BeatSession>();
const sessionListeners = new Set<() => void>();
/** Told when a finished check saved new beat statuses and anchors. */
const checkedListeners = new Set<(scriptId: number, beats: Beat[]) => void>();
const inflight = new Map<number, { suggest: AbortController | null; check: AbortController | null }>();
// Scripts that already auto-started a suggestion in this tab.
const autoSuggested = new Set<number>();

function setSession(scriptId: number, patch: { suggestion?: SuggestState | null; check?: CheckState | null }) {
  const entry = { ...sessions.get(scriptId) };
  if (patch.suggestion !== undefined) entry.suggestion = patch.suggestion ?? undefined;
  if (patch.check !== undefined) entry.check = patch.check ?? undefined;
  sessions.set(scriptId, entry);
  for (const listener of sessionListeners) listener();
}

function subscribeSessions(listener: () => void) {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

function slotsFor(scriptId: number) {
  let slots = inflight.get(scriptId);
  if (!slots) {
    slots = { suggest: null, check: null };
    inflight.set(scriptId, slots);
  }
  return slots;
}

async function startSuggestion(id: number) {
  const slots = slotsFor(id);
  slots.suggest?.abort();
  const controller = new AbortController();
  slots.suggest = controller;
  setSession(id, { suggestion: { status: "streaming", proposal: null, error: null } });

  let latest: PartialProposal | null = null;
  try {
    const final = await api.suggestBeats(
      id,
      (event) => {
        if (controller.signal.aborted || event.t !== "partial") return;
        latest = event.data as PartialProposal;
        setSession(id, { suggestion: { status: "streaming", proposal: latest, error: null } });
      },
      controller.signal
    );
    if (controller.signal.aborted) throw new DOMException("Stopped", "AbortError");
    setSession(id, { suggestion: { status: "done", proposal: final, error: null } });
  } catch (err) {
    if (slots.suggest !== controller) return; // a newer request replaced this one, or it was dismissed
    setSession(id, {
      suggestion: controller.signal.aborted
        ? { status: "stopped", proposal: latest, error: null }
        : { status: "error", proposal: latest, error: errorMessage(err) },
    });
  } finally {
    if (slots.suggest === controller) slots.suggest = null;
  }
}

async function startCheck(id: number, saveVersion: () => Promise<{ id: number } | null>) {
  const slots = slotsFor(id);
  slots.check?.abort();
  const controller = new AbortController();
  slots.check = controller;
  setSession(id, { check: { status: "saving", partial: null, result: null, error: null } });

  const stopped = () => setSession(id, { check: { ...IDLE_CHECK, status: "stopped" } });
  try {
    const version = await saveVersion();
    if (controller.signal.aborted) {
      if (slots.check === controller) stopped();
      return;
    }
    if (!version) throw new Error("Couldn't save a version of the draft to check.");
    setSession(id, { check: { status: "checking", partial: null, result: null, error: null } });

    const data = await api.checkBeats(
      id,
      version.id,
      (event) => {
        if (controller.signal.aborted || event.t !== "partial") return;
        setSession(id, { check: { status: "checking", partial: event.data as PartialCheck, result: null, error: null } });
      },
      controller.signal
    );
    if (controller.signal.aborted) throw new DOMException("Stopped", "AbortError");
    if (Array.isArray(data.beats)) for (const listener of checkedListeners) listener(id, data.beats);
    setSession(id, { check: { status: "done", partial: null, result: data.check, error: null } });
  } catch (err) {
    if (slots.check !== controller) return;
    if (controller.signal.aborted) stopped();
    else setSession(id, { check: { ...IDLE_CHECK, status: "error", error: errorMessage(err) } });
  } finally {
    if (slots.check === controller) slots.check = null;
  }
}

/** Abort a request and forget it (Dismiss): its catch sees it was replaced. */
function cancel(id: number, kind: "suggest" | "check") {
  const slots = slotsFor(id);
  const controller = slots[kind];
  slots[kind] = null;
  controller?.abort();
}

interface Tagged<T> {
  scriptId: number;
  value: T;
}

export function useBeats(scriptId: number | null, options: { autoSuggest?: boolean } = {}): BeatsController {
  const [list, setList] = useState<Tagged<Beat[]> | null>(null);
  const [loadError, setLoadError] = useState<Tagged<string> | null>(null);
  const [brief, setBrief] = useState<Tagged<BeatBrief> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const beats = list && list.scriptId === scriptId ? list.value : NO_BEATS;
  const currentLoadError = loadError && loadError.scriptId === scriptId ? loadError.value : null;
  const loading = scriptId !== null && (!list || list.scriptId !== scriptId) && !currentLoadError;
  const session = useSyncExternalStore(
    subscribeSessions,
    () => (scriptId === null ? undefined : sessions.get(scriptId)),
    () => undefined
  );
  const suggestion = session?.suggestion ?? IDLE_SUGGESTION;
  const check = session?.check ?? IDLE_CHECK;

  const setBeatsFor = useCallback((id: number, update: (beats: Beat[]) => Beat[]) => {
    setList((prev) => (prev && prev.scriptId === id ? { scriptId: id, value: update(prev.value) } : prev));
  }, []);

  // ---- suggestions -------------------------------------------------------

  const suggest = useCallback(async () => {
    if (scriptId !== null) await startSuggestion(scriptId);
  }, [scriptId]);

  const stopSuggest = useCallback(() => {
    if (scriptId !== null) inflight.get(scriptId)?.suggest?.abort();
  }, [scriptId]);

  const dismissSuggestion = useCallback(() => {
    if (scriptId === null) return;
    cancel(scriptId, "suggest");
    setSession(scriptId, { suggestion: null });
  }, [scriptId]);

  // ---- loading -----------------------------------------------------------

  const onBeatsLoaded = useEffectEvent((id: number, loaded: Beat[]) => {
    if (options.autoSuggest && loaded.length === 0 && !autoSuggested.has(id)) {
      autoSuggested.add(id);
      void suggest();
    }
  });

  useEffect(() => {
    if (scriptId === null) return;
    let cancelled = false;
    api.listBeats(scriptId).then(
      (loaded) => {
        if (cancelled) return;
        setList({ scriptId, value: sortBeats(loaded) });
        setLoadError(null);
        onBeatsLoaded(scriptId, loaded);
      },
      (err) => {
        if (!cancelled) setLoadError({ scriptId, value: errorMessage(err) });
      }
    );
    api.getScript(scriptId).then(
      (detail) => {
        if (cancelled) return;
        setBrief({
          scriptId,
          value: {
            targetWords: detail.script.targetLength ?? null,
            hasBrief: Boolean((detail.script.context ?? "").trim()),
          },
        });
      },
      () => {
        // Totals just go without a target.
      }
    );
    return () => {
      cancelled = true;
    };
  }, [scriptId, reloadKey]);

  // A check that finishes (even while the sheet was closed) saved beat statuses and anchors.
  useEffect(() => {
    if (scriptId === null) return;
    const id = scriptId;
    const onChecked = (checkedId: number, saved: Beat[]) => {
      if (checkedId === id) setBeatsFor(id, () => sortBeats(saved));
    };
    checkedListeners.add(onChecked);
    return () => {
      checkedListeners.delete(onChecked);
    };
  }, [scriptId, setBeatsFor]);

  const reload = useCallback(() => {
    setLoadError(null);
    setReloadKey((k) => k + 1);
  }, []);

  // ---- edits ---------------------------------------------------------------

  const create = useCallback(
    async (data: NewBeat): Promise<Beat | null> => {
      if (scriptId === null) return null;
      const id = scriptId;
      try {
        const created = await api.createBeat({
          scriptId: id,
          title: data.title.trim(),
          purpose: data.purpose?.trim() ?? "",
          targetSeconds: data.targetSeconds ?? null,
          source: data.source ?? "writer",
        });
        setBeatsFor(id, (prev) => sortBeats([...prev.filter((b) => b.id !== created.id), created]));
        return created;
      } catch (err) {
        setError(`Couldn't add the beat: ${errorMessage(err)}`);
        return null;
      }
    },
    [scriptId, setBeatsFor]
  );

  const update = useCallback(
    async (beatId: number, patch: BeatPatch) => {
      if (scriptId === null) return;
      const id = scriptId;
      const previous = beats.find((b) => b.id === beatId);
      if (!previous) return;
      setBeatsFor(id, (prev) => prev.map((b) => (b.id === beatId ? { ...b, ...patch } : b)));
      try {
        const saved = await api.updateBeat(beatId, patch);
        setBeatsFor(id, (prev) => prev.map((b) => (b.id === beatId ? { ...b, ...saved } : b)));
      } catch (err) {
        setBeatsFor(id, (prev) => prev.map((b) => (b.id === beatId ? previous : b)));
        setError(`Couldn't save the beat: ${errorMessage(err)}`);
      }
    },
    [scriptId, beats, setBeatsFor]
  );

  const remove = useCallback(
    async (beatId: number) => {
      if (scriptId === null) return;
      const id = scriptId;
      const previous = beats.find((b) => b.id === beatId);
      if (!previous) return;
      setBeatsFor(id, (prev) => prev.filter((b) => b.id !== beatId));
      try {
        await api.deleteBeat(beatId);
      } catch (err) {
        setBeatsFor(id, (prev) => sortBeats([...prev.filter((b) => b.id !== beatId), previous]));
        setError(`Couldn't delete the beat: ${errorMessage(err)}`);
      }
    },
    [scriptId, beats, setBeatsFor]
  );

  const reorder = useCallback(
    async (orderedIds: number[]) => {
      if (scriptId === null) return;
      const id = scriptId;
      const previous = beats;
      setBeatsFor(id, (prev) => orderBeats(prev, orderedIds));
      try {
        const saved = await api.reorderBeats(id, orderedIds);
        if (Array.isArray(saved)) setBeatsFor(id, () => sortBeats(saved));
      } catch (err) {
        setBeatsFor(id, () => previous);
        setError(`Couldn't reorder the beats: ${errorMessage(err)}`);
      }
    },
    [scriptId, beats, setBeatsFor]
  );

  const replaceAi = useCallback(
    async (items: Array<{ title: string; purpose: string; targetSeconds?: number | null }>) => {
      if (scriptId === null || items.length === 0) return false;
      const id = scriptId;
      try {
        const saved = await api.replaceAiBeats(
          id,
          items.map((item) => ({ title: item.title, purpose: item.purpose, targetSeconds: item.targetSeconds ?? null }))
        );
        const fresh = Array.isArray(saved) ? saved : await api.listBeats(id);
        setBeatsFor(id, () => sortBeats(fresh));
        return true;
      } catch (err) {
        setError(`Couldn't add the proposed beats: ${errorMessage(err)}`);
        return false;
      }
    },
    [scriptId, setBeatsFor]
  );

  // ---- draft check ---------------------------------------------------------

  const runCheck = useCallback(
    async (saveVersion: () => Promise<{ id: number } | null>) => {
      if (scriptId !== null) await startCheck(scriptId, saveVersion);
    },
    [scriptId]
  );

  const stopCheck = useCallback(() => {
    if (scriptId !== null) inflight.get(scriptId)?.check?.abort();
  }, [scriptId]);

  const dismissCheck = useCallback(() => {
    if (scriptId === null) return;
    cancel(scriptId, "check");
    setSession(scriptId, { check: null });
  }, [scriptId]);

  const clearError = useCallback(() => setError(null), []);

  return {
    beats,
    loading,
    loadError: currentLoadError,
    error,
    clearError,
    brief: brief && brief.scriptId === scriptId ? brief.value : null,
    reload,
    create,
    update,
    remove,
    reorder,
    replaceAi,
    suggestion,
    suggest,
    stopSuggest,
    dismissSuggestion,
    check,
    runCheck,
    stopCheck,
    dismissCheck,
  };
}
