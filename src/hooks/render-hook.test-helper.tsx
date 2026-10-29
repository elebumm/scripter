// Test-only: run a hook under react-dom/client in vitest's Node environment
// (no DOM library). The root renders nothing, so a stub container is enough.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const g = globalThis as unknown as { window?: unknown; IS_REACT_ACT_ENVIRONMENT?: boolean };
g.window ??= globalThis; // react-dom reads window.event for update priority
g.IS_REACT_ACT_ENVIRONMENT = true;

function stubContainer(): Element {
  const doc: Record<string, unknown> = { nodeType: 9, activeElement: null, addEventListener() {}, removeEventListener() {} };
  doc.defaultView = { document: doc, HTMLIFrameElement: class {} };
  return {
    nodeType: 1,
    nodeName: "DIV",
    tagName: "DIV",
    ownerDocument: doc,
    textContent: "",
    firstChild: null,
    addEventListener() {},
    removeEventListener() {},
    removeChild() {},
  } as unknown as Element;
}

export interface HookHandle<T, P = void> {
  /** The hook's latest return value. */
  readonly current: T;
  /** Render again with new props. */
  rerender(props: P): Promise<void>;
  unmount(): Promise<void>;
}

export async function renderHook<T, P = void>(useHook: (props: P) => T, initialProps?: P): Promise<HookHandle<T, P>> {
  let value: { current: T } | null = null;
  function Probe({ props }: { props: P }) {
    value = { current: useHook(props) };
    return null;
  }
  const root: Root = createRoot(stubContainer());
  await act(async () => root.render(<Probe props={initialProps as P} />));
  return {
    get current() {
      if (!value) throw new Error("hook never rendered");
      return value.current;
    },
    rerender: (props: P) => act(async () => root.render(<Probe props={props} />)),
    unmount: () => act(async () => root.unmount()),
  };
}

/** Run `fn` inside act and let pending promises and timers settle. */
export async function settle(fn?: () => unknown): Promise<void> {
  await act(async () => {
    await fn?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
