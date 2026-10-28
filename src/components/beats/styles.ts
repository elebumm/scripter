// Shared class strings for the Beat Sheet (Scripter's stone palette).
import type { CSSProperties } from "react";

export const FONT_CABINET: CSSProperties = { fontFamily: "var(--font-cabinet)" };
export const FONT_INTER: CSSProperties = { fontFamily: "var(--font-inter)" };
export const FONT_SWITZER: CSSProperties = { fontFamily: "var(--font-switzer)" };

export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-stone-500 focus-visible:ring-offset-1 focus-visible:ring-offset-stone-50";

export const labelCaps = "text-[10px] font-bold tracking-widest uppercase text-stone-500";

export const btnPrimary = `inline-flex items-center justify-center gap-1.5 rounded-xl bg-stone-800 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

export const btnSecondary = `inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

export const btnText = `inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

export const btnIcon = `inline-flex h-7 w-7 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-30 ${focusRing}`;

export const fieldBase = `w-full rounded-md bg-transparent px-1.5 py-1 transition-colors hover:bg-stone-50 focus:bg-white focus:ring-1 focus:ring-stone-300 ${focusRing}`;
