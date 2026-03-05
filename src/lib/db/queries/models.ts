import { db } from "../index";
import { customModels } from "../schema";
import { eq } from "drizzle-orm";

export function listCustomModels() {
  return db.select().from(customModels).all();
}

export function getCustomModel(id: number) {
  return db.select().from(customModels).where(eq(customModels.id, id)).get();
}

export function createCustomModel(data: {
  name: string;
  provider: "openrouter" | "ollama";
  modelId: string;
  baseUrl?: string | null;
  isActive?: boolean;
}) {
  return db
    .insert(customModels)
    .values({
      name: data.name,
      provider: data.provider,
      modelId: data.modelId,
      baseUrl: data.baseUrl ?? null,
      isActive: data.isActive ?? true,
    })
    .returning()
    .get();
}

export function updateCustomModel(
  id: number,
  data: {
    name?: string;
    provider?: "openrouter" | "ollama";
    modelId?: string;
    baseUrl?: string | null;
    isActive?: boolean;
  }
) {
  return db
    .update(customModels)
    .set(data)
    .where(eq(customModels.id, id))
    .returning()
    .get();
}

export function deleteCustomModel(id: number) {
  return db.delete(customModels).where(eq(customModels.id, id)).run();
}
