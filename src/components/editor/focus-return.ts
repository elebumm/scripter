// Where keyboard focus goes when an anchored card closes with focus inside it.
// Generic over the element type, so the choice can be tested in Node.

/** Controls a keyboard user can Tab to. */
export const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** How many controls on each side of the opener are kept as stand-ins. */
const NEIGHBOURS = 20;

export interface FocusReturn<T> {
  /** The control that opened the card (a list row); null when it was opened from the text. */
  opener: T | null;
  /** Controls after the opener in tab order when the card opened, nearest first. */
  after: T[];
  /** Controls before it, nearest first. */
  before: T[];
}

export const FROM_TEXT: FocusReturn<never> = { opener: null, after: [], before: [] };

/** Remember `opener` and the controls around it in `tabOrder`, leaving out `skip` (the card's own). */
export function rememberOpener<T>(tabOrder: T[], opener: T, skip: (el: T) => boolean): FocusReturn<T> {
  const i = tabOrder.indexOf(opener);
  const near = (list: T[]) => list.filter((el) => !skip(el)).slice(0, NEIGHBOURS);
  if (i === -1) return { opener, after: [], before: [] };
  return { opener, after: near(tabOrder.slice(i + 1)), before: near(tabOrder.slice(0, i).reverse()) };
}

/**
 * The control to focus once the card has closed, or null to focus the
 * editor. Opened from the text: the editor. Opened from a control: that
 * control while it is still usable, else `fallback()`, else the nearest
 * control that sat after it (then before it) and is still usable. That is the
 * next row when the note just triaged moved to another group, which remounts
 * its row in the same update that closes the card.
 */
export function returnFocusTarget<T>(
  saved: FocusReturn<T>,
  usable: (el: T) => boolean,
  fallback?: () => T | null
): T | null {
  if (saved.opener === null) return null;
  if (usable(saved.opener)) return saved.opener;
  return fallback?.() ?? saved.after.find(usable) ?? saved.before.find(usable) ?? null;
}
