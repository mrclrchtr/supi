/**
 * Typed request context helper for consumers that need a convenient view
 * of the capability state for a workspace cwd.
 *
 * This is the primary way that `supi-code-intelligence` reads capability
 * state from the shared runtime. Substrates register providers through
 * {@link WorkspaceRuntime} directly.
 */

import type { CapabilityState, SemanticProvider, StructuralProvider } from "../capability/types.ts";
import type { WorkspaceRuntime } from "./runtime.ts";

/**
 * A workspace-scoped request context that provides access to active
 * semantic and structural capabilities along with their availability
 * state and the cached project model.
 */
export interface WorkspaceContext {
  /** The working directory this context is scoped to. */
  cwd: string;
  /** Semantic analysis capability state and provider. */
  semantic: { state: CapabilityState; provider: SemanticProvider | null };
  /** Structural analysis capability state and provider. */
  structural: { state: CapabilityState; provider: StructuralProvider | null };
}

/**
 * Create a typed workspace context from the shared runtime.
 *
 * @param cwd - The working directory for this context.
 * @param runtime - The shared workspace runtime instance.
 * @returns A snapshot of the capability state for this workspace.
 */
export function createWorkspaceContext(cwd: string, runtime: WorkspaceRuntime): WorkspaceContext {
  const ws = runtime.getWorkspace(cwd);
  return {
    cwd,
    semantic: ws.semantic,
    structural: ws.structural,
  };
}
