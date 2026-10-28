// The synthesis panel's focus handoff, against a stub document (no DOM
// library): opening focuses the panel heading, closing gives focus back to the
// opener unless the writer already moved it somewhere else.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderHook, type HookHandle } from "@/hooks/render-hook.test-helper";
import { useFocusHandoff } from "./useFocusHandoff";

interface FakeEl {
  name: string;
  isConnected: boolean;
  focus(): void;
}

const doc = { activeElement: null as FakeEl | null, body: { name: "body" } as unknown };
const g = globalThis as unknown as { document?: unknown };
let savedDocument: unknown;

function el(name: string): FakeEl {
  const e: FakeEl = {
    name,
    isConnected: true,
    focus() {
      doc.activeElement = e;
    },
  };
  return e;
}

const heading = el("panel heading");
const closeButton = el("panel close button");
const panel = { contains: (node: unknown) => node === heading || node === closeButton };
const headingRef = { current: heading };
const panelRef = { current: panel };

let hook: HookHandle<void, boolean> | null = null;
async function mount(open: boolean) {
  hook = await renderHook((isOpen: boolean) => useFocusHandoff(isOpen, headingRef, panelRef as never), open);
  return hook;
}

beforeEach(() => {
  savedDocument = g.document;
  g.document = doc;
  doc.activeElement = null;
});

afterEach(async () => {
  await hook?.unmount();
  hook = null;
  g.document = savedDocument;
});

describe("synthesis panel focus", () => {
  it("moves focus into the panel on open and back to the opener on close", async () => {
    const opener = el("Open synthesis");
    opener.focus();
    const h = await mount(false);
    expect(doc.activeElement).toBe(opener);

    await h.rerender(true);
    expect(doc.activeElement).toBe(heading);

    closeButton.focus(); // the writer tabbed to Close
    await h.rerender(false);
    expect(doc.activeElement).toBe(opener);
  });

  it("gives focus back when closing left it on the page body", async () => {
    const opener = el("Open synthesis");
    opener.focus();
    const h = await mount(false);
    await h.rerender(true);
    doc.activeElement = doc.body as FakeEl; // the inert panel dropped focus
    await h.rerender(false);
    expect(doc.activeElement).toBe(opener);
  });

  it("leaves focus alone when the writer moved on before closing", async () => {
    const opener = el("Open synthesis");
    opener.focus();
    const h = await mount(false);
    await h.rerender(true);
    const editor = el("editor");
    editor.focus();
    await h.rerender(false);
    expect(doc.activeElement).toBe(editor);
  });

  it("does not focus an opener that is gone (e.g. a toast action)", async () => {
    const toastAction = el("toast action");
    toastAction.focus();
    const h = await mount(false);
    await h.rerender(true);
    toastAction.isConnected = false;
    await h.rerender(false);
    expect(doc.activeElement).toBe(heading);
  });
});
