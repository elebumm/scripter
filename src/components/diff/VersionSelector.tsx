"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ScriptVersion } from "@/types";

interface VersionSelectorProps {
  label: string;
  versions: ScriptVersion[];
  value: string | undefined;
  onChange: (value: string) => void;
}

export function VersionSelector({
  label,
  versions,
  value,
  onChange,
}: VersionSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-7 w-28 text-xs">
          <SelectValue placeholder="Version" />
        </SelectTrigger>
        <SelectContent>
          {versions.map((v) => (
            <SelectItem key={v.id} value={v.id.toString()}>
              v{v.version} ({v.wordCount} words)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
