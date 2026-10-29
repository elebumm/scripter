import { describe, expect, it } from "vitest";
import type { Beat } from "@/types/review";
import {
  beatTotals,
  coverageRows,
  formatSeconds,
  isOnSheet,
  missingItems,
  moveBeat,
  orderBeats,
  parseDuration,
  proposalItems,
  replaceableAiBeats,
  settledProposalItems,
  sortBeats,
} from "./beat-utils";

function beat(id: number, overrides: Partial<Beat> = {}): Beat {
  return {
    id,
    scriptId: 1,
    position: id,
    title: `Beat ${id}`,
    purpose: "",
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

const ids = (beats: Beat[]) => beats.map((b) => b.id);

describe("sortBeats", () => {
  it("orders by position, then id", () => {
    const sorted = sortBeats([beat(3, { position: 1 }), beat(1, { position: 2 }), beat(2, { position: 1 })]);
    expect(ids(sorted)).toEqual([2, 3, 1]);
  });
});

describe("moveBeat", () => {
  const list = [beat(1, { position: 0 }), beat(2, { position: 1 }), beat(3, { position: 2 })];

  it("moves a beat up and renumbers positions", () => {
    const moved = moveBeat(list, 3, -1)!;
    expect(ids(moved)).toEqual([1, 3, 2]);
    expect(moved.map((b) => b.position)).toEqual([0, 1, 2]);
  });

  it("moves a beat down", () => {
    expect(ids(moveBeat(list, 1, 1)!)).toEqual([2, 1, 3]);
  });

  it("returns null at the edges or for unknown ids", () => {
    expect(moveBeat(list, 1, -1)).toBeNull();
    expect(moveBeat(list, 3, 1)).toBeNull();
    expect(moveBeat(list, 99, 1)).toBeNull();
  });

  it("does not mutate the input", () => {
    moveBeat(list, 2, 1);
    expect(ids(list)).toEqual([1, 2, 3]);
  });
});

describe("orderBeats", () => {
  it("follows the given ids and keeps unlisted beats at the end", () => {
    const list = [beat(1), beat(2), beat(3), beat(4)];
    const ordered = orderBeats(list, [3, 1]);
    expect(ids(ordered)).toEqual([3, 1, 2, 4]);
    expect(ordered.map((b) => b.position)).toEqual([0, 1, 2, 3]);
  });
});

describe("beatTotals", () => {
  const list = [
    beat(1, { targetSeconds: 60, status: "drafted" }),
    beat(2, { targetSeconds: 90 }),
    beat(3, { targetSeconds: 120, status: "cut" }),
    beat(4),
  ];

  it("sums targets of beats that aren't cut", () => {
    const totals = beatTotals(list, 600);
    expect(totals.plannedSeconds).toBe(150);
    expect(totals.activeBeats).toBe(3);
    expect(totals.draftedBeats).toBe(1);
    expect(totals.beatsWithoutTarget).toBe(1);
    expect(totals.targetSeconds).toBe(600);
    expect(totals.differenceSeconds).toBe(-450);
  });

  it("has no difference without a script target", () => {
    const totals = beatTotals(list, null);
    expect(totals.targetSeconds).toBeNull();
    expect(totals.differenceSeconds).toBeNull();
    expect(beatTotals(list, 0).targetSeconds).toBeNull();
  });

  it("handles an empty sheet", () => {
    expect(beatTotals([], 300)).toMatchObject({ activeBeats: 0, plannedSeconds: 0, differenceSeconds: -300 });
  });
});

describe("formatSeconds", () => {
  it("formats m:ss", () => {
    expect(formatSeconds(0)).toBe("0:00");
    expect(formatSeconds(5)).toBe("0:05");
    expect(formatSeconds(90)).toBe("1:30");
    expect(formatSeconds(619.4)).toBe("10:19");
    expect(formatSeconds(-75)).toBe("1:15");
  });
});

describe("parseDuration", () => {
  it("reads seconds, m:ss and unit forms", () => {
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration(" 45s ")).toBe(45);
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("10:05")).toBe(605);
    expect(parseDuration("2m")).toBe(120);
    expect(parseDuration("2 min")).toBe(120);
    expect(parseDuration("1m30s")).toBe(90);
    expect(parseDuration("1m 30")).toBe(90);
  });

  it("returns null for an empty field or zero", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("   ")).toBeNull();
    expect(parseDuration("0")).toBeNull();
    expect(parseDuration("0:00")).toBeNull();
  });

  it("accepts up to two hours", () => {
    expect(parseDuration("120:00")).toBe(7200);
    expect(parseDuration("7201")).toBeUndefined();
  });

  it("returns undefined for text it can't read", () => {
    expect(parseDuration("soon")).toBeUndefined();
    expect(parseDuration("1:75")).toBeUndefined();
    expect(parseDuration("1m75s")).toBeUndefined();
    expect(parseDuration("-5")).toBeUndefined();
    expect(parseDuration("99999")).toBeUndefined();
  });
});

