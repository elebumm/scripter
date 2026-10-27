"use client";

import { ArrowLeft } from "lucide-react";

interface MinimalHeaderProps {
  version?: number | null;
  saveStatus: "saving" | "unsaved" | "saved";
  onBack: () => void;
}

export function MinimalHeader({ version, saveStatus, onBack }: MinimalHeaderProps) {
  const statusText =
    saveStatus === "saving"
      ? "SAVING..."
      : saveStatus === "unsaved"
        ? "UNSAVED CHANGES"
        : "SAVED";

  return (
    <header className="fixed top-0 left-0 w-full p-4 flex items-center justify-between z-40">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-slate-400 hover:text-slate-600 transition-colors"
        style={{ fontFamily: "var(--font-space-grotesk)" }}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        PROJECT OVERVIEW
      </button>
      <span
        className="text-xs font-semibold tracking-wider uppercase text-slate-400"
        style={{ fontFamily: "var(--font-space-grotesk)" }}
      >
        {version != null ? `DRAFT ${version}` : "DRAFT"} — {statusText}
      </span>
    </header>
  );
}
