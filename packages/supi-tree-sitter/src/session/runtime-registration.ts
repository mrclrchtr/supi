/**
 * Tree-sitter-to-runtime capability registration.
 *
 * Adapts a TreeSitterService into the runtime's StructuralProvider interface
 * via the existing tree-sitter-provider adapter, and registers/unregisters it
 * with the shared WorkspaceRuntime at session lifecycle boundaries.
 */

import type { WorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { createTreeSitterProvider } from "../provider/tree-sitter-provider.ts";
import type { TreeSitterService } from "../types.ts";

/**
 * Register tree-sitter structural capabilities for a workspace cwd.
 *
 * Wraps TreeSitterService into a StructuralProvider via the existing
 * structural adapter and publishes it into the shared workspace runtime.
 */
export function registerTreeSitterCapabilities(
  runtime: WorkspaceRuntime,
  cwd: string,
  service: TreeSitterService,
): void {
  const provider = createTreeSitterProvider(service);
  runtime.registerStructural(cwd, provider);
}

/**
 * Unregister tree-sitter structural capabilities for a workspace cwd.
 *
 * Clears only the structural capability slot — semantic (LSP) state
 * is left intact so that a tree-sitter session restart does not wipe
 * LSP capabilities that were registered earlier in the same lifecycle.
 */
export function unregisterTreeSitterCapabilities(runtime: WorkspaceRuntime, cwd: string): void {
  runtime.clearStructural(cwd);
}
