// Which stored title and which heading count as the script's title. Shared by
// the Drafts UI, the script page and the server (exports). Stored data is
// never changed.

const LEGACY_DEFAULT_TITLE = "Untitled Script";

/**
 * Older builds stored the default "Untitled Script" as a real title, and the
 * writer's typing sometimes landed on the end of it ("Untitled Scriptt",
 * "Untitled ScriptA tutorial about…"). Returns what the writer meant: "" for
 * the default or a stray keystroke on it, the typed text when a new title was
 * started on it, else the title as stored ("Untitled Scripture Study").
 */
function withoutLegacyDefault(title: string): string {
  if (!title.startsWith(LEGACY_DEFAULT_TITLE)) return title;
  const rest = title.slice(LEGACY_DEFAULT_TITLE.length);
  if (/^[A-Z"“'‘]/.test(rest)) return rest.trim();
  if (/^[a-z]{0,2}$/.test(rest.trim()) && !/^\s/.test(rest)) return "";
  return title;
}

/** The stored title is (or carries) the old "Untitled Script" default. */
export function isLegacyDefaultTitle(title: string): boolean {
  const trimmed = title.trim();
  return withoutLegacyDefault(trimmed) !== trimmed;
}

/** A template's placeholder heading such as `# [Title]` is not a headline. */
export function isPlaceholderHeading(heading: string): boolean {
  return /^\[[^\]]*\]$/.test(heading.trim());
}

/** The title the writer set: "" when blank or the legacy default. */
export function writerTitle(title: string | null | undefined): string {
  return withoutLegacyDefault((title ?? "").trim());
}

/** The draft's first `# Heading` as a title: "" when missing or a template placeholder. */
export function headingTitle(heading: string | null | undefined): string {
  const trimmed = (heading ?? "").trim();
  return isPlaceholderHeading(trimmed) ? "" : trimmed;
}

/** The title, else the draft's first `# Heading`, else "Untitled script". */
export function displayTitle(title: string | null | undefined, heading?: string | null): string {
  return writerTitle(title) || headingTitle(heading) || "Untitled script";
}
