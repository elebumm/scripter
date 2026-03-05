"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const isMac =
  typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "Cmd" : "Ctrl";

const sections = [
  {
    title: "File",
    shortcuts: [
      { keys: `${mod}+N`, label: "New Script" },
      { keys: `${mod}+O`, label: "Open File" },
      { keys: `${mod}+S`, label: "Save Version" },
      { keys: `${mod}+Shift+S`, label: "Save As" },
    ],
  },
  {
    title: "Script",
    shortcuts: [
      { keys: `${mod}+Enter`, label: "Evaluate" },
      { keys: `${mod}+Shift+X`, label: "Abort Evaluation" },
      { keys: `${mod}+L`, label: "Toggle Script List" },
    ],
  },
  {
    title: "View",
    shortcuts: [
      { keys: `${mod}+1`, label: "Rich Text Mode" },
      { keys: `${mod}+2`, label: "Markdown Mode" },
    ],
  },
  {
    title: "Editor",
    shortcuts: [
      { keys: `${mod}+B`, label: "Bold" },
      { keys: `${mod}+I`, label: "Italic" },
      { keys: `${mod}+Shift+S`, label: "Strikethrough" },
      { keys: `${mod}+E`, label: "Inline Code" },
      { keys: `${mod}+K`, label: "Insert Link" },
      { keys: `${mod}+Z`, label: "Undo" },
      { keys: `${mod}+Shift+Z`, label: "Redo" },
    ],
  },
];

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {sections.map((section) => (
            <div key={section.title}>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                {section.title}
              </h3>
              <div className="space-y-1.5">
                {section.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.keys}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">
                      {shortcut.label}
                    </span>
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
