// LSP CodeProvider adapter — wraps SessionLspService into the unified
// CodeProvider contract.

import type { CodeProvider } from "@mrclrchtr/supi-code-intelligence/api";
import type { SessionLspService } from "../session/service-registry.ts";
import { createLspSemanticProvider } from "./lsp-semantic-provider.ts";

/**
 * Create a CodeProvider backed by a SessionLspService.
 *
 * Semantic methods delegate to the existing LSP semantic adapter.
 * Structural methods return unsupported-language results since LSP
 * does not provide tree-sitter operations.
 */
export function createLspCodeProvider(lsp: SessionLspService): CodeProvider {
  const semantic = createLspSemanticProvider(lsp);

  return {
    // Semantic methods
    references: semantic.references,
    implementation: semantic.implementation,
    documentSymbols: semantic.documentSymbols,
    workspaceSymbols: semantic.workspaceSymbols,

    // Structural methods — unsupported by LSP
    calleesAt: async (file, _line, _character) => ({
      kind: "unsupported-language" as const,
      file,
      message: "Callees require tree-sitter (structural analysis). Use tree_sitter_callees.",
    }),
    exports: async (file) => ({
      kind: "unsupported-language" as const,
      file,
      message: "Exports require tree-sitter (structural analysis). Use tree_sitter_exports.",
    }),
    outline: async (file) => ({
      kind: "unsupported-language" as const,
      file,
      message: "Outline requires tree-sitter (structural analysis). Use tree_sitter_outline.",
    }),
    imports: async (file) => ({
      kind: "unsupported-language" as const,
      file,
      message: "Imports require tree-sitter (structural analysis). Use tree_sitter_imports.",
    }),
    nodeAt: async (file, _line, _character) => ({
      kind: "unsupported-language" as const,
      file,
      message: "node_at requires tree-sitter (structural analysis). Use tree_sitter_node_at.",
    }),
  };
}

/**
 * Create a lazy CodeProvider that waits for the LSP service to become ready.
 *
 * During the session_start startup window, this provider is registered
 * so that code-intelligence lookups that arrive before server init
 * completes will wait for the real provider rather than seeing
 * "unavailable" and immediately returning an error.
 *
 * The registered real provider (via registerCodeProvider after LSP is
 * ready) composes with this one — the real provider takes precedence
 * via the registry's composeProviders fallback logic.
 */
export function createPendingLspCodeProvider(_cwd: string): CodeProvider {
  return {
    // Semantic methods: all return null during startup. After server init,
    // the real provider's composeProviders fallback fills in real results.
    references: async () => null,
    implementation: async () => null,
    documentSymbols: async () => null,
    workspaceSymbols: async () => null,

    // Structural methods: unsupported by LSP
    calleesAt: async (file) => ({
      kind: "unsupported-language" as const,
      file,
      message: "Callees require tree-sitter (structural analysis). Use tree_sitter_callees.",
    }),
    exports: async (file) => ({
      kind: "unsupported-language" as const,
      file,
      message: "Exports require tree-sitter (structural analysis). Use tree_sitter_exports.",
    }),
    outline: async (file) => ({
      kind: "unsupported-language" as const,
      file,
      message: "Outline requires tree-sitter (structural analysis). Use tree_sitter_outline.",
    }),
    imports: async (file) => ({
      kind: "unsupported-language" as const,
      file,
      message: "Imports require tree-sitter (structural analysis). Use tree_sitter_imports.",
    }),
    nodeAt: async (file) => ({
      kind: "unsupported-language" as const,
      file,
      message: "node_at requires tree-sitter (structural analysis). Use tree_sitter_node_at.",
    }),
  };
}
