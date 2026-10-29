// Restoring a saved version copies the writer's own older words into the
// draft. The current draft is kept as a version first unless a saved version
// already holds it, and the draft is never replaced when that save fails.
// Pure so it can be unit-tested.

/** What happens to the current draft when a version is restored over it. */
export type DraftKeep =
  /** The draft is empty: nothing to keep. */
  | { kind: "empty" }
  /** A saved version already holds the draft word for word. */
  | { kind: "saved"; version: number }
  /** The draft is in no saved version yet: save it as one first. */
  | { kind: "save-first" };

export function draftKeepPlan(draft: string, versions: ReadonlyArray<{ version: number; content: string }>): DraftKeep {
  if (!draft.trim()) return { kind: "empty" };
  const match = versions.find((v) => v.content === draft);
  return match ? { kind: "saved", version: match.version } : { kind: "save-first" };
}

/** The confirm dialog's description; it says exactly what restoring will do. */
export function restoreDescription(label: string, keep: DraftKeep): string {
  const lead = `The editor will show the text of ${label}.`;
  switch (keep.kind) {
    case "empty":
      return `${lead} Your current draft is empty, so nothing is lost.`;
    case "saved":
      return `${lead} Your current draft is already saved as v${keep.version}, so nothing is lost.`;
    case "save-first":
      return `${lead} Your current draft isn't in any saved version yet, so it is saved as a new version first. If that save fails, nothing is restored.`;
  }
}

export interface KeptVersion {
  version: number;
  /** False when the draft already matched the latest version. */
  created: boolean;
}

export type RestoreResult = { restored: true; kept: KeptVersion | null } | { restored: false };

/**
 * Keep the draft as a version when needed, then apply the restore. When the
 * keep-save fails (null), `apply` is never called and the draft stays as it is.
 */
export async function restoreDraft(
  saveFirst: boolean,
  saveVersion: () => Promise<KeptVersion | null>,
  apply: () => void
): Promise<RestoreResult> {
  let kept: KeptVersion | null = null;
  if (saveFirst) {
    kept = await saveVersion();
    if (!kept) return { restored: false };
  }
  apply();
  return { restored: true, kept };
}

export function restoredMessage(kept: KeptVersion | null): string {
  if (!kept) return "Restored as your draft.";
  return kept.created
    ? `Restored. Your previous draft is saved as version ${kept.version}.`
    : `Restored. Your previous draft is already saved as version ${kept.version}.`;
}

export const RESTORE_ABORTED_MESSAGE =
  "Nothing was restored: your current draft couldn't be saved as a version first, so it was left as it is.";