describe("proposalItems", () => {
  const partial = {
    beats: [
      { title: "Cold open", purpose: "Hook the viewer", targetSeconds: 30 },
      { title: "  The problem ", purpose: "Why it matters" },
      { title: "The tur" },
    ],
  };

  it("marks the last item unsettled while streaming", () => {
    const items = proposalItems(partial, true);
    expect(items.map((i) => i.settled)).toEqual([true, true, false]);
    expect(items[1]).toEqual({ index: 1, title: "The problem", purpose: "Why it matters", targetSeconds: null, settled: true });
  });

  it("settles every item once the stream is done", () => {
    expect(proposalItems(partial, false).every((i) => i.settled)).toBe(true);
    expect(settledProposalItems(partial, true).map((i) => i.title)).toEqual(["Cold open", "The problem"]);
  });

  it("skips items without a title and keeps their index", () => {
    const items = proposalItems({ beats: [{ purpose: "x" }, undefined, { title: "Ending" }] }, false);
    expect(items).toEqual([{ index: 2, title: "Ending", purpose: "", targetSeconds: null, settled: true }]);
    expect(proposalItems(null, false)).toEqual([]);
  });
});

describe("isOnSheet", () => {
  it("matches titles ignoring case and punctuation", () => {
    const list = [beat(1, { title: "Cold open: the crash" })];
    expect(isOnSheet("cold open — the crash", list)).toBe(true);
    expect(isOnSheet("The crash", list)).toBe(false);
    expect(isOnSheet("  ", list)).toBe(false);
  });
});

describe("replaceableAiBeats", () => {
  it("only counts planned AI beats", () => {
    const list = [
      beat(1, { source: "ai" }),
      beat(2, { source: "ai", status: "drafted" }),
      beat(3, { source: "writer" }),
    ];
    expect(ids(replaceableAiBeats(list))).toEqual([1]);
  });
});

describe("coverageRows", () => {
  const list = [
    beat(1, { position: 0, anchorText: "saved anchor text here" }),
    beat(2, { position: 1 }),
    beat(3, { position: 2 }),
  ];

  it("joins coverage onto beats in sheet order and prefers the saved anchor", () => {
    const rows = coverageRows(list, {
      coverage: [
        { beatId: 2, covered: false, comment: "Not in the draft yet." },
        { beatId: 1, covered: true, anchorText: "model anchor", comment: "Lands." },
        { beatId: 99, covered: true, comment: "Deleted beat" },
        { beatId: 3 },
      ],
    });
    expect(rows.map((r) => [r.beat.id, r.covered, r.anchorText])).toEqual([
      [1, true, "saved anchor text here"],
      [2, false, null],
    ]);
  });

  it("falls back to the check's anchor when none was saved", () => {
    const rows = coverageRows([beat(5)], { coverage: [{ beatId: 5, covered: true, anchorText: " quote " }] });
    expect(rows[0].anchorText).toBe("quote");
  });
});

describe("missingItems", () => {
  it("keeps titled items with their index", () => {
    expect(missingItems({ missing: [{ purpose: "x" }, { title: "Payoff", purpose: " Close the loop " }] })).toEqual([
      { index: 1, title: "Payoff", purpose: "Close the loop" },
    ]);
    expect(missingItems(null)).toEqual([]);
  });
});
