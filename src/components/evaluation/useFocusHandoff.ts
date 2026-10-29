"use client";

import { useEffect, useRef, type RefObject } from "react";

type Focusable = Pick<HTMLElement, "focus"> & { isConnected?: boolean };

/**
 * Opening a non-modal panel moves focus to `target` inside it; closing hands
 * focus back to whatever had it before, but only when focus was inside the
 * panel or lost (the writer may have moved on to the editor meanwhile). The
 * close runs after the commit that made the panel inert (and un-inerted
 * whatever it covered), so the opener can take focus again.
 */
export function useFocusHandoff(
  open: boolean,
  target: RefObject<Focusable | null>,
  container: RefObject<Pick<HTMLElement, "contains"> | null>
) {
  const returnTo = useRef<Focusable | null>(null);

  useEffect(() => {
    const active = document.activeElement;
    if (open) {
      returnTo.current = active && active !== document.body ? (active as unknown as Focusable) : null;
      target.current?.focus({ preventScroll: true });
      return;
    }
    const opener = returnTo.current;
    returnTo.current = null;
    const focusLost = !active || active === document.body || !!container.current?.contains(active);
    if (opener && opener.isConnected !== false && focusLost) opener.focus({ preventScroll: true });
  }, [open, target, container]);
}
