/**
 * LSP-to-runtime capability registration.
 *
 * Adapts a SessionLspService into the runtime's SemanticProvider interface
 * and registers/unregisters it with the shared WorkspaceRuntime at session
 * lifecycle boundaries.
 */

import type { WorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { createLspSemanticProvider } from "../provider/lsp-semantic-provider.ts";
import type { SessionLspService } from "./service-registry.ts";

/**
 * Register LSP capabilities for a workspace cwd in pending state.
 *
 * Use this once the session service exists but before the language server has
 * finished its initial readiness pipeline. Calls can then be deferred instead
 * of silently observing "no provider" during startup.
 */
export function registerPendingLspCapabilities(
  runtime: WorkspaceRuntime,
  cwd: string,
  service: SessionLspService,
): void {
  const provider = createLspSemanticProvider(service);
  runtime.registerSemanticPending(cwd, provider);
}

/**
 * Register LSP capabilities for a workspace cwd as ready.
 *
 * Wraps SessionLspService into a SemanticProvider via the existing semantic
 * adapter and publishes it into the shared workspace runtime so that
 * code-intelligence and other consumers can discover semantic analysis
 * availability.
 */
export function registerLspCapabilities(
  runtime: WorkspaceRuntime,
  cwd: string,
  service: SessionLspService,
): void {
  const provider = createLspSemanticProvider(service);
  runtime.registerSemantic(cwd, provider);
}

/** Promote an already-registered pending semantic provider to ready. */
export function markLspCapabilitiesReady(runtime: WorkspaceRuntime, cwd: string): void {
  runtime.markSemanticReady(cwd);
}

/**
 * Unregister LSP capabilities for a workspace cwd.
 *
 * Clears only the semantic capability slot — structural (tree-sitter)
 * state is left intact so that a later tree-sitter session_start does
 * not needlessly wipe LSP state on its own restart path.
 */
export function unregisterLspCapabilities(runtime: WorkspaceRuntime, cwd: string): void {
  runtime.clearSemantic(cwd);
}
