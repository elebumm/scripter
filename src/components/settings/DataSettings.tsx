"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, FolderDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import * as api from "@/lib/api";

type ExportState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; folder: string; scripts: number }
  | { status: "error"; message: string };

interface DataSettingsProps {
  paths: { dbPath: string; backupsDir: string } | null;
  loading: boolean;
  error: string | null;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Path copied");
  } catch {
    toast.error("Couldn't copy to the clipboard");
  }
}

function PathRow({ id, label, path, hint, copyLabel }: { id: string; label: string; path: string; hint?: string; copyLabel: string }) {
  return (
    <div className="space-y-1.5">
      <p
        id={`${id}-label`}
        className="text-[11px] font-semibold tracking-wider uppercase text-stone-600"
        style={{ fontFamily: "var(--font-inter)" }}
      >
        {label}
      </p>
      <div className="flex items-center gap-2">
        <code
          id={id}
          className="min-w-0 flex-1 truncate rounded-lg bg-stone-100 px-3 py-2 font-mono text-xs text-stone-800"
          title={path}
        >
          {path}
        </code>
        <Button variant="ghost" size="icon-sm" aria-label={copyLabel} onClick={() => void copy(path)}>
          <Copy aria-hidden="true" />
        </Button>
      </div>
      {hint && <p className="text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

export function DataSettings({ paths, loading, error }: DataSettingsProps) {
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });

  const exportAll = async () => {
    setExportState({ status: "running" });
    try {
      const result = await api.exportAll();
      setExportState({ status: "done", folder: result.folder, scripts: result.scripts });
    } catch (err) {
      setExportState({ status: "error", message: err instanceof Error ? err.message : "Unknown error" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void exportAll()} disabled={exportState.status === "running"}>
            <FolderDown aria-hidden="true" />
            {exportState.status === "running" ? "Exporting…" : "Export all scripts"}
          </Button>
          <p className="text-sm text-stone-500">
            Writes every script as Markdown (draft, versions, notes and beats) into a dated folder.
          </p>
        </div>
        <div aria-live="polite">
          {exportState.status === "done" && (
            <PathRow
              id="settings-export-folder"
              label={`Exported ${exportState.scripts} ${exportState.scripts === 1 ? "script" : "scripts"} to`}
              path={exportState.folder}
              copyLabel="Copy export folder path"
            />
          )}
          {exportState.status === "error" && (
            <p role="alert" className="text-sm text-red-700">
              Export failed: {exportState.message}
            </p>
          )}
        </div>
      </div>

      {loading && !paths ? (
        <div className="space-y-3" aria-hidden="true">
          <Skeleton className="h-9 rounded-lg bg-stone-100" />
          <Skeleton className="h-9 rounded-lg bg-stone-100" />
        </div>
      ) : paths ? (
        <div className="space-y-4">
          <PathRow id="settings-db-path" label="Database" path={paths.dbPath} copyLabel="Copy database path" />
          <PathRow
            id="settings-backups-dir"
            label="Backups folder"
            path={paths.backupsDir}
            copyLabel="Copy backups folder path"
            hint="A snapshot of the database is taken once a day; the newest 14 are kept."
          />
        </div>
      ) : (
        <p role="alert" className="text-sm text-stone-700">
          Couldn&apos;t read the data locations{error ? `: ${error}` : "."}
        </p>
      )}
    </div>
  );
}
