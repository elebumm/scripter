"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { buildExportMarkdown, downloadMarkdown } from "@/lib/utils/export";

interface ExportMenuProps {
  title: string;
  content: string;
  modelStates: Record<string, { modelName: string; text: string }>;
  masterSummaryText: string;
}

export function ExportMenu({
  title,
  content,
  modelStates,
  masterSummaryText,
}: ExportMenuProps) {
  const hasResults =
    Object.values(modelStates).some((s) => s.text) || masterSummaryText;

  const handleExportFull = () => {
    const evaluations = Object.values(modelStates)
      .filter((s) => s.text)
      .map((s) => ({ modelName: s.modelName, result: s.text }));

    const md = buildExportMarkdown({
      title,
      content,
      evaluations,
      masterSummary: masterSummaryText || undefined,
    });

    downloadMarkdown(`${title || "script"}-evaluation.md`, md);
  };

  const handleExportScript = () => {
    downloadMarkdown(`${title || "script"}.md`, content);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Download className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExportScript}>
          Export Script Only
        </DropdownMenuItem>
        {hasResults && (
          <DropdownMenuItem onClick={handleExportFull}>
            Export Script + Evaluations
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
