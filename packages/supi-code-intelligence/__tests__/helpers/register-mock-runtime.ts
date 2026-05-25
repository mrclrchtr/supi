/**
 * Shared test helper: register mock capabilities into the shared workspace
 * runtime for a given cwd.
 *
 * Replaces the old registerMockProvider helper that used CodeProvider
 * registry directly.
 */

import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import type { CodeProvider } from "../../src/workspace/request-context.ts";

/**
 * Register a mock CodeProvider's worth of capabilities for cwd.
 * Sets up both semantic and structural mock providers in the shared runtime.
 */
export function registerMockProvider(cwd: string, overrides: Partial<CodeProvider> = {}): void {
  const runtime = getDefaultWorkspaceRuntime();

  const noopSemantic = async () => null;
  const noopStructural = async (_file: string) =>
    ({ kind: "unsupported-language" as const, file: _file, message: "mock" }) as const;

  // Register semantic provider
  runtime.registerSemantic(cwd, {
    references: overrides.references ?? noopSemantic,
    implementation: overrides.implementation ?? noopSemantic,
    documentSymbols: overrides.documentSymbols ?? noopSemantic,
    workspaceSymbols: overrides.workspaceSymbols ?? noopSemantic,
  });

  // Register structural provider
  runtime.registerStructural(cwd, {
    calleesAt: overrides.calleesAt ?? noopStructural,
    exports: overrides.exports ?? noopStructural,
    outline: overrides.outline ?? noopStructural,
    imports: overrides.imports ?? noopStructural,
    nodeAt: overrides.nodeAt ?? noopStructural,
  });
}

/** Clear all mock capabilities from the shared runtime. */
export function clearMockRuntime(): void {
  getDefaultWorkspaceRuntime().clearAll();
}
