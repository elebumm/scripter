import { describe, expect, it } from "vitest";
import {
  VERDICT_INFO,
  describeFactRun,
  groupFactNotes,
  needsReview,
  safeHref,
  sortBySeverity,
  sourceLabel,
  truncate,
  verdictInfo,
} from "./verdicts";
import { indexReturnedSources, validateFactClaims } from "@/lib/llm/fact-check";

describe("verdict labels", () => {
  it("has a clear label for every verdict", () => {
    expect(Object.keys(VERDICT_INFO).sort()).toEqual(
      ["exaggeration-ok", "inaccurate", "misleading", "unverifiable", "verified"].sort()
    );
    expect(verdictInfo("verified").label).toBe("Verified");
    expect(verdictInfo("inaccurate").label).toBe("Inaccurate");
    expect(verdictInfo("misleading").label).toBe("Misleading");
    expect(verdictInfo("unverifiable").label).toBe("Couldn't verify");
    expect(verdictInfo("exaggeration-ok").label).toBe("Fair exaggeration");
  });

  it("falls back for unknown verdicts", () => {
    expect(verdictInfo("maybe").label).toBe("Unrated");
  });

  it("never offers a correction in its copy", () => {
    for (const info of Object.values(VERDICT_INFO)) {
      expect(`${info.label} ${info.description}`.toLowerCase()).not.toMatch(/correct(ion)?|rewrite|replace/);
    }
  });
});

describe("sources", () => {
  it("only allows http(s) links", () => {
    expect(safeHref("https://example.com/a")).toBe("https://example.com/a");
    expect(safeHref("http://example.com")).toBe("http://example.com/");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
    expect(safeHref("not a url")).toBeNull();
  });

  it("labels a source by title, else host name", () => {
    expect(sourceLabel({ url: "https://www.nature.com/x", title: "  Nature paper " })).toBe("Nature paper");
    expect(sourceLabel({ url: "https://www.nature.com/x" })).toBe("nature.com");
    expect(sourceLabel({ url: "https://en.wikipedia.org/wiki/SQLite", title: "" })).toBe("en.wikipedia.org");
    expect(sourceLabel({ url: "weird" })).toBe("weird");
  });
});

describe("grouping", () => {
  const notes = [
    { id: 1, verdict: "verified" as const, status: "pending" as const },
    { id: 2, verdict: "misleading" as const, status: "pending" as const },
    { id: 3, verdict: "inaccurate" as const, status: "pending" as const },
    { id: 4, verdict: "inaccurate" as const, status: "acknowledged" as const },
    { id: 5, verdict: "unverifiable" as const, status: "dismissed" as const },
    { id: 6, verdict: "exaggeration-ok" as const, status: "pending" as const },
  ];

  it("sorts by how much attention the claim needs", () => {
    expect(sortBySeverity(notes).map((n) => n.id)).toEqual([3, 4, 2, 5, 6, 1]);
  });

  it("splits open notes from verified, acknowledged and dismissed ones", () => {
    const groups = groupFactNotes(notes);
    expect(groups.toReview.map((n) => n.id)).toEqual([3, 2, 6]);
    expect(groups.verified.map((n) => n.id)).toEqual([1]);
    expect(groups.acknowledged.map((n) => n.id)).toEqual([4]);
    expect(groups.dismissed.map((n) => n.id)).toEqual([5]);
  });

  it("only underlines open claims that need another look, never verified ones", () => {
    expect(notes.filter(needsReview).map((n) => n.id)).toEqual([2, 3, 6]);
    expect(needsReview({ verdict: "verified", status: "pending" })).toBe(false);
    expect(needsReview({ verdict: "inaccurate", status: "dismissed" })).toBe(false);
  });
});

