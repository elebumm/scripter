import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import { MarkdownManager } from "@tiptap/markdown";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { findAnchorInText, markdownToPlain } from "@/lib/text/anchor";
import {
  annotationIdAtClick,
  annotationsPluginKey,
  buildTextMap,
  createAnchorFinder,
  createAnnotationsPlugin,
  findAnchorRangeInDoc,
  findAnnotationAtPos,
  type Annotation,
} from "./annotations-extension";
import { getReviewableSection, MIN_SECTION_CHARS } from "./section";

// The markdown-relevant part of RichEditor's extension list.
const extensions = [
  StarterKit.configure({ link: false, underline: false }),
  LinkExtension.configure({ openOnClick: false }),
  Table.configure({ resizable: false }),
  TableRow,
  TableCell,
  TableHeader,
];
const schema = getSchema(extensions);
const manager = new MarkdownManager({ extensions });
const parse = (md: string): PMNode => schema.nodeFromJSON(manager.parse(md));

/** The rendered text a range covers, with hard breaks as "\n". */
const textAt = (doc: PMNode, r: { from: number; to: number }) => doc.textBetween(r.from, r.to, "\n", "\n");

const SCRIPT = [
  "# The chip that ate the world",
  "",
  "Open on a **cold open**: the fab at 3 a.m., nobody talking.",
  "",
  "---",
  "",
  "## Act 1 (~4 min)",
  "",
  "- First beat: the *setup* and the stakes",
  "- Second beat: the [first failure](https://example.com/a_b)",
  "",
  "> [!tip] Hook idea",
  "> Keep it under ~30 seconds, not two minutes",
  "",
  "1. Ordered item one",
  "2. Ordered item two",
  "",
  "Line one of the verse  ",
  "line two after a hard break",
  "",
  "It’s a “quoted” line — with smart punctuation…",
  "",
  "| Column a | Column b |",
  "| --- | --- |",
  "| Cell text here | Another cell |",
  "",
  "---",
  "",
  "## Act 2",
  "",
  "The last paragraph after the second rule, where the payoff lands for the viewer.",
].join("\n");

describe("buildTextMap / findAnchorRangeInDoc", () => {
  const doc = parse(SCRIPT);

  it("maps every text character to its own document position", () => {
    const map = buildTextMap(doc);
    expect(map.pos).toHaveLength(map.text.length);
    for (let i = 0; i < map.text.length; i++) {
      const ch = map.text[i];
      if (ch === "\n" || ch === " ") continue;
      expect(doc.textBetween(map.pos[i], map.pos[i] + 1)).toBe(ch);
    }
  });

  it.each([
    ["plain text after a heading", "the fab at 3 a.m., nobody talking.", "the fab at 3 a.m., nobody talking."],
    ["an anchor with emphasis markers", "Open on a **cold open**: the fab", "Open on a cold open: the fab"],
    ["a bullet list item, marker included", "- First beat: the *setup* and the stakes", "First beat: the setup and the stakes"],
    ["link text inside a list", "Second beat: the [first failure](https://example.com/a_b)", "Second beat: the first failure"],
    ["a heading after a horizontal rule", "## Act 1 (~4 min)", "Act 1 (~4 min)"],
    ["a callout line inside a blockquote", "> Keep it under ~30 seconds, not two minutes", "Keep it under ~30 seconds, not two minutes"],
    ["an ordered list item", "2. Ordered item two", "Ordered item two"],
    ["text after the second horizontal rule", "where the payoff lands for the viewer.", "where the payoff lands for the viewer."],
    ["a table cell", "Cell text here", "Cell text here"],
  ])("finds %s exactly", (_label, anchor, rendered) => {
    const range = findAnchorRangeInDoc(doc, anchor);
    expect(range).not.toBeNull();
    expect(textAt(doc, range!)).toBe(rendered);
  });

  it("spans a hard break", () => {
    const range = findAnchorRangeInDoc(doc, "of the verse line two after");
    expect(range).not.toBeNull();
    expect(textAt(doc, range!)).toBe("of the verse\nline two after");
  });

  it("normalises quotes, dashes and ellipses", () => {
    const range = findAnchorRangeInDoc(doc, `It's a "quoted" line - with smart punctuation...`);
    expect(range).not.toBeNull();
    expect(textAt(doc, range!)).toBe("It’s a “quoted” line — with smart punctuation…");
  });

  it("falls back to a case-insensitive match", () => {
    const range = findAnchorRangeInDoc(doc, "OPEN ON A COLD OPEN");
    expect(range).not.toBeNull();
    expect(textAt(doc, range!)).toBe("Open on a cold open");
  });

  it("returns null for text that is not in the script", () => {
    expect(findAnchorRangeInDoc(doc, "a sentence the writer never wrote")).toBeNull();
    expect(findAnchorRangeInDoc(doc, "   ")).toBeNull();
  });

  it("agrees with findAnchorInText on the same projection", () => {
    const map = buildTextMap(doc);
    const find = createAnchorFinder(map);
    for (const anchor of ["nobody talking", "Ordered item one", "it’s a “quoted”", "ACT 2", "The last paragraph"]) {
      const expected = findAnchorInText(map.text, markdownToPlain(anchor));
      const range = find(anchor);
      expect(range === null).toBe(expected === null);
      if (expected && range) {
        expect(range.from).toBe(map.pos[expected.start]);
        expect(range.to).toBe(map.pos[expected.end - 1] + 1);
      }
    }
  });
});

