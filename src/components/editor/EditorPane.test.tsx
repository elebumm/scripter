// Server-render tests for which editor a script opens in (the stored mode is
// WYSIWYG on the server), and the check's state over typing, restores and
// mode switches (useWysiwygGuard under a client root). Clicks and focus are
// covered by browser checks.

import { act, useReducer } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderHook } from "@/hooks/render-hook.test-helper";
import type { EditorMode } from "@/stores/app-store";
import { EditorPane, useWysiwygGuard } from "./EditorPane";

const noop = () => {};
const render = (content: string) => renderToStaticMarkup(<EditorPane content={content} onChange={noop} />);

describe("EditorPane", () => {
  it("opens an ordinary script in the visual editor", () => {
    const html = render("# Title\n\nOpen on a **cold open**.\n\n* a star bullet");
    expect(html).toContain("tiptap-editor-container");
    expect(html).not.toContain("<textarea");
  });

  it("keeps a script the visual editor would rewrite in markdown, with a notice and a way out", () => {
    const html = render("Shot list\n\n- [ ] shoot intro\n- [x] write hook");
    expect(html).toContain("<textarea");
    expect(html).not.toContain("tiptap-editor-container");
    expect(html).toContain("line 3");
    expect(html).toContain("- [ ] shoot intro");
    expect(html).toContain("Edit visually anyway");
  });
});

describe("useWysiwygGuard", () => {
  const LOSSY = "Shot list\n\n- [ ] shoot intro";
  const CLEAN = "# Older version\n\nPlain words.";

  /** The guard as EditorPane uses it, with the page's content and stored mode as props. */
  async function mount(content: string, mode: EditorMode = "wysiwyg") {
    const props = { content, mode };
    const handle = await renderHook(() => {
      const [, rerender] = useReducer((n: number) => n + 1, 0);
      return { guard: useWysiwygGuard(props.content, props.mode), rerender };
    });
    const update = (next: Partial<typeof props>) =>
      act(async () => {
        Object.assign(props, next);
        handle.current.rerender();
      });
    return {
      get guard() {
        return handle.current.guard;
      },
      /** The writer types: an editor emits and the page hands the text back, in one render. */
      type: (value: string) =>
        act(async () => {
          handle.current.guard.emitted(value);
          Object.assign(props, { content: value });
          handle.current.rerender();
        }),
      /** Text arrives from outside (a restore). */
      restore: (value: string) => update({ content: value }),
      setMode: (mode: EditorMode) => update({ mode }),
      unmount: handle.unmount,
    };
  }

  it("checks on load and never again while the writer types", async () => {
    const pane = await mount(LOSSY);
    expect(pane.guard.keepMarkdown).toBe(true);
    expect(pane.guard.rewrite?.line).toBe(3);

    await pane.type("Shot list fixed\n\nNo checkboxes left.");
    expect(pane.guard.keepMarkdown).toBe(true);
    await pane.unmount();
  });

  it("checks a restore again, even back to text the writer typed earlier", async () => {
    const pane = await mount(LOSSY);
    const typed = `${LOSSY}\n- [x] write hook`;
    await pane.type(typed); // saved as a version along the way
    await pane.restore(CLEAN);
    expect(pane.guard.keepMarkdown).toBe(false);

    // Restoring the version with the typed text must not open it visually.
    await pane.restore(typed);
    expect(pane.guard.keepMarkdown).toBe(true);
    expect(pane.guard.rewrite?.text).toBe("- [ ] shoot intro");
    await pane.unmount();
  });

  it("lets the writer edit visually anyway, until the next check", async () => {
    const pane = await mount(LOSSY);
    await act(async () => pane.guard.editVisually());
    expect(pane.guard.keepMarkdown).toBe(false);
    await pane.type(`${LOSSY}!`);
    expect(pane.guard.keepMarkdown).toBe(false);

    await pane.setMode("markdown");
    expect(pane.guard.keepMarkdown).toBe(false);
    expect(pane.guard.rewrite).toBeNull();
    await pane.setMode("wysiwyg");
    expect(pane.guard.keepMarkdown).toBe(true);
    await pane.unmount();
  });

  it("checks what was typed in markdown mode when switching to WYSIWYG", async () => {
    const pane = await mount(CLEAN, "markdown");
    await pane.type(`${CLEAN}\n\n![thumb](https://example.com/t.png)`);
    expect(pane.guard.rewrite).toBeNull();
    await pane.setMode("wysiwyg");
    expect(pane.guard.keepMarkdown).toBe(true);
    expect(pane.guard.rewrite?.line).toBe(5);
    await pane.unmount();
  });
});
