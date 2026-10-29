// Server-render checks for the fact notes sidebar and card: a load failure is
// never shown as "no fact notes", a run that kept nothing says so, and a
// closed note can be reopened. Nothing offers to change the script's text.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { FactNote } from "@/types/review";
import { FactNoteCard } from "./FactNoteCard";
import { FactNotesList } from "./FactNotesList";

const noop = () => {};
const FORBIDDEN = /\b(accept|apply|rewrite|insert|replace)\b/i;

function fact(id: number, overrides: Partial<FactNote> = {}): FactNote {
  return {
    id,
    factCheckId: 1,
    scriptId: 1,
    versionId: 1,
    claimText: `Claim ${id} from the script`,
    verdict: "inaccurate",
    explanation: "The sources say otherwise.",
    sources: [{ url: "https://example.com/a", title: "Example" }],
    category: "statistic",
    status: "pending",
    createdAt: "2026-10-27 10:00:00",
    ...overrides,
  };
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/&#x27;/g, "'");
}

/** Visible labels of the rendered text buttons (icon-only ones are skipped). */
function buttons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*>((?:(?!<\/button>).)*)<\/button>/g)]
    .map((m) => text(m[1]).trim())
    .filter(Boolean);
}

describe("FactNotesList", () => {
  it("shows a load failure with Retry instead of the empty state", () => {
    const html = renderToStaticMarkup(
      <FactNotesList notes={[]} staleIds={new Set()} onSelect={noop} loadError="Failed to fetch" onRetry={noop} />
    );
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain("Couldn't load your saved fact notes: Failed to fetch");
    expect(text(html)).toContain("Retry");
    expect(text(html)).not.toContain("No fact notes yet");
  });

  it("says it is loading rather than that there are none", () => {
    const html = text(renderToStaticMarkup(<FactNotesList notes={[]} staleIds={new Set()} onSelect={noop} loading />));
    expect(html).toContain("Loading fact notes");
    expect(html).not.toContain("No fact notes yet");
  });

  it("explains a finished run that kept no claims", () => {
    const html = text(
      renderToStaticMarkup(
        <FactNotesList
          notes={[]}
          staleIds={new Set()}
          onSelect={noop}
          lastRun={{ claimsSaved: 0, claimsDropped: 3, searchCount: 7 }}
        />
      )
    );
    expect(html).toContain("none of the 3 claims it found could be kept");
    expect(html).not.toContain("No fact notes yet");
  });

  it("keeps the empty state for a script that was never checked", () => {
    const html = text(renderToStaticMarkup(<FactNotesList notes={[]} staleIds={new Set()} onSelect={noop} />));
    expect(html).toContain("No fact notes yet");
  });

  it("summarises the run above its notes", () => {
    const html = text(
      renderToStaticMarkup(
        <FactNotesList
          notes={[fact(1), fact(2, { verdict: "verified" })]}
          staleIds={new Set()}
          onSelect={noop}
          lastRun={{ claimsSaved: 2, claimsDropped: 1, searchCount: 5 }}
        />
      )
    );
    expect(html).toContain("2 claims checked against 5 sources");
    expect(html).toContain("To review (1)");
    expect(html).toContain("Verified (1)");
    expect(html).not.toMatch(FORBIDDEN);
  });
});

describe("FactNoteCard", () => {
  const render = (note: FactNote) =>
    renderToStaticMarkup(
      <FactNoteCard note={note} isStale={false} onAcknowledge={noop} onDismiss={noop} onReopen={noop} onClose={noop} />
    );

  it("lets a dismissed or acknowledged note be reopened", () => {
    expect(buttons(render(fact(1, { status: "dismissed" })))).toEqual(["Reopen", "Acknowledge"]);
    expect(buttons(render(fact(1, { status: "acknowledged" })))).toEqual(["Reopen", "Dismiss"]);
  });

  it("offers no Reopen on an open note, and never a correction", () => {
    const html = render(fact(1));
    expect(buttons(html)).toEqual(["Acknowledge", "Dismiss"]);
    expect(text(html)).not.toMatch(FORBIDDEN);
  });
});
