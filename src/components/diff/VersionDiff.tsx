"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VersionSelector } from "./VersionSelector";
import { computeLineDiff } from "@/lib/utils/diff";
import type { ScriptVersion } from "@/types";
import type { Change } from "diff";

interface VersionDiffProps {
  versions: ScriptVersion[];
}

export function VersionDiff({ versions }: VersionDiffProps) {
  const [leftId, setLeftId] = useState<string>("");
  const [rightId, setRightId] = useState<string>("");
  const [changes, setChanges] = useState<Change[]>([]);

  useEffect(() => {
    if (versions.length >= 2) {
      setLeftId(versions[1].id.toString());
      setRightId(versions[0].id.toString());
    }
  }, [versions]);

  useEffect(() => {
    if (!leftId || !rightId) return;
    const left = versions.find((v) => v.id.toString() === leftId);
    const right = versions.find((v) => v.id.toString() === rightId);
    if (left && right) {
      const result = computeLineDiff(left.content, right.content);
      setChanges(result.changes);
    }
  }, [leftId, rightId, versions]);

  if (versions.length < 2) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Need at least 2 versions to compare
      </div>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="py-3 px-4 flex-row items-center gap-4 space-y-0">
        <CardTitle className="text-sm font-medium">Version Diff</CardTitle>
        <VersionSelector
          label="From"
          versions={versions}
          value={leftId}
          onChange={setLeftId}
        />
        <VersionSelector
          label="To"
          versions={versions}
          value={rightId}
          onChange={setRightId}
        />
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <div className="p-4 font-mono text-xs space-y-0">
            {changes.map((change, i) => (
              <pre
                key={i}
                className={`whitespace-pre-wrap px-2 py-0.5 ${
                  change.added
                    ? "bg-green-500/10 text-green-400"
                    : change.removed
                    ? "bg-red-500/10 text-red-400 line-through"
                    : "text-muted-foreground"
                }`}
              >
                {change.added ? "+ " : change.removed ? "- " : "  "}
                {change.value}
              </pre>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
