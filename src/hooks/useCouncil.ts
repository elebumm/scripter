"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { errorMessage } from "@/lib/stream/ndjson";
import { droppedNotesNotice } from "@/components/evaluation/view-model";
import type { Persona, LensState, NoteDropReason, Synthesis } from "@/types";
import type { SynthesisOutput } from "@/lib/llm/schemas";

export type CouncilPhase = "idle" | "critiquing" | "synthesizing" | "done" | "error";

/** Longest section the critique route accepts (its `sectionOnly` limit). */
export const MAX_SECTION_CHARS = 20_000;

/** A past run to synthesize again (from History, after a reload). */
export type SynthesisTarget = Pick<Synthesis, "runId" | "versionId" | "lenses">;

export interface CouncilController {
  /** All personas, by position (from api.listPersonas). */
  personas: Persona[];
  /** Active personas' live state for the current/last run this session, persona order. */
  lenses: LensState[];
  phase: CouncilPhase;
  /** phase is critiquing or synthesizing */
  isRunning: boolean;
  /** Id of the current/last run this session (null before the first one). */
  runId: string | null;
  /** "Whole script" or the reviewed section's label, for the current/last run. */
  runScopeLabel: string;
  /** Latest persisted synthesis (loaded on mount; replaced by a run's final). */
  synthesis: Synthesis | null;
  /** While synthesizing. */
  partialSynthesis: Partial<SynthesisOutput> | null;
  error: string | null;
  /** Notes the last synthesis this session saved and dropped (server checks). */
  lastNotes: {
    runId: string;
    saved: number;
    dropped: number;
    dropReasons?: Partial<Record<NoteDropReason, number>>;
    previousKept?: number;
  } | null;
  /** The current run has finished lenses but no saved synthesis (failed or stopped). */
  canRetrySynthesis: boolean;
  /** A run finished since the panel was last opened. */
  hasUnseen: boolean;
  markSeen(): void;
  /** Saves a version first (deps.saveVersion); does nothing if that returns null. */
  start(opts?: { sectionOnly?: string; scopeLabel?: string }): Promise<void>;
  /** Aborts every in-flight request (critiques + synthesis). */
  stop(): void;
  /** Re-runs one failed lens with the same runId, then re-synthesizes. */
  retryLens(personaId: number): Promise<void>;
  /**
   * Synthesizes the current run again from its saved critiques (no lens is
   * re-run), or `target`, a whole-script run picked from History.
   */
  retrySynthesis(target?: SynthesisTarget): Promise<void>;
  setPersonaActive(personaId: number, active: boolean): Promise<void>;
  refresh(): Promise<void>;
}

export interface CouncilDeps {
  saveVersion: () => Promise<{ id: number } | null>;
  /** Called after a synthesis saved notes. */
  onNotesChanged: () => void;
}

interface RunContext {
  runId: string;
  versionId: number;
  sectionOnly?: string;
  /** Persona ids whose critique completed in this run. */
  completed: Set<number>;
}

const WHOLE_SCRIPT = "Whole script";
const LOAD_ERROR = "Couldn't load the council";

/** "Section: “The first few words…”" when the caller gave no label. */
function sectionLabel(text: string): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  return `Section: “${words.slice(0, 7).join(" ")}${words.length > 7 ? "…" : ""}”`;
}

function idleLens(p: Persona): LensState {
  return {
    personaId: p.id,
    personaSlug: p.slug,
    personaName: p.name,
    modelName: p.modelName,
    status: "idle",
    critique: null,
  };
}

