import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ICON_CHOICES, buildIconPrompt, matchIconName } from "./pick-icon";

describe("matchIconName", () => {
  it("matches case- and punctuation-insensitively", () => {
    expect(matchIconName("Code")).toBe("Code");
    expect(matchIconName(" magnifyingglass.")).toBe("MagnifyingGlass");
    expect(matchIconName('{"result":"Robot"}')).toBe("Robot");
  });

  it("rejects unknown names", () => {
    expect(matchIconName("Spaceship")).toBeNull();
    expect(matchIconName("")).toBeNull();
    expect(matchIconName(null)).toBeNull();
  });
});

describe("ICON_CHOICES", () => {
  it("only offers icons ScriptIcon can render", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/drafts/ScriptIcon.tsx"), "utf8");
    const mapBody = source.slice(source.indexOf("const ICON_MAP"), source.indexOf("};", source.indexOf("const ICON_MAP")));
    for (const icon of ICON_CHOICES) {
      expect(mapBody, icon).toMatch(new RegExp(`\\b${icon}\\b`));
    }
  });
});

describe("buildIconPrompt", () => {
  it("is empty when there is nothing to go on", () => {
    expect(buildIconPrompt({ title: " ", context: "", content: "" })).toBe("");
    expect(buildIconPrompt({ title: "ImageNet", context: "", content: "" })).toContain("Title: ImageNet");
  });
});
