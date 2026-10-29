// Council sidebar pieces: who raised a note, the notes list when a refresh
// fails, the section-review limit, and the roster's run controls.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CouncilController } from "@/hooks/useCouncil";
import { MAX_SECTION_CHARS } from "@/hooks/useCouncil";
import type { NoteGroups } from "@/hooks/useNotes";
import type { NoteWithAnchor, Persona } from "@/types";
import { lensChipsForNote, LensChips } from "./lens-chips";
import { NotesList } from "./NotesList";
import { sectionHint } from "./ConsultButton";
import { CouncilRoster } from "./CouncilRoster";

function persona(id: number, slug: string, name: string, modelName: string): Persona {
  return {
    id,
    slug,
    name,
    description: "",
    systemPrompt: "",
    criteriaWeights: {},
    modelSlug: "m",
    modelName,
    icon: null,
    color: null,
    isActive: true,
    position: id,
  };
}

// Script Doctor has since moved to DeepSeek; both lenses ran Claude when the note was raised.
const PERSONAS = [
  persona(1, "story-architect", "Story Architect", "Claude Sonnet 5.5"),
  persona(2, "script-doctor", "Script Doctor", "DeepSeek V4 Pro"),
];

describe("lensChipsForNote", () => {
  it("credits the model each lens ran, never the persona's current model", () => {
    const aligned = lensChipsForNote({ personaSlugs: ["story-architect", "script-doctor"], sourceModels: ["Claude Sonnet 5.5", "Claude Sonnet 5.5"] }, PERSONAS);
    expect(aligned.map((c) => [c.persona, c.model])).toEqual([
      ["Story Architect", "Claude Sonnet 5.5"],
      ["Script Doctor", "Claude Sonnet 5.5"],
    ]);

    // Older notes stored the models deduplicated: one model means every lens ran it.
    const deduped = lensChipsForNote({ personaSlugs: ["story-architect", "script-doctor"], sourceModels: ["Claude Sonnet 5.5"] }, PERSONAS);
    expect(deduped.map((c) => c.model)).toEqual(["Claude Sonnet 5.5", "Claude Sonnet 5.5"]);

    // Ambiguous or missing: no model rather than a guess.
    const ambiguous = lensChipsForNote(
      { personaSlugs: ["story-architect", "script-doctor", "skeptic"], sourceModels: ["Claude Sonnet 5.5", "GPT-6.1 Terra"] },
      PERSONAS
    );
    expect(ambiguous.map((c) => c.model)).toEqual([null, null, null]);
    expect(lensChipsForNote({ personaSlugs: ["script-doctor"], sourceModels: [] }, PERSONAS)[0].model).toBeNull();
  });

  it("keeps the model name at AA contrast on the chip", () => {
    const html = renderToStaticMarkup(<LensChips chips={[{ key: "a", persona: "Story Architect", model: "Claude Sonnet 5.5" }]} />);
    expect(html).toContain('class="text-stone-600"');
  });
});

function note(id: number): NoteWithAnchor {
  return {
    id,
    scriptId: 1,
    versionId: 1,
    runId: "r",
    anchorText: "The fab was silent",
    issue: `Issue ${id}`,
    why: "",
    question: null,
    category: "pacing",
    priority: "medium",
    personaSlugs: ["story-architect"],
    sourceModels: ["Claude Sonnet 5.5"],
    status: "open",
    statusChangedAt: null,
    createdAt: "2026-10-27 10:00:00",
    isStale: false,
  };
}

const EMPTY: NoteGroups = { open: [], addressed: [], dismissed: [] };

describe("NotesList", () => {
  it("keeps loaded notes visible next to a failed refresh, with a way to try again", () => {
    const html = renderToStaticMarkup(
      <NotesList groups={{ ...EMPTY, open: [note(1)] }} personas={PERSONAS} activeId={null} loading={false} error="Failed to fetch" onSelect={() => {}} onRetry={() => {}} />
    );
    expect(html).toContain("Issue 1");
    expect(html).toContain("Couldn’t refresh notes: Failed to fetch");
    expect(html).toContain("may be out of date");
    expect(html).toContain("Try again");
  });

  it("offers Try again when nothing loaded", () => {
    const html = renderToStaticMarkup(
      <NotesList groups={EMPTY} personas={PERSONAS} activeId={null} loading={false} error="Failed to fetch" onSelect={() => {}} onRetry={() => {}} />
    );
    expect(html).toContain("Couldn’t load notes: Failed to fetch");
    expect(html).toContain("Try again");
  });
});

describe("sectionHint", () => {
  it("disables a section review the critique route would reject", () => {
    expect(sectionHint(null).available).toBe(false);
    expect(sectionHint({ text: "x".repeat(200), label: "“The fab…”", source: "selection" })).toEqual({ text: "“The fab…”", available: true });
    const long = sectionHint({ text: "x".repeat(MAX_SECTION_CHARS + 1), label: "“The fab…”", source: "selection" });
    expect(long.available).toBe(false);
    expect(long.text).toContain("Review the whole script instead");
    expect(sectionHint({ text: "x".repeat(MAX_SECTION_CHARS), label: "Act 2", source: "heading" }).available).toBe(true);
    // The council sends the section trimmed, so surrounding blank lines don't count.
    expect(sectionHint({ text: `\n\n${"x".repeat(MAX_SECTION_CHARS)}\n\n`, label: "Act 2", source: "heading" }).available).toBe(true);
  });
});

function councilStub(overrides: Partial<CouncilController>): CouncilController {
  return {
    personas: PERSONAS,
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
    markSeen: () => {},
    start: async () => {},
    stop: () => {},
    retryLens: async () => {},
    retrySynthesis: async () => {},
    setPersonaActive: async () => {},
    refresh: async () => {},
    ...overrides,
  };
}

describe("CouncilRoster", () => {
  it("labels the run from the council", () => {
    const html = renderToStaticMarkup(
      <CouncilRoster council={councilStub({ isRunning: true, phase: "critiquing", runScopeLabel: "Section: “The fab…”" })} />
    );
    expect(html).toContain("Section: “The fab…”");
    expect(html).toContain('aria-label="Stop the council"');
  });

  it("offers Retry synthesis when the run's synthesis is missing", () => {
    expect(renderToStaticMarkup(<CouncilRoster council={councilStub({ canRetrySynthesis: true })} />)).toContain("Retry synthesis");
    expect(renderToStaticMarkup(<CouncilRoster council={councilStub({})} />)).not.toContain("Retry synthesis");
  });
});