describe("describeFactRun", () => {
  it("says when a run kept no claims, and why", () => {
    expect(describeFactRun({ claimsSaved: 0, claimsDropped: 3, searchCount: 9 })).toBe(
      "Fact-check finished, but none of the 3 claims it found could be kept (not quoted exactly from your text, or with nothing to report), so there are no fact notes for this version."
    );
    expect(describeFactRun({ claimsSaved: 0, claimsDropped: 1, searchCount: 2 })).toBe(
      "Fact-check finished, but the 1 claim it found couldn't be kept (not quoted exactly from your text, or with nothing to report), so there are no fact notes for this version."
    );
    expect(describeFactRun({ claimsSaved: 0, claimsDropped: 0, searchCount: 0 })).toBe(
      "Fact-check finished: no checkable claims were found in this version."
    );
  });

  it("counts what was checked and what was left out", () => {
    expect(describeFactRun({ claimsSaved: 4, claimsDropped: 0, searchCount: 12 })).toBe(
      "Fact-check finished: 4 claims checked against 12 sources."
    );
    expect(describeFactRun({ claimsSaved: 1, claimsDropped: 1, searchCount: 1 })).toBe(
      "Fact-check finished: 1 claim checked against 1 source. 1 more was left out (repeated, not quoted exactly from your text, or with nothing to report)."
    );
    expect(describeFactRun({ claimsSaved: 2, claimsDropped: 2, searchCount: 0 })).toBe(
      "Fact-check finished: 2 claims checked. 2 more were left out (repeated, not quoted exactly from your text, or with nothing to report)."
    );
  });

  it("names the actual reasons when the server reports them", () => {
    const by = { notInScript: 2, duplicate: 1, tooThin: 0, overLimit: 0 };
    expect(describeFactRun({ claimsSaved: 3, claimsDropped: 3, claimsDroppedBy: by, searchCount: 5 })).toBe(
      "Fact-check finished: 3 claims checked against 5 sources. 3 more were left out (2 not quoted exactly from your text, 1 repeated)."
    );
    expect(describeFactRun({ claimsSaved: 1, claimsDropped: 1, claimsDroppedBy: { duplicate: 1 }, searchCount: 1 })).toBe(
      "Fact-check finished: 1 claim checked against 1 source. 1 more was left out (repeated)."
    );
    expect(describeFactRun({ claimsSaved: 0, claimsDropped: 2, claimsDroppedBy: { tooThin: 2 }, searchCount: 1 })).toBe(
      "Fact-check finished, but none of the 2 claims it found could be kept (with nothing to report), so there are no fact notes for this version."
    );
  });

  it("never blames the writer's text for a claim dropped as a repeat", () => {
    // The server's own validation: the second claim quotes the script but repeats the first.
    const script = "ImageNet was labelled by 49,000 workers in 167 countries.";
    const claim = {
      claimText: script,
      verdict: "verified" as const,
      explanation: "The project's history page reports about 49,000 workers.",
      sources: [{ url: "https://example.org/imagenet" }],
      category: "statistic" as const,
    };
    const validation = validateFactClaims(
      { claims: [claim, { ...claim }] },
      { content: script, returned: indexReturnedSources([{ sourceType: "url", url: "https://example.org/imagenet" }]) }
    );
    expect(validation.dropped).toMatchObject({ notInScript: 0, duplicate: 1 });
    const line = describeFactRun({ claimsSaved: validation.claims.length, claimsDropped: 1, searchCount: 1 });
    expect(line).toContain("1 more was left out");
    expect(line).not.toMatch(/couldn't be matched/);
  });

  it("copes with missing counts", () => {
    expect(describeFactRun(null)).toBe("Fact-check finished: no checkable claims were found in this version.");
    expect(describeFactRun({ claimsSaved: 2 })).toBe("Fact-check finished: 2 claims checked.");
  });
});

describe("truncate", () => {
  it("collapses whitespace and adds an ellipsis", () => {
    expect(truncate("a  b\nc", 10)).toBe("a b c");
    expect(truncate("abcdefghij", 5)).toBe("abcd…");
  });
});
