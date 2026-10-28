import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Switch } from "./switch";

describe("Switch", () => {
  it("outlines the off state so the control is visible against the page (WCAG 1.4.11)", () => {
    const html = renderToStaticMarkup(<Switch checked={false} aria-label="Lens" />);
    expect(html).toContain('data-state="unchecked"');
    expect(html).toContain("data-[state=unchecked]:border-stone-500");
  });
});
