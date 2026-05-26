/**
 * Architecture model cache.
 *
 * Provides a cache-backed architecture model service that reuses models
 * within one workspace session. The cache is invalidated when the
 * workspace manager signals a structural change.
 *
 * The cache state lives in the workspace-session's modelCache slot.
 * This module provides the cache-read/refresh logic.
 */

import type { ArchitectureModel } from "../../model.ts";
import { buildArchitectureModel } from "./model-service.ts";

/**
 * Get a cached architecture model for the given cwd, or build one if
 * the cache is empty. Uses the session's modelCache to store results.
 */
export async function getCachedArchitectureModel(
  cwd: string,
  modelCache: Record<string, unknown>,
): Promise<ArchitectureModel | null> {
  const cached = modelCache.archModel as ArchitectureModel | undefined;
  if (cached) return cached;

  const model = await buildArchitectureModel(cwd);
  if (model) {
    modelCache.archModel = model;
  }
  return model;
}

/**
 * Invalidate the architecture model cache for a session.
 */
export function invalidateModelCache(modelCache: Record<string, unknown>): void {
  delete modelCache.archModel;
}
