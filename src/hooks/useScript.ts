"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { errorMessage } from "@/lib/stream/ndjson";
import type { Script, ScriptVersion } from "@/types";

/** Autosave delay for the draft (I06: drafts autosave, versions never change). */
export const DRAFT_SAVE_DELAY_MS = 2000;
const META_SAVE_DELAY_MS = 800;

export type DraftSaveState = "saved" | "unsaved" | "saving" | "error";

export interface SavedVersion {
  id: number;
  version: number;
  /** False when the draft matched the latest version and no row was added. */
  created: boolean;
}

export interface ScriptController {
  script: Script | null;
  latestVersion: ScriptVersion | null;
  loading: boolean;
  loadError: string | null;
  /** The editor text (the autosaved draft). */
  content: string;
  setContent: (markdown: string) => void;
  title: string;
  setTitle: (title: string) => void;
  /** Save the title now (on blur / Enter). */
  commitTitle: () => void;
  /** The writer's brief (scripts.context). */
  context: string;
  setContext: (context: string) => void;
  commitContext: () => void;
  saveState: DraftSaveState;
  /**
   * "Draft n": the latest version number when the draft matches it, else the
   * number the draft would get as the next version.
   */
  draftNumber: number;
  /**
   * Snapshot the draft as an immutable version (Ctrl/Cmd+S, and before every
   * council run, beat check and fact-check). Returns null when there is
   * nothing to save or saving failed (a toast says why; `quiet` skips the
   * "nothing to save" toast).
   */
  saveVersion: (opts?: { quiet?: boolean }) => Promise<SavedVersion | null>;
}

interface Loaded {
  script: Script;
  latestVersion: ScriptVersion | null;
  content: string;
  title: string;
  context: string;
  saver: DraftSaver;
}

/** Field-level debounced saver for title/context. */
function useDebouncedField(save: (value: string) => Promise<void>) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const saveRef = useRef(save);

  useEffect(() => {
    saveRef.current = save;
  });

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const value = pending.current;
    pending.current = null;
    if (value !== null) void saveRef.current(value);
  }, []);

  const schedule = useCallback(
    (value: string) => {
      pending.current = value;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, META_SAVE_DELAY_MS);
    },
    [flush]
  );

  // Flush on unmount so a title typed just before leaving is kept.
  useEffect(() => flush, [flush]);

  return { schedule, flush };
}

/** Delay before retrying a failed autosave: 3 s, 6 s, 12 s, 24 s, then every 30 s. */
export function autosaveRetryDelay(failures: number): number {
  return Math.min(30_000, 3_000 * 2 ** Math.max(0, failures - 1));
}

/** Worth retrying on its own: the server was unreachable or failed. A 4xx won't change by waiting. */
function isRetryable(err: unknown): boolean {
  return !(err instanceof api.ApiError) || err.status >= 500 || err.status === 408 || err.status === 429;
}

export interface DraftSaverDeps {
  /** Store the draft (PATCH draftContent). */
  write: (markdown: string) => Promise<unknown>;
  /** The tab is closing: send the draft with a keepalive request. False when it couldn't be sent. */
  writeOnUnload: (markdown: string) => boolean;
  /** A write failed. `first` is true for the first failure in a row. */
  onFailure?: (err: unknown, first: boolean, retrying: boolean) => void;
  /** Everything is saved again after failures. */
  onRecovered?: () => void;
}

/**
 * Autosaves one script's draft: the latest text is written 2 s after the last
 * change, one write at a time. After a failed write the text stays pending and
 * is retried with backoff. A saver outlives the revision page, so leaving the
 * page right after typing (or while the server is down) can't drop the text,
 * and reopening the script picks up text that isn't saved yet.
 */
export class DraftSaver {
  state: DraftSaveState = "saved";
  /** The writer's latest text. */
  latest: string;
  /** The last text the server confirmed. */
  private saved: string;
  /** Text waiting for the debounce or a retry (null when nothing is waiting). */
  private pending: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Writes run one after another, so an older draft never lands last. */
  private chain: Promise<void> = Promise.resolve();
  /** Writes queued or in flight. */
  private writes = 0;
  /** Failed writes in a row (0 once a write lands). */
  private failures = 0;
  private readonly listeners = new Set<() => void>();
  private readonly deps: DraftSaverDeps;

