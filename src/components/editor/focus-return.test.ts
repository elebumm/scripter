import { describe, expect, it } from "vitest";
import { FROM_TEXT, rememberOpener, returnFocusTarget } from "./focus-return";

/** A stand-in for a control: on the page or not. */
interface Control {
  name: string;
  onPage: boolean;
}

const control = (name: string): Control => ({ name, onPage: true });
const usable = (c: Control) => c.onPage;

/** Header, editor, the card's own buttons, then the notes list in the sidebar. */
function page() {
  const c = {
    header: control("header"),
    editor: control("editor"),
    cardAddress: control("card: Mark addressed"),
    cardClose: control("card: close"),
    openGroup: control("Open group"),
    note1: control("note 1"),
    note2: control("note 2"),
    note3: control("note 3"),
    addressedGroup: control("Addressed group"),
  };
  const tabOrder = Object.values(c);
  const inCard = (x: Control) => x === c.cardAddress || x === c.cardClose;
  return { c, tabOrder, inCard };
}

describe("returnFocusTarget", () => {
  it("hands focus back to the row that opened the card", () => {
    const { c, tabOrder, inCard } = page();
    const saved = rememberOpener(tabOrder, c.note2, inCard);
    expect(returnFocusTarget(saved, usable)?.name).toBe("note 2");
  });

  it("moves to the next row when the triaged note left the group in the same update", () => {
    const { c, tabOrder, inCard } = page();
    const saved = rememberOpener(tabOrder, c.note2, inCard);
    // Mark addressed: the card closes and note 2's row is remounted in another group.
    c.note2.onPage = false;
    c.cardAddress.onPage = false;
    c.cardClose.onPage = false;
    expect(returnFocusTarget(saved, usable)?.name).toBe("note 3");

    // The last open note: what came after it, never the card's own buttons.
    const last = rememberOpener(tabOrder, c.note3, inCard);
    c.note3.onPage = false;
    expect(returnFocusTarget(last, usable)?.name).toBe("Addressed group");
    c.addressedGroup.onPage = false;
    expect(returnFocusTarget(last, usable)?.name).toBe("note 1");
  });

  it("prefers the page's own choice over the neighbours", () => {
    const { c, tabOrder, inCard } = page();
    const saved = rememberOpener(tabOrder, c.note2, inCard);
    c.note2.onPage = false;
    const moved = control("note 2 (Addressed)");
    expect(returnFocusTarget(saved, usable, () => moved)).toBe(moved);
    expect(returnFocusTarget(saved, usable, () => null)?.name).toBe("note 3");
  });

  it("leaves focus to the editor for a card opened from the text", () => {
    const { c } = page();
    expect(returnFocusTarget(FROM_TEXT, usable, () => c.note1)).toBeNull();
  });
});
