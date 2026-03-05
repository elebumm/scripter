"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, X } from "lucide-react";
import type { Tag } from "@/types";
import * as api from "@/lib/api";

interface TagEditorProps {
  scriptId: number;
  tags: Tag[];
  onTagsChange: (tags: Tag[]) => void;
}

export function TagEditor({ scriptId, tags, onTagsChange }: TagEditorProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [search, setSearch] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => {
    if (popoverOpen) {
      api.listTags().then(setAllTags).catch(() => {});
    }
  }, [popoverOpen]);

  const handleAddTag = useCallback(
    async (tag: Tag) => {
      if (tags.some((t) => t.id === tag.id)) return;
      await api.addScriptTag(scriptId, tag.id);
      onTagsChange([...tags, tag]);
    },
    [scriptId, tags, onTagsChange]
  );

  const handleRemoveTag = useCallback(
    async (tagId: number) => {
      await api.setScriptTags(
        scriptId,
        tags.filter((t) => t.id !== tagId).map((t) => t.id)
      );
      onTagsChange(tags.filter((t) => t.id !== tagId));
    },
    [scriptId, tags, onTagsChange]
  );

  const handleCreateAndAdd = useCallback(
    async (name: string) => {
      const tag = await api.createTagApi(name.trim());
      await api.addScriptTag(scriptId, tag.id);
      onTagsChange([...tags, tag]);
      setSearch("");
      setAllTags((prev) => [...prev, tag]);
    },
    [scriptId, tags, onTagsChange]
  );

  const filteredTags = allTags.filter(
    (t) =>
      !tags.some((existing) => existing.id === t.id) &&
      t.name.toLowerCase().includes(search.toLowerCase())
  );

  const showCreate =
    search.trim() &&
    !allTags.some((t) => t.name.toLowerCase() === search.trim().toLowerCase());

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {tags.map((tag) => (
        <Badge
          key={tag.id}
          variant="secondary"
          className="text-[10px] gap-0.5 pr-1"
        >
          {tag.color && (
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
          )}
          {tag.name}
          <button
            onClick={() => handleRemoveTag(tag.id)}
            className="ml-0.5 hover:text-destructive"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </Badge>
      ))}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-5 w-5">
            <Plus className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2" align="start">
          <Input
            placeholder="Search or create tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs mb-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && showCreate) {
                handleCreateAndAdd(search);
              }
            }}
          />
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {filteredTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => {
                  handleAddTag(tag);
                  setPopoverOpen(false);
                }}
                className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent flex items-center gap-1.5"
              >
                {tag.color && (
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                )}
                {tag.name}
              </button>
            ))}
            {showCreate && (
              <button
                onClick={() => handleCreateAndAdd(search)}
                className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent text-primary"
              >
                + Create &ldquo;{search.trim()}&rdquo;
              </button>
            )}
            {filteredTags.length === 0 && !showCreate && (
              <p className="text-[10px] text-muted-foreground text-center py-2">
                No tags found
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
