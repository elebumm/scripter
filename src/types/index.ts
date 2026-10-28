// Client-facing types. Council, notes, beats and fact notes live in ./review.
export type * from "./review";

export type ScriptStatus = "draft" | "in-progress" | "final";

export interface Script {
  id: number;
  title: string;
  context: string;
  targetLength: number | null;
  status: ScriptStatus;
  /** Latest saved version number; 0 until the first version is saved. */
  currentVersion: number;
  icon: string | null;
  archived: boolean;
  isTemplate: boolean;
  templateDescription: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScriptVersion {
  id: number;
  scriptId: number;
  version: number;
  content: string;
  wordCount: number;
  createdAt: string;
}
