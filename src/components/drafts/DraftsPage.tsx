"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { FolderOpen, Clock, Archive, Settings, Plus, Search, MoreVertical } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScriptIcon } from "./ScriptIcon";
import * as api from "@/lib/api";
import type { ScriptWithTags } from "@/types";

type SidebarFilter = "all" | "recent" | "archive";

interface DraftsPageProps {
  onSelectScript: (id: number) => void;
  onNewScript: () => void;
  onDeleteScript?: (id: number) => void;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks !== 1 ? "s" : ""} ago`;
}

function ScriptCard({
  script,
  onSelect,
  onDelete,
}: {
  script: ScriptWithTags;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex flex-col">
      {/* Icon preview area */}
      <button
        onClick={onSelect}
        className="h-48 rounded-2xl overflow-hidden hover:shadow-md transition-shadow border border-stone-100/60"
      >
        <ScriptIcon icon={script.icon} title={script.title} size={56} />
      </button>

      {/* Title + meta */}
      <div className="flex items-start justify-between mt-3 px-1">
        <button onClick={onSelect} className="text-left flex-1 min-w-0">
          <h3
            className="text-sm font-bold text-stone-800 truncate"
            style={{ fontFamily: "var(--font-cabinet)" }}
          >
            {script.title}
          </h3>
          <p
            className="text-[10px] font-semibold tracking-wider uppercase text-stone-400 mt-0.5"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            Last edited {timeAgo(script.updatedAt)}
          </p>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 text-stone-300 hover:text-stone-500 transition-colors shrink-0">
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onSelect}>Open</DropdownMenuItem>
            {onDelete && (
              <DropdownMenuItem
                className="text-red-500"
                onClick={onDelete}
              >
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function NewScriptCard({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex flex-col">
      <button
        onClick={onClick}
        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-200 h-48 hover:border-stone-300 hover:bg-stone-50/50 transition-all"
      >
        <div className="w-14 h-14 rounded-full bg-stone-100 flex items-center justify-center mb-3">
          <Plus className="h-6 w-6 text-stone-400" />
        </div>
        <span
          className="text-sm font-semibold text-stone-600 italic"
          style={{ fontFamily: "var(--font-cabinet)" }}
        >
          Begin a New Story
        </span>
        <span
          className="text-[11px] text-stone-400 mt-1"
          style={{ fontFamily: "var(--font-switzer)" }}
        >
          The canvas is waiting for your words.
        </span>
      </button>
    </div>
  );
}

const SIDEBAR_NAV = [
  { id: "all" as const, label: "ALL PROJECTS", icon: FolderOpen },
  { id: "recent" as const, label: "RECENT", icon: Clock },
  { id: "archive" as const, label: "ARCHIVE", icon: Archive },
];

export function DraftsPage({ onSelectScript, onNewScript, onDeleteScript }: DraftsPageProps) {
  const [scripts, setScripts] = useState<ScriptWithTags[]>([]);
  const [filter, setFilter] = useState<SidebarFilter>("all");
  const [search, setSearch] = useState("");
  const backfillTriggered = useRef(false);

  // Load scripts
  useEffect(() => {
    api.listScripts().then(setScripts).catch(() => {});
  }, []);

  // Auto-backfill icons for scripts that don't have one
  useEffect(() => {
    if (backfillTriggered.current || scripts.length === 0) return;
    const missingIcons = scripts.some((s) => !s.icon);
    if (missingIcons) {
      backfillTriggered.current = true;
      api.backfillIcons().then((result) => {
        if (result.updated > 0) {
          // Reload scripts to get updated icons
          api.listScripts().then(setScripts).catch(() => {});
        }
      }).catch(() => {});
    }
  }, [scripts]);

  const filteredScripts = useMemo(() => {
    let result = scripts;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((s) => s.title.toLowerCase().includes(q));
    }

    if (filter === "recent") {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      result = result.filter((s) => new Date(s.updatedAt).getTime() > weekAgo);
    }

    return result;
  }, [scripts, filter, search]);

  const scriptCount = filteredScripts.length;
  const countText =
    scriptCount === 0
      ? "No projects yet."
      : scriptCount === 1
        ? "One project resting in the silence."
        : `${scriptCount} projects resting in the silence.`;

  return (
    <div className="h-screen bg-[#f9f9f9] flex">
      {/* Left sidebar */}
      <aside className="w-56 shrink-0 flex flex-col pt-10 px-6">
        <div className="mb-10">
          <h1
            className="text-base font-bold text-stone-900 tracking-tight"
            style={{ fontFamily: "var(--font-cabinet)" }}
          >
            Sanctuary
          </h1>
          <p
            className="text-[10px] font-semibold tracking-widest uppercase text-stone-400 mt-1"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            Scriptwriter&apos;s Studio
          </p>
        </div>

        <nav className="space-y-1">
          {SIDEBAR_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = filter === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setFilter(item.id)}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-colors ${
                  isActive
                    ? "bg-white text-stone-800 shadow-sm"
                    : "text-stone-400 hover:text-stone-600 hover:bg-white/50"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span
                  className="text-xs font-medium tracking-wider"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}

          <button
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left text-stone-400 hover:text-stone-600 hover:bg-white/50 transition-colors"
          >
            <Settings className="h-4 w-4" />
            <span
              className="text-xs font-medium tracking-wider"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              SETTINGS
            </span>
          </button>
        </nav>

        <div className="mt-auto pb-10">
          <button
            onClick={onNewScript}
            className="w-full rounded-2xl bg-stone-800 px-5 py-3 text-xs font-semibold tracking-wider uppercase text-white hover:bg-stone-900 transition-colors"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            New Script
          </button>
        </div>
      </aside>

      {/* Main content */}
      <ScrollArea className="flex-1">
        <div className="px-10 pt-10 pb-16 max-w-[960px]">
          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h2
                className="text-4xl font-bold text-stone-900"
                style={{ fontFamily: "var(--font-cabinet)" }}
              >
                Your Sanctuary
              </h2>
              <p
                className="text-sm text-stone-400 mt-2"
                style={{ fontFamily: "var(--font-switzer)" }}
              >
                {countText}
              </p>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search manuscripts..."
                className="h-10 w-56 rounded-xl bg-stone-200/60 pl-10 pr-4 text-sm text-stone-600 placeholder:text-stone-400 outline-none focus:ring-2 focus:ring-stone-300 transition-shadow"
                style={{ fontFamily: "var(--font-switzer)" }}
              />
            </div>
          </div>

          {/* Script grid */}
          <div className="grid grid-cols-3 gap-6">
            {filteredScripts.map((script) => (
              <ScriptCard
                key={script.id}
                script={script}
                onSelect={() => onSelectScript(script.id)}
                onDelete={onDeleteScript ? () => onDeleteScript(script.id) : undefined}
              />
            ))}

            {/* New script card */}
            <NewScriptCard onClick={onNewScript} />
          </div>
        </div>

        {/* Footer */}
        <footer className="px-10 pb-8 flex items-center justify-between text-[11px] text-stone-300 max-w-[960px]">
          <div className="flex items-center gap-6">
            <span>Privacy Protocol</span>
            <span>Editorial Guidelines</span>
            <span>Cloud Sync: Active</span>
          </div>
          <span
            className="tracking-wider uppercase"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            Zen Canvas
          </span>
        </footer>
      </ScrollArea>
    </div>
  );
}
