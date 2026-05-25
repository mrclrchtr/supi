// Workspace session context primitives.
// Provides workspace identity, provider access, and project model caching.

import type { ArchitectureModel } from "../project/model.ts";
import type { SemanticProvider, StructuralProvider } from "../provider/types.ts";
import type { ProviderAvailability } from "../types.ts";

/**
 * A workspace-scoped request context that provides access to active
 * semantic and structural providers along with metadata and the
 * cached project model.
 */
export interface WorkspaceContext {
  cwd: string;
  /** Cached project model, null if not yet built or unavailable. */
  model: ArchitectureModel | null;
  semantic: { state: ProviderAvailability; provider: SemanticProvider | null };
  structural: { state: ProviderAvailability; provider: StructuralProvider | null };
}

/**
 * Create a workspace context for the given working directory.
 */
export function createWorkspaceContext(cwd: string): WorkspaceContext {
  return {
    cwd,
    model: null,
    semantic: { state: { kind: "unavailable", reason: "not yet initialized" }, provider: null },
    structural: { state: { kind: "unavailable", reason: "not yet initialized" }, provider: null },
  };
}
