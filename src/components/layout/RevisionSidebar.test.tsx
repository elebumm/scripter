import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CouncilController } from "@/hooks/useCouncil";
import type { NotesController } from "@/hooks/useNotes";
import { RevisionSidebar, StatusLine, type DraftStatus } from "./RevisionSidebar";

const STATUS: DraftStatus = { draftNumber: 4, saveState: "unsaved", spokenWords: 1203, runtime: "7:46", targetRuntime: "10:19" };

describe("StatusLine", () => {
  it("shows the draft status without being a live region (it changes on every word)", () => {
    const html = renderToStaticMarkup(<StatusLine status={STATUS} />);
    expect(html).toContain("Draft 4 · unsaved · 1,203 spoken words · ~7:46 of ~10:19 target");
    expect(html).not.toContain("aria-live");
    expect(html).not.toContain('role="status"');
  });
});

describe("RevisionSidebar", () => {
  const council = {
    personas: [],
    lenses: [],
    phase: "idle",
    isRunning: false,
    runId: null,
    runScopeLabel: "Whole script",
    synthesis: null,
    partialSynthesis: null,
    error: null,
    lastNotes: null,
    canRetrySynthesis: false,
    hasUnseen: false,
  } as unknown as CouncilController;
  const notes: NotesController = {
    notes: [],
    groups: { open: [], addressed: [], dismissed: [] },
    loading: false,
    error: "Failed to fetch",
    setStatus: async () => {},
    refresh: async () => {},
  };
  const render = (inert?: boolean) =>
    renderToStaticMarkup(
      <RevisionSidebar
        mode="revision"
        beatSheet={null}
        status={STATUS}
        council={council}
        inert={inert}
        onConsult={() => {}}
        onOpenSynthesis={() => {}}
        brief={{ context: "", onChange: () => {}, onCommit: () => {}, targetLength: null, onTargetLengthChange: () => {} }}
        notes={notes}
        activeNoteId={null}
        onSelectNote={() => {}}
        facts={null}
      />
    );

  it("leaves the tab order while the synthesis panel covers it (finding 31)", () => {
    expect(render(true)).toMatch(/<aside[^>]*inert=""[^>]*aria-hidden="true"/);
    expect(render(false)).not.toMatch(/<aside[^>]*inert/);
  });

  it("offers Try again when the notes can't load (finding 52)", () => {
    expect(render()).toContain("Try again");
  });
});
