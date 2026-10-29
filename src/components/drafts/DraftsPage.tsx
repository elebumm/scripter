"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, Clock, FolderOpen, Plus, RotateCw, Search, Settings } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { useWordsPerMinute } from "@/components/settings/use-words-per-minute";
import * as api from "@/lib/api";
import type { ScriptSummary } from "@/lib/api";
import { downloadMarkdown } from "@/lib/utils/export";
import { ScriptCard } from "./ScriptCard";
import { useScriptList } from "./useScriptList";
import {
  countLabel,
  displayTitle,
  emptyState,
  exportFilename,
  filterScripts,
  headingFor,
  headingTitle,
  writerTitle,
  type DraftsFilter,
} from "./drafts-utils";

const FILTERS: Array<{ id: DraftsFilter; label: string; icon: typeof FolderOpen }> = [
  { id: "all", label: "ALL DRAFTS", icon: FolderOpen },
  { id: "recent", label: "RECENT", icon: Clock },
  { id: "archive", label: "ARCHIVE", icon: Archive },
];

const NAV_ITEM =
  "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-600";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

interface DraftsPageProps {
  onNewScript: () => void;
}

export function DraftsPage({ onNewScript }: DraftsPageProps) {
  const router = useRouter();
  const wordsPerMinute = useWordsPerMinute();
  const [filter, setFilter] = useState<DraftsFilter>("all");
  const [search, setSearch] = useState("");
  // Kept after the dialog closes so its title doesn't change mid-animation.
  const [deleteTarget, setDeleteTarget] = useState<ScriptSummary | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tick, setTick] = useState(0);

  const archivedView = filter === "archive";
  const list = useScriptList(archivedView);

  // Keep "edited 3 minutes ago" fresh without reading the clock during render.
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const now = Math.max(list.loadedAt ?? 0, tick);

  const visible = useMemo(
    () => filterScripts(list.scripts, { filter, search, now }),
    [list.scripts, filter, search, now]
  );

  const openScript = useCallback((id: number) => router.push(`/script/${id}`), [router]);

  const exportScript = useCallback(async (script: ScriptSummary) => {
    try {
      const detail = await api.getScript(script.id);
      if (!detail.content.trim()) {
        toast.info("Nothing to export yet: this script is empty.");
        return;
      }
      downloadMarkdown(exportFilename(writerTitle(detail.script.title) || headingTitle(script.heading), script.id), detail.content);
    } catch (err) {
      toast.error(`Couldn't export the script: ${errorText(err)}`);
    }
  }, []);

  const { reload, removeLocally } = list;

  const setArchived = useCallback(
    async (script: ScriptSummary, archived: boolean) => {
      const title = displayTitle(script.title, script.heading);
      removeLocally(script.id);
      try {
        await api.updateScript(script.id, { archived });
      } catch (err) {
        toast.error(`Couldn't ${archived ? "archive" : "unarchive"} “${title}”: ${errorText(err)}`);
        reload();
        return;
      }
      reload();
      if (archived) {
        toast(`Archived “${title}”`, {
          action: {
            label: "Undo",
            onClick: () => {
              api
                .updateScript(script.id, { archived: false })
                .then(reload)
                .catch((err: unknown) => toast.error(`Couldn't undo: ${errorText(err)}`));
            },
          },
        });
      } else {
        toast.success(`“${title}” is back in your scripts`);
      }
    },
    [reload, removeLocally]
  );

  const confirmDelete = useCallback(async () => {
    const script = deleteTarget;
    if (!script) return;
    setDeleteOpen(false);
    try {
      await api.deleteScript(script.id);
      removeLocally(script.id);
      toast.success(`Deleted “${displayTitle(script.title, script.heading)}”`);
    } catch (err) {
      toast.error(`Couldn't delete the script: ${errorText(err)}`);
    }
    reload();
  }, [deleteTarget, reload, removeLocally]);

  const empty = emptyState(filter, search, list.scripts.length);

  return (
    <div className="h-screen bg-[#f9f9f9] flex">
      <aside className="w-56 shrink-0 flex flex-col pt-10 px-6">
        <div className="mb-10">
          <h1
            className="text-base font-bold text-stone-900 tracking-tight"
            style={{ fontFamily: "var(--font-cabinet)" }}
          >
            Scripter
          </h1>
        </div>

        <nav aria-label="Scripts" className="space-y-1">
          {FILTERS.map((item) => {
            const Icon = item.icon;
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(item.id)}
                className={`${NAV_ITEM} ${
                  active ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800 hover:bg-white/60"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-medium tracking-wider" style={{ fontFamily: "var(--font-inter)" }}>
                  {item.label}
                </span>
              </button>
            );
          })}

          <Link href="/settings" className={`${NAV_ITEM} text-stone-500 hover:text-stone-800 hover:bg-white/60`}>
            <Settings className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-medium tracking-wider" style={{ fontFamily: "var(--font-inter)" }}>
              SETTINGS
            </span>
          </Link>
        </nav>

        <div className="mt-auto pb-10">
          <button
            type="button"
            onClick={onNewScript}
            className="w-full rounded-2xl bg-stone-800 px-5 py-3 text-xs font-semibold tracking-wider uppercase text-white hover:bg-stone-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-600 focus-visible:ring-offset-2"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            New script
          </button>
        </div>
      </aside>

      <ScrollArea className="flex-1">
        <main className="px-10 pt-10 pb-16 max-w-[960px]">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div>
              <h2 className="text-4xl font-bold text-stone-900" style={{ fontFamily: "var(--font-cabinet)" }}>
                {headingFor(filter)}
              </h2>
              <p className="text-sm text-stone-500 mt-2" style={{ fontFamily: "var(--font-switzer)" }} aria-live="polite">
                {list.status === "ready" ? countLabel(filter, visible.length) : list.status === "loading" ? "Loading…" : " "}
              </p>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search scripts…"
                aria-label="Search scripts by title or headline"
                className="h-10 w-56 rounded-xl bg-stone-200/60 pl-10 pr-4 text-sm text-stone-700 placeholder:text-stone-600 outline-none focus-visible:ring-2 focus-visible:ring-stone-600 transition-shadow"
                style={{ fontFamily: "var(--font-switzer)" }}
              />
            </div>
          </div>

          {list.status === "loading" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-3">
                  <Skeleton className="h-40 rounded-2xl bg-stone-200/60" />
                  <Skeleton className="h-4 w-2/3 bg-stone-200/60" />
                  <Skeleton className="h-3 w-1/2 bg-stone-200/60" />
                </div>
              ))}
            </div>
          )}

          {list.status === "error" && (
            <div role="alert" className="rounded-2xl border border-stone-200 bg-white p-8 max-w-lg">
              <h3 className="text-base font-bold text-stone-900" style={{ fontFamily: "var(--font-cabinet)" }}>
                Couldn&apos;t load your scripts
              </h3>
              <p className="text-sm text-stone-600 mt-2 break-words" style={{ fontFamily: "var(--font-switzer)" }}>
                {list.error}
              </p>
              <button
                type="button"
                onClick={list.reload}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-stone-800 px-4 py-2 text-xs font-semibold tracking-wider uppercase text-white hover:bg-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-600 focus-visible:ring-offset-2"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                Try again
              </button>
            </div>
          )}

          {list.status === "ready" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {visible.map((script) => (
                <ScriptCard
                  key={script.id}
                  script={script}
                  now={now}
                  wordsPerMinute={wordsPerMinute}
                  archived={archivedView}
                  onOpen={() => openScript(script.id)}
                  onExport={() => void exportScript(script)}
                  onArchive={() => void setArchived(script, true)}
                  onUnarchive={() => void setArchived(script, false)}
                  onDelete={() => {
                    setDeleteTarget(script);
                    setDeleteOpen(true);
                  }}
                />
              ))}

              {visible.length === 0 && (
                <div className="sm:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-stone-300 px-8 py-12 text-center">
                  <h3 className="text-lg font-bold text-stone-800" style={{ fontFamily: "var(--font-cabinet)" }}>
                    {empty.title}
                  </h3>
                  <p className="text-sm text-stone-500 mt-1" style={{ fontFamily: "var(--font-switzer)" }}>
                    {empty.body}
                  </p>
                  {empty.showCreate && (
                    <button
                      type="button"
                      onClick={onNewScript}
                      className="mt-5 inline-flex items-center gap-2 rounded-xl bg-stone-800 px-4 py-2 text-xs font-semibold tracking-wider uppercase text-white hover:bg-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-600 focus-visible:ring-offset-2"
                      style={{ fontFamily: "var(--font-inter)" }}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Start your first script
                    </button>
                  )}
                </div>
              )}

              {!archivedView && list.scripts.length > 0 && (
                <button
                  type="button"
                  onClick={onNewScript}
                  className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 h-40 text-stone-600 hover:border-stone-400 hover:bg-white/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-600"
                >
                  <span className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mb-2">
                    <Plus className="h-5 w-5 text-stone-500" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-cabinet)" }}>
                    New script
                  </span>
                </button>
              )}
            </div>
          )}
        </main>
      </ScrollArea>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete “${displayTitle(deleteTarget?.title, deleteTarget?.heading)}” permanently?`}
        description="This removes the script with every saved version, council run, note, beat and fact-check. It can't be undone."
        confirmLabel="Delete permanently"
        variant="destructive"
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
