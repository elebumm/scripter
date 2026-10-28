import { describe, expect, it, vi } from "vitest";
import { draftKeepPlan, restoreDescription, restoreDraft, restoredMessage } from "./restore";

const versions = [
  { version: 5, content: "v5 text" },
  { version: 4, content: "v4 text" },
  { version: 2, content: "v2 text" },
];

describe("draftKeepPlan", () => {
  it("saves a draft that is in no saved version", () => {
    expect(draftKeepPlan("my unsaved words", versions)).toEqual({ kind: "save-first" });
  });

  it("doesn't save a draft an older version already holds (no duplicate version)", () => {
    expect(draftKeepPlan("v2 text", versions)).toEqual({ kind: "saved", version: 2 });
    expect(draftKeepPlan("v5 text", versions)).toEqual({ kind: "saved", version: 5 });
  });

  it("has nothing to keep for an empty draft", () => {
    expect(draftKeepPlan("  \n", versions)).toEqual({ kind: "empty" });
    expect(draftKeepPlan("", [])).toEqual({ kind: "empty" });
  });

  it("saves any draft when there are no versions yet", () => {
    expect(draftKeepPlan("first words", [])).toEqual({ kind: "save-first" });
  });
});

describe("restoreDescription", () => {
  it("says exactly what happens to the draft", () => {
    expect(restoreDescription("v4", { kind: "save-first" })).toMatch(/saved as a new version first.*nothing is restored/);
    expect(restoreDescription("v4", { kind: "saved", version: 2 })).toMatch(/already saved as v2, so nothing is lost/);
    expect(restoreDescription("v4", { kind: "saved", version: 2 })).not.toMatch(/saved as a new version/);
    expect(restoreDescription("v4", { kind: "empty" })).toMatch(/empty, so nothing is lost/);
  });
});

describe("restoreDraft", () => {
  it("never replaces the draft when the keep-save fails", async () => {
    const apply = vi.fn();
    const saveVersion = vi.fn(async () => null);
    const result = await restoreDraft(true, saveVersion, apply);
    expect(result).toEqual({ restored: false });
    expect(saveVersion).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
  });

  it("saves first, then restores", async () => {
    const order: string[] = [];
    const result = await restoreDraft(
      true,
      async () => {
        order.push("save");
        return { version: 6, created: true };
      },
      () => order.push("apply")
    );
    expect(order).toEqual(["save", "apply"]);
    expect(result).toEqual({ restored: true, kept: { version: 6, created: true } });
  });

  it("restores without saving when the draft is already kept", async () => {
    const apply = vi.fn();
    const saveVersion = vi.fn(async () => ({ version: 1, created: true }));
    const result = await restoreDraft(false, saveVersion, apply);
    expect(saveVersion).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledOnce();
    expect(result).toEqual({ restored: true, kept: null });
  });
});

describe("restoredMessage", () => {
  it("names the version that now holds the previous draft", () => {
    expect(restoredMessage({ version: 6, created: true })).toBe("Restored. Your previous draft is saved as version 6.");
    expect(restoredMessage({ version: 5, created: false })).toBe(
      "Restored. Your previous draft is already saved as version 5."
    );
    expect(restoredMessage(null)).toBe("Restored as your draft.");
  });
});
