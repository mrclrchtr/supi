// In-memory state for the umbrella package's LSP adapter.

import type { LspRuntimeController, ProjectServerInfo } from "@mrclrchtr/supi-lsp/api";

/**
 * Umbrella-level LSP runtime state.
 *
 * Mirrors the subset of `LspRuntimeState` from the old `supi-lsp` pi adapter
 * that the umbrella actually needs. The controller field owns the library-level
 * lifecycle, while the remaining fields track the umbrella adapter's own state.
 */
export interface CodeIntelLspRuntimeState {
  controller: LspRuntimeController | null;
  inlineSeverity: number;
  projectServers: ProjectServerInfo[];
  lspActive: boolean;
}

export function createCodeIntelLspRuntimeState(): CodeIntelLspRuntimeState {
  return {
    controller: null,
    inlineSeverity: 1,
    projectServers: [],
    lspActive: false,
  };
}
