"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, RotateCcw, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { CouncilController } from "@/hooks/useCouncil";
import { useRuns } from "@/hooks/useRuns";
import { useTrends } from "@/hooks/useTrends";
import { LiveProgress } from "./LiveProgress";
import { RunHistory } from "./RunHistory";
import { SynthesisView } from "./SynthesisView";
import { TrendsChart } from "./TrendsChart";
import { useNow } from "./useNow";
import { useFocusHandoff } from "./useFocusHandoff";
import { SectionLabel } from "./ScoreBits";
import { canSynthesizeRun, droppedNotesNotice } from "./view-model";

/** The parts of the council controller the panel reads. */
export type SynthesisPanelCouncil = Pick<
  CouncilController,
  | "personas"
  | "lenses"
  | "phase"
  | "isRunning"
  | "runId"
  | "synthesis"
  | "partialSynthesis"
  | "error"
  | "lastNotes"
  | "canRetrySynthesis"
  | "hasUnseen"
  | "markSeen"
  | "start"
  | "stop"
  | "retryLens"
  | "retrySynthesis"
>;

interface SynthesisPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scriptId: number;
  council: SynthesisPanelCouncil;
}

type Tab = "synthesis" | "history" | "trends";

/** Radix surfaces that sit above the panel and own Esc while open. */
const OPEN_SURFACE_SELECTOR =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]';

