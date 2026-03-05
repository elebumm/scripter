import { db } from "../index";
import { evaluationProfiles } from "../schema";
import { eq, desc } from "drizzle-orm";

export function listProfiles() {
  return db
    .select()
    .from(evaluationProfiles)
    .orderBy(desc(evaluationProfiles.isDefault), evaluationProfiles.name)
    .all();
}

export function getProfile(id: number) {
  return db
    .select()
    .from(evaluationProfiles)
    .where(eq(evaluationProfiles.id, id))
    .get();
}

export function getDefaultProfile() {
  return db
    .select()
    .from(evaluationProfiles)
    .where(eq(evaluationProfiles.isDefault, true))
    .limit(1)
    .get();
}

export function createProfile(data: {
  name: string;
  systemPrompt: string;
  criteriaWeights?: string;
  isDefault?: boolean;
}) {
  return db
    .insert(evaluationProfiles)
    .values({
      name: data.name,
      systemPrompt: data.systemPrompt,
      criteriaWeights: data.criteriaWeights ?? "{}",
      isDefault: data.isDefault ?? false,
    })
    .returning()
    .get();
}

export function updateProfile(
  id: number,
  data: {
    name?: string;
    systemPrompt?: string;
    criteriaWeights?: string;
    isDefault?: boolean;
  }
) {
  return db
    .update(evaluationProfiles)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(evaluationProfiles.id, id))
    .returning()
    .get();
}

export function deleteProfile(id: number) {
  return db.delete(evaluationProfiles).where(eq(evaluationProfiles.id, id)).run();
}
