// Umbrella LSP adapter state for supi-code-intelligence.
//
// Mirrors the shape of supi-lsp's LspRuntimeState but owns its lifecycle
// through LspRuntimeController from @mrclrchtr/supi-lsp/api.

import type { LspRuntimeController } from "@mrclrchtr/supi-lsp/api";
import type { WorkspaceProviderHostLease } from "../workspace-provider-host.ts";

/** LSP status overlay UI state (handle + close). */
export interface LspInspectorState {
  handle: (() => void) | null;
  close: (() => void) | null;
}

/**
 * In-memory state for the umbrella LSP adapter.
 *
 * Wraps the LspRuntimeController and tracks session-level state
 * for sentinel change detection and UI updates.
 */
export interface LspAdapterState {
  controller: LspRuntimeController | null;
  providerLease: WorkspaceProviderHostLease | null;
  inspector: LspInspectorState;
  lspActive: boolean;
  /** Snapshot of workspace sentinel files (package.json, tsconfig, lockfiles) for change detection. */
  sentinelSnapshot: Map<string, number>;
}

export function createLspAdapterState(): LspAdapterState {
  return {
    controller: null,
    providerLease: null,
    inspector: { handle: null, close: null },
    lspActive: false,
    sentinelSnapshot: new Map(),
  };
}
