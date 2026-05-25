// Umbrella LSP adapter state for supi-code-intelligence.
//
// Mirrors the shape of supi-lsp's LspRuntimeState but owns its lifecycle
// through LspRuntimeController from @mrclrchtr/supi-lsp/api.

import type { LspRuntimeController } from "@mrclrchtr/supi-lsp/api";

/** LSP status overlay UI state (handle + close). */
export interface LspInspectorState {
  handle: (() => void) | null;
  close: (() => void) | null;
}

/**
 * In-memory state for the umbrella LSP adapter.
 *
 * Wraps the LspRuntimeController and tracks session-level state
 * for diagnostic injection, stale detection, and UI updates.
 */
export interface LspAdapterState {
  controller: LspRuntimeController | null;
  inlineSeverity: number;
  inspector: LspInspectorState;
  lastDiagnosticsFingerprint: string | null;
  currentContextToken: string | null;
  contextCounter: number;
  lspActive: boolean;
  staleSuspected: boolean;
  lastWorkspaceChangeAt: number;
  sentinelSnapshot: Map<string, number>;
}

export function createLspAdapterState(): LspAdapterState {
  return {
    controller: null,
    inlineSeverity: 1,
    inspector: { handle: null, close: null },
    lastDiagnosticsFingerprint: null,
    currentContextToken: null,
    contextCounter: 0,
    lspActive: false,
    staleSuspected: false,
    lastWorkspaceChangeAt: 0,
    sentinelSnapshot: new Map(),
  };
}
