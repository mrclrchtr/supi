// Shared test helper: register a mock CodeProvider for a given cwd.
// Returns the registered provider so tests can customize individual methods.

import type { CodeProvider } from "../../src/provider/code-provider.ts";
import { registerCodeProvider } from "../../src/provider/registry.ts";

/** Register a mock CodeProvider for cwd with default noop methods. */
export function registerMockProvider(cwd: string, overrides: Partial<CodeProvider> = {}): void {
  const noopSemantic = async () => null;
  const noopStructural = async (_file: string) =>
    ({ kind: "unsupported-language" as const, file: _file, message: "mock" }) as const;

  const provider: CodeProvider = {
    references: overrides.references ?? noopSemantic,
    implementation: overrides.implementation ?? noopSemantic,
    documentSymbols: overrides.documentSymbols ?? noopSemantic,
    workspaceSymbols: overrides.workspaceSymbols ?? noopSemantic,
    calleesAt: overrides.calleesAt ?? noopStructural,
    exports: overrides.exports ?? noopStructural,
    outline: overrides.outline ?? noopStructural,
    imports: overrides.imports ?? noopStructural,
    nodeAt: overrides.nodeAt ?? noopStructural,
  };

  registerCodeProvider(cwd, provider);
}
