// LSP semantic substrate adapter — wraps the session-scoped LSP service
// into the shared SemanticSubstrate contract using the shared provider.
// Each method lazily re-acquires the LSP service so the adapter bridges
// the pending startup window that session_start sets before server init.

import { getSessionLspService, waitForSessionLspService } from "@mrclrchtr/supi-lsp/api";
import { createLspSemanticProvider } from "@mrclrchtr/supi-lsp/provider/lsp-semantic-provider";
import type { SemanticSubstrate } from "./types.ts";

/**
 * Create a SemanticSubstrate backed by the session-scoped LSP service.
 * Each operation re-acquires the service lazily so it bridges the
 * startup pending window (when session_start sets pending before
 * startDetectedServers completes).
 */
export function createSemanticSubstrate(cwd: string): SemanticSubstrate {
  return {
    references: async (filePath, position) => {
      const lsp = await acquire(cwd);
      if (!lsp) return null;
      return createLspSemanticProvider(lsp).references(filePath, position);
    },
    implementation: async (filePath, position) => {
      const lsp = await acquire(cwd);
      if (!lsp) return null;
      return createLspSemanticProvider(lsp).implementation(filePath, position);
    },
    documentSymbols: async (filePath) => {
      const lsp = await acquire(cwd);
      if (!lsp) return null;
      return createLspSemanticProvider(lsp).documentSymbols(filePath);
    },
    workspaceSymbols: async (query) => {
      const lsp = await acquire(cwd);
      if (!lsp) return null;
      return createLspSemanticProvider(lsp).workspaceSymbols(query);
    },
  };
}

async function acquire(cwd: string) {
  const state = getSessionLspService(cwd);
  if (state.kind === "ready") return state.service;
  if (state.kind === "pending") {
    const waited = await waitForSessionLspService(cwd, 250);
    return waited.kind === "ready" ? waited.service : null;
  }
  return null;
}