  constructor(initial: string, deps: DraftSaverDeps) {
    this.latest = initial;
    this.saved = initial;
    this.deps = deps;
  }

  /**
   * True while the server may not end up with the writer's latest text: it
   * differs from what was confirmed, or a write is still on its way (one the
   * writer has since undone counts too).
   */
  get hasUnsaved(): boolean {
    return this.latest !== this.saved || this.writes > 0;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The writer changed the text: write it after the debounce. */
  change(markdown: string): void {
    this.latest = markdown;
    this.pending = markdown;
    this.setState("unsaved");
    this.schedule(DRAFT_SAVE_DELAY_MS);
  }

  /** Write the waiting text now (leaving the page). Resolves when the queued writes settle. */
  flush(): Promise<void> {
    this.clearTimer();
    const markdown = this.pending;
    this.pending = null;
    if (markdown !== null) this.write(markdown);
    return this.chain;
  }

  /** The script was opened again while text is unsaved: try again soon. */
  resume(): void {
    if (!this.hasUnsaved || this.timer !== null) return;
    this.pending ??= this.latest;
    this.schedule(DRAFT_SAVE_DELAY_MS);
  }

  /**
   * The tab is closing: send unsaved text with a keepalive request. True when
   * the browser should ask before leaving: nothing could be sent, or the last
   * write failed and this one most likely will too.
   */
  unload(): boolean {
    if (!this.hasUnsaved) return false;
    const sent = this.deps.writeOnUnload(this.latest);
    return !sent || this.failures > 0;
  }

  private write(markdown: string): void {
    this.writes++;
    this.chain = this.chain.then(async () => {
      // Compared when the write runs: an earlier write may have changed `saved`.
      if (markdown !== this.saved) {
        this.setState("saving");
        try {
          await this.deps.write(markdown);
          this.saved = markdown;
        } catch (err) {
          this.writes--;
          this.failures++;
          // Keep the newest text for the retry, unless newer text is already waiting.
          this.pending ??= this.latest;
          const retrying = isRetryable(err);
          this.setState("error");
          this.deps.onFailure?.(err, this.failures === 1, retrying);
          if (retrying && this.timer === null) this.schedule(autosaveRetryDelay(this.failures));
          return;
        }
        if (this.failures > 0) {
          this.failures = 0;
          this.deps.onRecovered?.();
        }
      }
      this.writes--;
      this.setState(this.hasUnsaved ? "unsaved" : "saved");
    });
  }

  private schedule(delay: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private setState(state: DraftSaveState): void {
    if (state === this.state) return;
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

const AUTOSAVE_TOAST = "autosave-error";

/** One saver per script for the life of the tab. */
const savers = new Map<number, DraftSaver>();

/**
 * The draft saver for a script that just loaded. A saver from an earlier
 * visit that still holds unsaved text is kept: its text is newer than what
 * the server returned.
 */
export function draftSaverFor(scriptId: number, loaded: string, deps?: DraftSaverDeps): DraftSaver {
  const existing = savers.get(scriptId);
  if (existing?.hasUnsaved) {
    existing.resume();
    return existing;
  }
  const saver = new DraftSaver(loaded, deps ?? {
    write: (markdown) => api.updateScript(scriptId, { draftContent: markdown }),
    writeOnUnload: (markdown) => api.saveDraftOnUnload(scriptId, markdown),
    onFailure: (err, first, retrying) => {
      if (!first) return;
      toast.error(`Autosave failed: ${errorMessage(err)}`, {
        id: AUTOSAVE_TOAST,
        description: retrying ? "Your text is kept here and saved as soon as the server answers." : undefined,
      });
    },
    onRecovered: () => toast.dismiss(AUTOSAVE_TOAST),
  });
  savers.set(scriptId, saver);
  guardUnload();
  return saver;
}

let unloadGuarded = false;

/**
 * Closing or reloading the tab sends every unsaved draft with a keepalive
 * request, and asks first when one can't be sent or autosave is failing.
 * Registered once, so it still covers a draft left behind by in-app navigation.
 */
function guardUnload(): void {
  if (unloadGuarded || typeof window === "undefined") return;
  unloadGuarded = true;
  window.addEventListener("beforeunload", (e) => {
    let ask = false;
    for (const saver of savers.values()) {
      if (saver.unload()) ask = true;
    }
    if (ask) e.preventDefault();
  });
}

/**
 * One script on the revision page. The editor works on the draft
 * (scripts.draft_content), autosaved 2 s after the last keystroke and written
 * at once when leaving (see DraftSaver). Versions are only ever created by
 * saveVersion().
 */
export function useScript(scriptId: number): ScriptController {
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastSavedTitle = useRef("");
  const lastSavedContext = useRef("");

  useEffect(() => {
    let cancelled = false;
    api
      .getScript(scriptId)
      .then((detail) => {
        if (cancelled) return;
        const saver = draftSaverFor(scriptId, detail.content);
        lastSavedTitle.current = detail.script.title;
        lastSavedContext.current = detail.script.context ?? "";
        setData({
          script: detail.script,
          latestVersion: detail.latestVersion,
          content: saver.latest,
          title: detail.script.title,
          context: detail.script.context ?? "",
          saver,
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [scriptId]);

  const saver = data?.saver ?? null;

  const subscribe = useCallback((onChange: () => void) => saver?.subscribe(onChange) ?? (() => {}), [saver]);
  const saveState = useSyncExternalStore<DraftSaveState>(
    subscribe,
    () => saver?.state ?? "saved",
    () => "saved"
  );

  // Leaving the page (in-app navigation) writes the waiting text at once;
  // the saver keeps retrying after that if it fails.
  useEffect(() => {
    if (!saver) return;
    return () => void saver.flush();
  }, [saver]);

  const setContent = useCallback(
    (markdown: string) => {
      saver?.change(markdown);
      setData((d) => (d ? { ...d, content: markdown } : d));
    },
    [saver]
  );

  const { schedule: scheduleTitle, flush: commitTitle } = useDebouncedField(
    useCallback(
      async (value: string) => {
        if (value === lastSavedTitle.current) return;
        try {
          const saved = await api.updateScript(scriptId, { title: value });
          lastSavedTitle.current = value;
          setData((d) => (d ? { ...d, script: { ...d.script, title: saved.title, updatedAt: saved.updatedAt } } : d));
        } catch (err) {
          toast.error(`Couldn't save the title: ${errorMessage(err)}`);
        }
      },
      [scriptId]
    )
  );

  const { schedule: scheduleContext, flush: commitContext } = useDebouncedField(
    useCallback(
      async (value: string) => {
        if (value === lastSavedContext.current) return;
        try {
          await api.updateScript(scriptId, { context: value });
          lastSavedContext.current = value;
        } catch (err) {
          toast.error(`Couldn't save the brief: ${errorMessage(err)}`);
        }
      },
      [scriptId]
    )
  );

  const setTitle = useCallback(
    (value: string) => {
      setData((d) => (d ? { ...d, title: value } : d));
      scheduleTitle(value);
    },
    [scheduleTitle]
  );

  const setContext = useCallback(
    (value: string) => {
      setData((d) => (d ? { ...d, context: value } : d));
      scheduleContext(value);
    },
    [scheduleContext]
  );

  const saveVersion = useCallback(async (opts?: { quiet?: boolean }): Promise<SavedVersion | null> => {
    const markdown = saver?.latest ?? "";
    if (!markdown.trim()) {
      if (!opts?.quiet) toast("Write something first. There's nothing to save yet.");
      return null;
    }
    try {
      const { version, created } = await api.saveVersion(scriptId, markdown);
      setData((d) =>
        d ? { ...d, latestVersion: version, script: { ...d.script, currentVersion: version.version } } : d
      );
      return { id: version.id, version: version.version, created };
    } catch (err) {
      toast.error(`Couldn't save a version: ${errorMessage(err)}`);
      return null;
    }
  }, [scriptId, saver]);

  const content = data?.content ?? "";
  const latestVersion = data?.latestVersion ?? null;
  const draftNumber = latestVersion
    ? content === latestVersion.content
      ? latestVersion.version
      : latestVersion.version + 1
    : 1;

  return {
    script: data?.script ?? null,
    latestVersion,
    loading: data === null && loadError === null,
    loadError,
    content,
    setContent,
    title: data?.title ?? "",
    setTitle,
    commitTitle,
    context: data?.context ?? "",
    setContext,
    commitContext,
    saveState,
    draftNumber,
    saveVersion,
  };
}