/** Live lens states for a saved run (History), matched to personas by slug. */
function lensesFromRun(target: SynthesisTarget, personas: Persona[]): { lenses: LensState[]; completed: Set<number> } {
  const completed = new Set<number>();
  const lenses = target.lenses.map((l, i): LensState => {
    // Lenses whose persona is gone get a negative id: shown, never retried.
    const personaId = personas.find((p) => p.slug === l.personaSlug)?.id ?? -(i + 1);
    if (l.status === "complete") completed.add(personaId);
    return {
      personaId,
      personaSlug: l.personaSlug,
      personaName: l.personaName,
      modelName: l.modelName,
      status: l.status,
      critique: l.critique,
      error: l.error,
      evaluationId: l.evaluationId,
    };
  });
  return { lenses, completed };
}

/**
 * Runs the council: every active persona critiques the saved version in
 * parallel (each in isolation, its model always known), then the
 * synthesizer merges whatever finished. One AbortController per run, so Stop
 * cancels everything in flight.
 */
export function useCouncil(scriptId: number | null, deps: CouncilDeps): CouncilController {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [runLenses, setRunLenses] = useState<LensState[] | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runScopeLabel, setRunScopeLabel] = useState(WHOLE_SCRIPT);
  const [phase, setPhase] = useState<CouncilPhase>("idle");
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);
  const [partialSynthesis, setPartialSynthesis] = useState<Partial<SynthesisOutput> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastNotes, setLastNotes] = useState<CouncilController["lastNotes"]>(null);
  const [hasUnseen, setHasUnseen] = useState(false);

  const depsRef = useRef(deps);
  const runRef = useRef<RunContext | null>(null);
  /** The first persona load, so a consult made before it settles can wait for it. */
  const personasLoadRef = useRef<Promise<Persona[]> | null>(null);
  /** Synchronous guard: a second start/retry while one is being set up is ignored. */
  const busyRef = useRef(false);
  const controllersRef = useRef(new Set<AbortController>());

  useEffect(() => {
    depsRef.current = deps;
  });

  useEffect(() => {
    if (scriptId == null) return;
    let cancelled = false;
    const load = api.listPersonas();
    personasLoadRef.current = load;
    load
      .then((list) => {
        if (!cancelled) setPersonas(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(`${LOAD_ERROR}: ${errorMessage(err)}`);
      });
    api
      .getLatestSynthesis(scriptId)
      .then((s) => {
        if (!cancelled) setSynthesis(s);
      })
      .catch(() => {
        // No synthesis yet, or the server is down; the panel shows its empty state.
      });
    return () => {
      cancelled = true;
    };
  }, [scriptId]);

  // Leaving the page cancels whatever is still running.
  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      for (const c of controllers) c.abort();
      controllers.clear();
    };
  }, []);

  const lenses = useMemo(
    () => runLenses ?? personas.filter((p) => p.isActive).map(idleLens),
    [runLenses, personas]
  );

  const updateLens = useCallback((personaId: number, patch: Partial<LensState>) => {
    setRunLenses((list) => list?.map((l) => (l.personaId === personaId ? { ...l, ...patch } : l)) ?? list);
  }, []);

  /**
   * The roster for a consult: the loaded personas, else the first load (still
   * in flight or failed, then tried once more). Null after telling the writer
   * why the council isn't available.
   */
  const loadRoster = useCallback(async (): Promise<Persona[] | null> => {
    if (personas.length > 0) return personas;
    try {
      const pending = personasLoadRef.current ?? api.listPersonas();
      const list = await pending.catch(() => api.listPersonas());
      setPersonas(list);
      // The first load's error no longer applies.
      setError((current) => (current?.startsWith(LOAD_ERROR) ? null : current));
      return list;
    } catch (err) {
      const message = `${LOAD_ERROR}: ${errorMessage(err)}`;
      setError(message);
      toast.error(message);
      return null;
    }
  }, [personas]);

  const runLens = useCallback(
    async (persona: Persona, ctx: RunContext, signal: AbortSignal): Promise<boolean> => {
      if (scriptId == null) return false;
      updateLens(persona.id, { status: "pending", critique: null, error: undefined });
      try {
        const { critique, meta } = await api.streamCritique(
          {
            scriptId,
            versionId: ctx.versionId,
            personaId: persona.id,
            runId: ctx.runId,
            sectionOnly: ctx.sectionOnly,
          },
          (event) => {
            if (event.t === "partial") updateLens(persona.id, { status: "streaming", critique: event.data });
          },
          signal
        );
        ctx.completed.add(persona.id);
        updateLens(persona.id, {
          status: "complete",
          critique,
          error: undefined,
          evaluationId: meta?.evaluationId,
          costUsd: meta?.costUsd ?? undefined,
          durationMs: meta?.durationMs,
        });
        return true;
      } catch (err) {
        ctx.completed.delete(persona.id);
        updateLens(persona.id, { status: "error", error: signal.aborted ? "Stopped" : errorMessage(err) });
        return false;
      }
    },
    [scriptId, updateLens]
  );

  const synthesize = useCallback(
    async (ctx: RunContext, signal: AbortSignal) => {
      if (scriptId == null) return;
      setPhase("synthesizing");
      setPartialSynthesis(null);
      try {
        const { synthesis: result, meta } = await api.streamSynthesis(
          { scriptId, versionId: ctx.versionId, runId: ctx.runId },
          (event) => {
            if (event.t === "partial") setPartialSynthesis(event.data);
          },
          signal
        );
        const notes = {
          saved: meta?.notesSaved ?? 0,
          dropped: meta?.notesDropped ?? 0,
          dropReasons: meta?.dropReasons,
          previousKept: meta?.previousNotesKept,
        };
        setSynthesis(result);
        setLastNotes({ runId: ctx.runId, ...notes });
        setPartialSynthesis(null);
        setError(null);
        setPhase("done");
        setHasUnseen(true);
        depsRef.current.onNotesChanged();
        const notice = notes.saved === 0 ? droppedNotesNotice(notes) : null;
        if (notice) toast.warning(notice.title, { description: notice.detail });
      } catch (err) {
        setPartialSynthesis(null);
        if (signal.aborted) {
          // The run keeps its finished lenses; canRetrySynthesis offers the synthesis again.
          setPhase("idle");
          return;
        }
        const message = `The synthesis failed: ${errorMessage(err)}`;
        setError(message);
        setPhase("error");
        toast.error(message);
      }
    },
    [scriptId]
  );

  /** Runs `job` with a fresh controller registered for stop()/unmount. */
  const withController = useCallback(async (job: (signal: AbortSignal) => Promise<void>) => {
    const controller = new AbortController();
    controllersRef.current.add(controller);
    try {
      await job(controller.signal);
    } finally {
      controllersRef.current.delete(controller);
    }
  }, []);

  const start = useCallback(
    async (opts?: { sectionOnly?: string; scopeLabel?: string }) => {
      if (scriptId == null || busyRef.current) return;
      const sectionOnly = opts?.sectionOnly?.trim() || undefined;
      if (sectionOnly && sectionOnly.length > MAX_SECTION_CHARS) {
        toast.error("That section is too long to review on its own. Review the whole script instead.");
        return;
      }
      busyRef.current = true;
      try {
        const roster = await loadRoster();
        if (!roster) return;
        const active = roster.filter((p) => p.isActive);
        if (active.length === 0) {
          toast.error("Turn on at least one council member first.");
          return;
        }

        const version = await depsRef.current.saveVersion();
        if (!version) return;

        const ctx: RunContext = {
          runId: crypto.randomUUID(),
          versionId: version.id,
          sectionOnly,
          completed: new Set(),
        };
        runRef.current = ctx;
        setRunId(ctx.runId);
        setRunScopeLabel(sectionOnly ? opts?.scopeLabel || sectionLabel(sectionOnly) : WHOLE_SCRIPT);
        setError(null);
        setPartialSynthesis(null);
        setRunLenses(active.map((p) => ({ ...idleLens(p), status: "pending" })));
        setPhase("critiquing");

        await withController(async (signal) => {
          await Promise.all(active.map((p) => runLens(p, ctx, signal)));
          if (signal.aborted) {
            setPhase("idle");
            return;
          }
          if (ctx.completed.size === 0) {
            const message = "No council member finished. Check each lens's error and retry.";
            setError(message);
            setPhase("error");
            toast.error(message);
            return;
          }
          await synthesize(ctx, signal);
        });
      } finally {
        busyRef.current = false;
      }
    },
    [scriptId, loadRoster, runLens, synthesize, withController]
  );

  const stop = useCallback(() => {
    for (const c of controllersRef.current) c.abort();
  }, []);

  const retryLens = useCallback(
    async (personaId: number) => {
      const ctx = runRef.current;
      const persona = personas.find((p) => p.id === personaId);
      if (!ctx || !persona || busyRef.current) return;
      busyRef.current = true;
      try {
        setError(null);
        setPhase("critiquing");
        await withController(async (signal) => {
          await runLens(persona, ctx, signal);
          if (signal.aborted) {
            setPhase("idle");
            return;
          }
          if (ctx.completed.size === 0) {
            setPhase("error");
            setError("No council member finished yet.");
            return;
          }
          await synthesize(ctx, signal);
        });
      } finally {
        busyRef.current = false;
      }
    },
    [personas, runLens, synthesize, withController]
  );

  const retrySynthesis = useCallback(
    async (target?: SynthesisTarget) => {
      if (scriptId == null || busyRef.current) return;
      let ctx = runRef.current;
      if (target && ctx?.runId !== target.runId) {
        const { lenses: restored, completed } = lensesFromRun(target, personas);
        ctx = { runId: target.runId, versionId: target.versionId, completed };
        if (completed.size === 0) return;
        runRef.current = ctx;
        setRunId(ctx.runId);
        setRunScopeLabel(WHOLE_SCRIPT);
        setRunLenses(restored);
      }
      if (!ctx || ctx.completed.size === 0) return;
      const run = ctx;
      busyRef.current = true;
      try {
        setError(null);
        await withController((signal) => synthesize(run, signal));
      } finally {
        busyRef.current = false;
      }
    },
    [scriptId, personas, synthesize, withController]
  );

  const setPersonaActive = useCallback(async (personaId: number, active: boolean) => {
    setPersonas((list) => list.map((p) => (p.id === personaId ? { ...p, isActive: active } : p)));
    try {
      const saved = await api.updatePersona(personaId, { isActive: active });
      setPersonas((list) => list.map((p) => (p.id === personaId ? saved : p)));
    } catch (err) {
      setPersonas((list) => list.map((p) => (p.id === personaId ? { ...p, isActive: !active } : p)));
      toast.error(`Couldn't update the council: ${errorMessage(err)}`);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (scriptId == null) return;
    const [list, latest] = await Promise.allSettled([api.listPersonas(), api.getLatestSynthesis(scriptId)]);
    if (list.status === "fulfilled") {
      setPersonas(list.value);
      setError((current) => (current?.startsWith(LOAD_ERROR) ? null : current));
    }
    if (latest.status === "fulfilled") setSynthesis(latest.value);
  }, [scriptId]);

  const markSeen = useCallback(() => setHasUnseen(false), []);

  const isRunning = phase === "critiquing" || phase === "synthesizing";
  const canRetrySynthesis =
    !isRunning &&
    runId !== null &&
    synthesis?.runId !== runId &&
    (runLenses?.some((l) => l.status === "complete") ?? false);

  return {
    personas,
    lenses,
    phase,
    isRunning,
    runId,
    runScopeLabel,
    synthesis,
    partialSynthesis,
    error,
    lastNotes,
    canRetrySynthesis,
    hasUnseen,
    markSeen,
    start,
    stop,
    retryLens,
    retrySynthesis,
    setPersonaActive,
    refresh,
  };
}
