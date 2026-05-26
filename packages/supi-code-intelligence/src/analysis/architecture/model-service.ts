/**
 * Architecture model service.
 *
 * Provides the canonical API for building architecture models.
 * This is a thin service wrapper around the model.ts logic.
 * Cache management is handled by model-cache.ts.
 */

import type { ArchitectureModel } from "../../model.ts";
import { buildArchitectureModel as buildModel } from "../../model.ts";

export type { ArchitectureModel } from "../../model.ts";

/**
 * Build an architecture model for the given workspace directory.
 *
 * Delegates to the canonical model builder in src/model.ts.
 * The cache layer (model-cache.ts) should call this when
 * a fresh model is needed.
 */
export async function buildArchitectureModel(cwd: string): Promise<ArchitectureModel | null> {
  return buildModel(cwd);
}
