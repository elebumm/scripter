// Server-render smoke tests: each Beat Sheet piece renders its states without
// throwing, and never offers a way to put text into the script.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Beat } from "@/types/review";
import type { CheckState, SuggestState } from "@/hooks/useBeats";
import { BeatCard } from "./BeatCard";
import { BeatProposal } from "./BeatProposal";
import { BeatCheckPanel } from "./BeatCheckPanel";
import { AddBeatForm } from "./AddBeatForm";

const noop = () => {};
const resolved = async () => true;

function beat(id: number, overrides: Partial<Beat> = {}): Beat {
  return {
    id,
    scriptId: 1,
    position: id,
    title: `Beat ${id}`,
    purpose: `Purpose ${id}`,
    writerNotes: "",
    targetSeconds: null,
    status: "planned",
    source: "writer",
    anchorText: null,
    createdAt: "2026-10-27 10:00:00",
    updatedAt: "2026-10-27 10:00:00",
    ...overrides,
  };
}

const FORBIDDEN = /\b(accept|apply|rewrite|insert)\b/i;

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("BeatCard", () => {
  it("renders an editable beat with reorder controls and a jump link", () => {
    const html = renderToStaticMarkup(
      <ol>
        <BeatCard
          beat={beat(3, { title: "The reveal", targetSeconds: 95, source: "ai", anchorText: "x", writerNotes: "Shot list" })}
          index={2}
          isFirst={false}
          isLast
          anchor="found"
          onUpdate={noop}
          onMove={noop}
          onDelete={noop}
          onJump={noop}
        />
      </ol>
    );
    expect(html).toContain('value="The reveal"');
    expect(html).toContain('value="1:35"');
    expect(html).toContain('aria-label="Move beat 3 up"');
    expect(html.match(/<button[^>]*aria-label="Move beat 3 down"[^>]*>/)?.[0]).toContain(" disabled=\"\"");
    expect(html.match(/<button[^>]*aria-label="Move beat 3 up"[^>]*>/)?.[0]).not.toContain(" disabled=\"\"");
    expect(html).toContain("In draft");
    expect(html).toContain("Suggested");
    expect(html).toContain("Shot list");
    expect(text(html)).not.toMatch(FORBIDDEN);
  });

  it("shows a cut beat without dimming the whole card below AA contrast", () => {
    const html = renderToStaticMarkup(
      <BeatCard beat={beat(2, { status: "cut" })} index={1} isFirst={false} isLast anchor="none" onUpdate={noop} onMove={noop} onDelete={noop} onJump={noop} />
    );
    expect(html).not.toContain("opacity-70");
    expect(html).toContain("line-through");
    expect(html).not.toContain("placeholder:text-stone-400");
  });

  it("marks a changed passage", () => {
    const html = renderToStaticMarkup(
      <BeatCard
        beat={beat(1, { anchorText: "gone" })}
        index={0}
        isFirst
        isLast={false}
        anchor="changed"
        onUpdate={noop}
        onMove={noop}
        onDelete={noop}
        onJump={noop}
      />
    );
    expect(html).toContain("Passage changed");
    expect(html).not.toContain("In draft");
  });
});

describe("BeatProposal", () => {
  const proposal = {
    beats: [
      { title: "Cold open", purpose: "Drop the viewer into the failure.", targetSeconds: 40 },
      { title: "Stakes", purpose: "Show what was at risk." },
      { title: "The tu" },
    ],
    rationale: "A failure-first shape suits the brief.",
  };

  it("streams: settled items can be added, the last one is still being written", () => {
    const suggestion: SuggestState = { status: "streaming", proposal, error: null };
    const html = renderToStaticMarkup(
      <BeatProposal suggestion={suggestion} beats={[]} onAdd={resolved} onUseAll={resolved} onStop={noop} onDismiss={noop} onRetry={noop} />
    );
    expect(html).toContain("not script text");
    expect(html).toContain('aria-label="Stop suggesting beats"');
    expect(html.match(/aria-label="Add beat: /g)?.length).toBe(2);
    expect(html).not.toContain("Use these beats");
    expect(text(html)).not.toMatch(FORBIDDEN);
  });

  it("done: offers Use these beats and shows beats already on the sheet as added", () => {
    const suggestion: SuggestState = { status: "done", proposal, error: null };
    const html = renderToStaticMarkup(
      <BeatProposal
        suggestion={suggestion}
        beats={[beat(1, { title: "Cold open" })]}
        onAdd={resolved}
        onUseAll={resolved}
        onStop={noop}
        onDismiss={noop}
        onRetry={noop}
      />
    );
    expect(html).toContain("Use these beats");
    expect(html).toContain("Added");
    expect(html.match(/aria-label="Add beat: /g)?.length).toBe(2);
  });

  it("stopped: leaves out the half-written beat", () => {
    const suggestion: SuggestState = { status: "stopped", proposal, error: null };
    const html = renderToStaticMarkup(
      <BeatProposal suggestion={suggestion} beats={[]} onAdd={resolved} onUseAll={resolved} onStop={noop} onDismiss={noop} onRetry={noop} />
    );
    expect(html).not.toContain("The tu");
    expect(html).toContain("Unfinished beats were left out");
  });

  it("shows errors from the stream", () => {
    const suggestion: SuggestState = { status: "error", proposal: null, error: "No brief yet" };
    const html = renderToStaticMarkup(
      <BeatProposal suggestion={suggestion} beats={[]} onAdd={resolved} onUseAll={resolved} onStop={noop} onDismiss={noop} onRetry={noop} />
    );
    expect(html).toContain("No brief yet");
    expect(html).toContain("Try again");
  });
});

describe("BeatCheckPanel", () => {
  it("lists covered beats (jumpable), beats not found and missing proposals", () => {
    const beats = [beat(1, { anchorText: "where it happens" }), beat(2)];
    const check: CheckState = {
      status: "done",
      partial: null,
      error: null,
      result: {
        coverage: [
          { beatId: 1, covered: true, anchorText: "where it happens", comment: "The turn lands." },
          { beatId: 2, covered: false, comment: "Nothing sets up the stakes yet." },
        ],
        missing: [{ title: "Payoff", purpose: "Close the loop the cold open opened." }],
      },
    };
    const html = renderToStaticMarkup(
      <BeatCheckPanel
        check={check}
        beats={beats}
        anchorInDraft={() => true}
        onJump={noop}
        onAddMissing={resolved}
        onStop={noop}
        onDismiss={noop}
        onRetry={noop}
      />
    );
    expect(html).toContain("1 of 2 beats found");
    expect(html).toContain("The turn lands.");
    expect(html).toContain("Not in the draft yet");
    expect(html).toContain('aria-label="Add beat: Payoff"');
    expect(text(html)).not.toMatch(FORBIDDEN);
  });

  it("shows progress while saving", () => {
    const check: CheckState = { status: "saving", partial: null, result: null, error: null };
    const html = renderToStaticMarkup(
      <BeatCheckPanel
        check={check}
        beats={[]}
        anchorInDraft={() => false}
        onJump={noop}
        onAddMissing={resolved}
        onStop={noop}
        onDismiss={noop}
        onRetry={noop}
      />
    );
    expect(html).toContain("Saving a version");
    expect(html).toContain('aria-label="Stop the draft check"');
  });
});

describe("AddBeatForm", () => {
  it("starts as a button and can start open", () => {
    expect(renderToStaticMarkup(<AddBeatForm onAdd={resolved} />)).toContain("Add beat");
    expect(renderToStaticMarkup(<AddBeatForm onAdd={resolved} defaultOpen />)).toContain('aria-label="Beat name"');
  });
});
