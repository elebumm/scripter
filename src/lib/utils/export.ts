import type { FactNote, NoteWithAnchor } from "@/types";
import { leadingH1Text } from "./reading-time";

/** "My Great Video!" -> "my-great-video" (falls back to "script"). */
export function slugifyTitle(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "script";
}

export function scriptFilename(title: string, suffix?: string): string {
  return `${slugifyTitle(title)}${suffix ? `-${suffix}` : ""}.md`;
}

const PRIORITY_LABEL = { high: "High", medium: "Medium", low: "Low" } as const;

function quote(text: string): string {
  return text
    .split("\n")
    .map((line) => `  > ${line}`)
    .join("\n");
}

function noteBlock(note: NoteWithAnchor, lensNames: (note: NoteWithAnchor) => string[]): string {
  const lines = [`- **${PRIORITY_LABEL[note.priority]} · ${note.category}**: ${note.issue}`, quote(note.anchorText)];
  if (note.why) lines.push(`  Why: ${note.why}`);
  if (note.question) lines.push(`  Question: ${note.question}`);
  const lenses = lensNames(note);
  if (lenses.length) lines.push(`  _Raised by: ${lenses.join(", ")}_`);
  return lines.join("\n");
}

/**
 * The draft (the writer's own words, untouched) followed by the council's
 * notes and the fact notes, for reading outside the app.
 */
export function buildNotesExport({
  title,
  content,
  notes,
  factNotes = [],
  lensNames = () => [],
}: {
  title: string;
  content: string;
  notes: NoteWithAnchor[];
  factNotes?: FactNote[];
  lensNames?: (note: NoteWithAnchor) => string[];
}): string {
  const open = notes.filter((n) => n.status === "open" && !n.isStale);
  const addressed = notes.filter((n) => n.status === "addressed" || (n.status === "open" && n.isStale));
  const pendingFacts = factNotes.filter((f) => f.status !== "dismissed");

  const heading = title.trim() || "Untitled script";
  const body = content.trim();
  // An untitled script's display title is its own first H1: don't repeat it.
  const opensWithTitle = leadingH1Text(body) === heading;
  let doc = `${opensWithTitle ? "" : `# ${heading}\n\n`}${body}\n\n---\n\n`;

  if (open.length) {
    doc += `## Open notes\n\n${open.map((n) => noteBlock(n, lensNames)).join("\n\n")}\n\n`;
  }
  if (addressed.length) {
    doc += `## Addressed since last pass\n\n${addressed.map((n) => noteBlock(n, lensNames)).join("\n\n")}\n\n`;
  }
  if (pendingFacts.length) {
    const blocks = pendingFacts.map((f) => {
      const lines = [`- **${f.verdict}**: ${f.explanation}`, quote(f.claimText)];
      for (const s of f.sources) lines.push(`  - [${s.title || s.url}](${s.url})`);
      return lines.join("\n");
    });
    doc += `## Fact notes\n\n${blocks.join("\n\n")}\n\n`;
  }
  if (!open.length && !addressed.length && !pendingFacts.length) {
    doc += `_No notes yet._\n`;
  }
  return doc;
}

export function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the download a moment to start before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
