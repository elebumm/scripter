// Server-render checks for the Version history sheet: the writer can always
// save the current draft as a version from here (Ctrl+S is held by the open
// sheet), and the restore copy matches what restoring does.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ScriptVersion } from "@/types";

const versionsState = vi.hoisted(() => ({ versions: [] as ScriptVersion[] }));

vi.mock("@/hooks/useVersions", () => ({
  useVersions: () => ({
    versions: versionsState.versions,
    loading: false,
    refreshing: false,
    error: null,
    reload: () => {},
  }),
}));
vi.mock("@/hooks/useRuns", () => ({ useRuns: () => ({ runs: [] }) }));

const { VersionTimeline } = await import("./VersionTimeline");

function version(n: number, content: string): ScriptVersion {
  return {
    id: n * 10,
    scriptId: 1,
    version: n,
    content,
    wordCount: content.split(/\s+/).length,
    createdAt: "2026-10-27 10:00:00",
  };
}

function render(currentContent: string, versions: ScriptVersion[]) {
  versionsState.versions = versions;
  return renderToStaticMarkup(
    <VersionTimeline scriptId={1} currentContent={currentContent} onRestore={() => {}} onSaveVersion={async () => {}} />
  );
}

function saveButton(html: string): string | undefined {
  return html.match(/<button[^>]*>(?:(?!<\/button>).)*Save current draft as a version<\/button>/)?.[0];
}

describe("VersionTimeline", () => {
  it("offers a save control (with the shortcut) when there are no versions yet", () => {
    const html = render("My first words.", []);
    expect(html).toContain("No saved versions yet");
    expect(html).toContain("Ctrl+S");
    const button = saveButton(html);
    expect(button).toBeDefined();
    expect(button).not.toContain('disabled=""');
  });

  it("disables saving an empty draft", () => {
    const button = saveButton(render("   ", []));
    expect(button).toContain('disabled=""');
  });

  it("offers to save a draft that is in no saved version", () => {
    const html = render("Words I haven't saved.", [version(2, "Second."), version(1, "First.")]);
    expect(html).toContain("isn&#x27;t saved as a version yet");
    expect(saveButton(html)).toBeDefined();
  });

  it("doesn't ask to save a draft an older version already holds", () => {
    const html = render("First.", [version(2, "Second."), version(1, "First.")]);
    expect(saveButton(html)).toBeUndefined();
  });
});
