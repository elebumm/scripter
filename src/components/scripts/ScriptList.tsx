"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/stores/app-store";
import type { ScriptWithTags, Tag } from "@/types";
import { FileText, HardDrive, Search } from "lucide-react";
import * as api from "@/lib/api";

interface ScriptListProps {
  onSelectScript: (id: number) => void;
}

export function ScriptList({ onSelectScript }: ScriptListProps) {
  const {
    scriptListOpen,
    setScriptListOpen,
    currentScriptId,
    scriptSearchQuery,
    setScriptSearchQuery,
    scriptFilterTagIds,
    toggleScriptFilterTag,
    scriptSortBy,
    setScriptSort,
  } = useAppStore();
  const [scripts, setScripts] = useState<ScriptWithTags[]>([]);

  useEffect(() => {
    if (scriptListOpen) {
      api.listScripts().then(setScripts).catch(() => {});
    }
  }, [scriptListOpen]);

  // Collect all unique tags from scripts
  const allTags = useMemo(() => {
    const tagMap = new Map<number, Tag>();
    for (const s of scripts) {
      for (const t of s.tags ?? []) {
        tagMap.set(t.id, t);
      }
    }
    return Array.from(tagMap.values());
  }, [scripts]);

  // Filter and sort
  const filteredScripts = useMemo(() => {
    let result = scripts;

    // Search by title
    if (scriptSearchQuery.trim()) {
      const q = scriptSearchQuery.toLowerCase();
      result = result.filter((s) => s.title.toLowerCase().includes(q));
    }

    // Filter by tags
    if (scriptFilterTagIds.length > 0) {
      result = result.filter((s) =>
        scriptFilterTagIds.every((tagId) =>
          (s.tags ?? []).some((t) => t.id === tagId)
        )
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      if (scriptSortBy === "title") {
        return a.title.localeCompare(b.title);
      }
      if (scriptSortBy === "status") {
        return (a.status ?? "draft").localeCompare(b.status ?? "draft");
      }
      // default: updatedAt desc
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return result;
  }, [scripts, scriptSearchQuery, scriptFilterTagIds, scriptSortBy]);

  return (
    <Sheet open={scriptListOpen} onOpenChange={setScriptListOpen}>
      <SheetContent side="left" className="w-80">
        <SheetHeader>
          <SheetTitle>Scripts</SheetTitle>
        </SheetHeader>

        {/* Search */}
        <div className="relative mt-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search scripts..."
            value={scriptSearchQuery}
            onChange={(e) => setScriptSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>

        {/* Tag filter chips */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {allTags.map((tag) => {
              const active = scriptFilterTagIds.includes(tag.id);
              return (
                <Badge
                  key={tag.id}
                  variant={active ? "default" : "outline"}
                  className="text-[10px] cursor-pointer"
                  onClick={() => toggleScriptFilterTag(tag.id)}
                >
                  {tag.color && (
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full mr-0.5"
                      style={{ backgroundColor: tag.color }}
                    />
                  )}
                  {tag.name}
                </Badge>
              );
            })}
          </div>
        )}

        {/* Sort */}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] text-muted-foreground">Sort:</span>
          <Select value={scriptSortBy} onValueChange={(v) => setScriptSort(v as "updatedAt" | "title" | "status")}>
            <SelectTrigger className="h-6 text-[10px] w-auto gap-1 border-none bg-transparent px-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updatedAt">Recently Modified</SelectItem>
              <SelectItem value="title">Title A-Z</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="h-[calc(100vh-12rem)] mt-2">
          <div className="space-y-2 pr-2">
            {filteredScripts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                {scripts.length === 0
                  ? "No scripts yet. Create one to get started."
                  : "No scripts match your filters."}
              </p>
            )}
            {filteredScripts.map((script) => (
              <Card
                key={script.id}
                className={`cursor-pointer transition-colors hover:bg-accent ${
                  script.id === currentScriptId ? "border-primary" : ""
                }`}
                onClick={() => {
                  onSelectScript(script.id);
                  setScriptListOpen(false);
                }}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    {script.source === "file" ? (
                      <HardDrive className="h-4 w-4 mt-0.5 text-blue-400" />
                    ) : (
                      <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {script.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px]">
                          v{script.currentVersion}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(script.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      {(script.tags ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {script.tags.map((tag) => (
                            <Badge
                              key={tag.id}
                              variant="secondary"
                              className="text-[9px] px-1.5 py-0"
                            >
                              {tag.color && (
                                <span
                                  className="inline-block h-1.5 w-1.5 rounded-full mr-0.5"
                                  style={{ backgroundColor: tag.color }}
                                />
                              )}
                              {tag.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
