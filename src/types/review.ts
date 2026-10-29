// Types for the council, notes, beats and fact notes as the client sees them
// (API responses). DB rows are mapped onto these in src/lib/db/queries/*.

import type { NoteCategory, PersonaCritique, Priority, FactVerdict } from "@/lib/llm/schemas";

export type NoteStatus = "open" | "addressed" | "dismissed";

export interface Note {
  id: number;
  scriptId: number;
  versionId: number;
  runId: string | null;
  anchorText: string;
  issue: string;
  why: string;
  question: string | null;
  category: NoteCategory;
  priority: Priority;
  /** Persona slugs that raised the note. */
  personaSlugs: string[];
  /** Model display names behind those personas. */
  sourceModels: string[];
  status: NoteStatus;
  statusChangedAt: string | null;
  createdAt: string;
}

/** A note checked against the current editor text. */
export interface NoteWithAnchor extends Note {
  /** The anchor can no longer be found in the current text. */
  isStale: boolean;
}

export type BeatStatus = "planned" | "drafted" | "cut";

export interface Beat {
  id: number;
  scriptId: number;
  position: number;
  title: string;
  purpose: string;
  writerNotes: string;
  targetSeconds: number | null;
  status: BeatStatus;
  source: "ai" | "writer";
  anchorText: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A council member: a persona prompt run on one model. */
export interface Persona {
  id: number;
  slug: string;
  name: string;
  description: string;
  systemPrompt: string;
  /** JSON-decoded criteria weights keyed by criterion id (1 = normal). */
  criteriaWeights: Record<string, number>;
  modelSlug: string;
  modelName: string;
  icon: string | null;
  color: string | null;
  isActive: boolean;
  position: number;
}

export type LensStatus = "idle" | "pending" | "streaming" | "complete" | "error";

/** Live state of one persona during a council run. */
export interface LensState {
  personaId: number;
  personaSlug: string;
  personaName: string;
  modelName: string;
  status: LensStatus;
  /** Partial while streaming, complete once done. */
  critique: Partial<PersonaCritique> | null;
  error?: string;
  evaluationId?: number;
  costUsd?: number;
  durationMs?: number;
}

export interface ScoreRow {
  criterionId: string;
  label: string;
  /** persona slug -> score */
  scores: Record<string, number>;
  average: number | null;
}

/**
 * Why the server dropped one of the synthesizer's notes: its anchor isn't the
 * writer's text (or is too short), it lies outside a reviewed section, it was
 * only supplied wording, it repeats another note, or the writer dismissed it.
 */
export type NoteDropReason = "anchor" | "section" | "wording" | "duplicate" | "dismissed";

/** What happened to the synthesizer's notes when they were validated and saved. */
export interface SynthesisNoteReport {
  /** Notes saved as open notes. */
  saved: number;
  /** Notes dropped, in total and by reason. */
  dropped: number;
  dropReasons: Partial<Record<NoteDropReason, number>>;
  /**
   * Open notes from earlier passes kept open because this pass's notes didn't
   * all survive (otherwise this pass's notes replace them).
   */
  previousKept: number;
}

/** A persisted synthesis (latest per script, or per run in history). */
export interface Synthesis {
  summaryId: number;
  scriptId: number;
  versionId: number;
  versionNumber: number;
  runId: string;
  overview: string;
  scoreTable: ScoreRow[];
  overall: { scores: Record<string, number>; average: number | null };
  lenses: Array<{ personaSlug: string; personaName: string; modelName: string; evaluationId: number; critique: PersonaCritique | null; status: "complete" | "error"; error?: string }>;
  failedLenses: string[];
  /** Every call of the run: critiques (retries included) and every synthesis attempt. */
  costUsd: number | null;
  createdAt: string;
  /** Saved syntheses only (absent on rebuilt and older ones). */
  noteReport?: SynthesisNoteReport;
}

export interface FactNote {
  id: number;
  factCheckId: number;
  scriptId: number;
  versionId: number;
  claimText: string;
  verdict: FactVerdict;
  explanation: string;
  sources: Array<{ url: string; title?: string }>;
  category: string;
  status: "pending" | "acknowledged" | "dismissed";
  createdAt: string;
}