export function SynthesisPanel({ open, onOpenChange, scriptId, council }: SynthesisPanelProps) {
  const [tab, setTab] = useState<Tab>("synthesis");
  const now = useNow();
  const panelRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // A new run always brings the Synthesis tab forward (adjusting state during
  // render, not in an effect).
  const [wasRunning, setWasRunning] = useState(council.isRunning);
  if (wasRunning !== council.isRunning) {
    setWasRunning(council.isRunning);
    if (council.isRunning) setTab("synthesis");
  }

  // Opening moves focus into the panel; closing hands it back to whatever
  // opened it, unless the writer has already moved focus elsewhere.
  useFocusHandoff(open, headingRef, panelRef);

  // Esc closes the panel only when it's the topmost surface: dialogs, menus
  // and popovers handle Esc first (Radix calls preventDefault) and window
  // listeners run after document ones.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector(OPEN_SURFACE_SELECTOR)) return;
      onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const { markSeen, hasUnseen } = council;
  useEffect(() => {
    if (open && hasUnseen) markSeen();
  }, [open, hasUnseen, markSeen]);

  const refreshKey = council.synthesis?.summaryId ?? null;
  const runs = useRuns(scriptId, { enabled: open && tab === "history", refreshKey });
  const trends = useTrends(scriptId, { enabled: open && tab === "trends", refreshKey });

  // Failed lenses can be retried from the synthesis view only when it shows
  // this session's run: a retry continues that run, on its version. A lens
  // whose persona is gone (negative id, restored from History) can't be.
  const showsCurrentRun = council.runId !== null && council.synthesis?.runId === council.runId;
  const retrySlugs = useMemo(
    () =>
      showsCurrentRun
        ? new Set(council.lenses.filter((l) => l.status === "error" && l.personaId > 0).map((l) => l.personaSlug))
        : new Set<string>(),
    [showsCurrentRun, council.lenses]
  );
  const personaIdBySlug = useMemo(() => new Map(council.personas.map((p) => [p.slug, p.id])), [council.personas]);
  // The saved synthesis carries its note report (also after a reload); older
  // ones don't, so this session's last run falls back to the stream's counts.
  const noteReport =
    council.synthesis?.noteReport ??
    (showsCurrentRun && council.lastNotes?.runId === council.runId ? council.lastNotes : null);
  const notesNotice = noteReport ? droppedNotesNotice(noteReport) : null;

  const consult = () => {
    void council.start().catch(() => undefined);
  };
  const retry = (personaId: number) => {
    void council.retryLens(personaId).catch(() => undefined);
  };
  const retrySynthesis = () => {
    void council.retrySynthesis().catch(() => undefined);
  };

  const ranThisSession = council.lenses.some((l) => l.status !== "idle");
  const showLive = council.isRunning || ((council.phase === "error" || council.canRetrySynthesis) && ranThisSession);
  const partialOverview = typeof council.partialSynthesis?.overview === "string" ? council.partialSynthesis.overview : null;

  // History can write the missing synthesis of the newest run (e.g. one that
  // failed before a reload).
  const selected = runs.selectedRun;
  const canSynthesizeSelected = canSynthesizeRun(selected, runs.runs[0], council.synthesis?.runId ?? null);

  return (
    <aside
      ref={panelRef}
      role="complementary"
      aria-label="Synthesis"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "glass-panel fixed bottom-4 right-4 top-[4.5rem] z-40 flex w-[min(440px,calc(100vw-2rem))] flex-col ring-1 ring-stone-200/80",
        "motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out",
        open ? "translate-x-0" : "pointer-events-none translate-x-[calc(100%+2rem)]"
      )}
      style={{ fontFamily: "var(--font-switzer)" }}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 px-5 pb-2 pt-4">
        <div className="flex items-center gap-2.5">
          <MessageSquare className="h-5 w-5 text-stone-600" aria-hidden="true" />
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="rounded text-base font-semibold text-stone-900 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
            style={{ fontFamily: "var(--font-cabinet)" }}
          >
            Synthesis
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full text-stone-600 hover:bg-stone-100 hover:text-stone-900"
          onClick={() => onOpenChange(false)}
          aria-label="Close synthesis"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList variant="line" className="mx-4 h-9 w-auto shrink-0 justify-start gap-4 border-b border-stone-200 px-1">
          <TabsTrigger value="synthesis" className="flex-none px-0 text-stone-600 data-[state=active]:text-stone-900">
            Synthesis
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-none px-0 text-stone-600 data-[state=active]:text-stone-900">
            History
          </TabsTrigger>
          <TabsTrigger value="trends" className="flex-none px-0 text-stone-600 data-[state=active]:text-stone-900">
            Trends
          </TabsTrigger>
        </TabsList>

        <TabsContent value="synthesis" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="px-4 py-4">
              {council.error && !council.isRunning && (
                <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
                  {council.error}
                </p>
              )}
              {showLive ? (
                <div className="space-y-6">
                  <LiveProgress
                    lenses={council.lenses}
                    phase={council.phase}
                    isRunning={council.isRunning}
                    partialOverview={partialOverview}
                    onStop={() => council.stop()}
                    onRetry={retry}
                    onRetrySynthesis={council.canRetrySynthesis ? retrySynthesis : undefined}
                  />
                  {!council.isRunning && council.synthesis && (
                    <section className="space-y-3 border-t border-stone-200 pt-4" aria-label="Last saved synthesis">
                      <SectionLabel>Last saved synthesis</SectionLabel>
                      <SynthesisView synthesis={council.synthesis} now={now} />
                    </section>
                  )}
                </div>
              ) : council.synthesis ? (
                <div className="space-y-4">
                  {notesNotice && (
                    <div role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
                      <p className="font-semibold">{notesNotice.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed">{notesNotice.detail}</p>
                    </div>
                  )}
                  <SynthesisView
                    synthesis={council.synthesis}
                    now={now}
                    retry={{
                      slugs: retrySlugs,
                      disabled: council.isRunning,
                      onRetry: (slug) => {
                        const id = personaIdBySlug.get(slug);
                        if (id != null) retry(id);
                      },
                    }}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100">
                    <Users className="h-5 w-5 text-stone-600" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-semibold text-stone-900">The council hasn&apos;t read this script yet</p>
                  <p className="text-xs leading-relaxed text-stone-600">
                    Each lens reads your draft on its own, scores it and leaves notes on your own words. The synthesis
                    brings them together here. Nothing in your script is changed.
                  </p>
                  <Button className="mt-1 gap-2 rounded-xl" onClick={consult} disabled={council.isRunning}>
                    <Users className="h-4 w-4" aria-hidden="true" />
                    Consult the council
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="history" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="px-4 py-4">
              <RunHistory
                runs={runs.runs}
                loading={runs.loading}
                error={runs.error}
                onReload={runs.reload}
                selectedRunId={runs.selectedRunId}
                onSelect={runs.selectRun}
                selectedRun={runs.selectedRun}
                runLoading={runs.runLoading}
                runError={runs.runError}
                latestRunId={council.synthesis?.runId ?? null}
                now={now}
                synthesize={
                  canSynthesizeSelected && selected
                    ? { disabled: council.isRunning, onSynthesize: () => void council.retrySynthesis(selected).catch(() => undefined) }
                    : undefined
                }
              />
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="trends" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="px-4 py-4">
              <TrendsChart points={trends.points} loading={trends.loading} error={trends.error} onReload={trends.reload} />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <footer className="shrink-0 border-t border-stone-200/80 px-4 py-3">
        <Button
          onClick={consult}
          disabled={council.isRunning}
          variant="outline"
          className="w-full gap-2 rounded-xl border-stone-300 bg-white text-stone-800 hover:bg-stone-50 hover:text-stone-900"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {council.isRunning ? "The council is reading…" : council.synthesis ? "Consult again" : "Consult the council"}
        </Button>
        <p className="mt-1.5 text-center text-[11px] text-stone-500">Reviews the whole script</p>
      </footer>
    </aside>
  );
}