describe("annotations plugin", () => {
  const note = (id: string, anchorText: string, active = false): Annotation => ({
    id,
    kind: "note",
    anchorText,
    priority: "high",
    active,
  });

  function stateWith(md: string, annotations: Annotation[]) {
    const state = EditorState.create({ doc: parse(md), plugins: [createAnnotationsPlugin()] });
    return state.apply(state.tr.setMeta(annotationsPluginKey, { type: "set", annotations }));
  }

  it("decorates found anchors and skips missing ones", () => {
    const state = stateWith(SCRIPT, [note("note:1", "nobody talking"), note("note:2", "not in the script at all")]);
    const plugin = annotationsPluginKey.getState(state)!;
    expect([...plugin.ranges.keys()]).toEqual(["note:1"]);
    // One inline highlight plus one priority-dot widget.
    expect(plugin.decorations.find()).toHaveLength(2);
    expect(textAt(state.doc, plugin.ranges.get("note:1")!)).toBe("nobody talking");
  });

  it("follows edits and drops a highlight when its passage is gone", () => {
    let state = stateWith(SCRIPT, [note("note:1", "nobody talking")]);
    const before = annotationsPluginKey.getState(state)!.ranges.get("note:1")!;

    state = state.apply(state.tr.insertText("Cold. ", 1));
    const moved = annotationsPluginKey.getState(state)!.ranges.get("note:1")!;
    expect(moved.from).toBe(before.from + 6);
    expect(textAt(state.doc, moved)).toBe("nobody talking");

    state = state.apply(state.tr.delete(moved.from, moved.to));
    expect(annotationsPluginKey.getState(state)!.ranges.has("note:1")).toBe(false);
  });

  it("reports the innermost annotation at a position", () => {
    const state = stateWith(SCRIPT, [note("note:1", "the fab at 3 a.m., nobody talking."), note("note:2", "nobody talking")]);
    const inner = annotationsPluginKey.getState(state)!.ranges.get("note:2")!;
    expect(findAnnotationAtPos(state, inner.from + 2)).toBe("note:2");
    expect(findAnnotationAtPos(state, 1)).toBeNull();
  });

  it("treats a click just past a highlight as plain text", () => {
    const md = "First sentence here. The highlighted ending sentence.\n\nNext paragraph.";
    const state = stateWith(md, [note("note:1", "The highlighted ending sentence."), note("note:2", "First sentence")]);
    const ranges = annotationsPluginKey.getState(state)!.ranges;
    const end = ranges.get("note:1")!;
    const mid = ranges.get("note:2")!;
    // A click whose target is no highlight element (blank space after the
    // line, the half of the next character), as ProseMirror reports it.
    const plainClick = { target: null } as unknown as MouseEvent;

    expect(findAnnotationAtPos(state, end.to)).toBeNull();
    expect(annotationIdAtClick(state, end.to, plainClick)).toBeNull();
    expect(annotationIdAtClick(state, mid.to, plainClick)).toBeNull();
    expect(annotationIdAtClick(state, mid.from, plainClick)).toBeNull();
    expect(annotationIdAtClick(state, mid.from + 3, plainClick)).toBe("note:2");
    expect(findAnnotationAtPos(state, mid.from)).toBe("note:2");
  });
});

describe("getReviewableSection", () => {
  const doc = parse(SCRIPT);
  const at = (pos: number, to = pos) =>
    EditorState.create({ doc, selection: TextSelection.create(doc, pos, to) });

  it("uses a long enough selection", () => {
    const range = findAnchorRangeInDoc(doc, "The last paragraph after the second rule, where the payoff lands")!;
    const section = getReviewableSection(at(range.from, range.to));
    expect(section?.source).toBe("selection");
    expect(section?.text).toBe("The last paragraph after the second rule, where the payoff lands");
  });

  it("ignores a short selection and falls back to the H2 around the cursor", () => {
    const range = findAnchorRangeInDoc(doc, "Ordered item two")!;
    expect(range.to - range.from).toBeLessThan(MIN_SECTION_CHARS);
    const section = getReviewableSection(at(range.from, range.to));
    expect(section?.source).toBe("heading");
    expect(section?.label).toBe("Act 1 (~4 min)");
    expect(section?.text.startsWith("Act 1 (~4 min)")).toBe(true);
    expect(section?.text).toContain("Ordered item two");
    // Stops at the next H2.
    expect(section?.text).not.toContain("Act 2");
  });

  it("returns null before the first H2 with no selection", () => {
    const range = findAnchorRangeInDoc(doc, "nobody talking")!;
    expect(getReviewableSection(at(range.from))).toBeNull();
  });
});
