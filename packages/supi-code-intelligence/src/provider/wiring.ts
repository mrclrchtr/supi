// Provider wiring — code-intelligence reads the LSP and Tree-sitter service
// registries and registers unified CodeProviders into the shared registry.
//
// This lives in code-intelligence (the hub) rather than in the individual
// substrate packages, so LSP and Tree-sitter can remain independent libraries
// without depending on code-intelligence at all.

import { clearCodeProvider, registerCodeProvider } from "./registry.ts";

/**
 * Wire up the LSP code provider by reading the session-scoped LSP service.
 * Called from code-intelligence's session_start handler.
 */
export async function wireLspProvider(cwd: string): Promise<void> {
  try {
    // Dynamic import — supi-lsp is an optional bundled dependency
    const { waitForSessionLspService } = await import("@mrclrchtr/supi-lsp/api");
    const { createLspCodeProvider } = await import(
      "@mrclrchtr/supi-lsp/provider/lsp-code-provider"
    );

    // Register a pending provider first so that code-intelligence lookups
    // during the startup window wait instead of failing immediately.
    const pendingProvider = createPendingLspCodeProvider();
    registerCodeProvider(cwd, pendingProvider);

    // Wait for the LSP service to become ready.
    const state = await waitForSessionLspService(cwd, 250);
    if (state.kind === "ready") {
      registerCodeProvider(cwd, createLspCodeProvider(state.service));
    }
  } catch {
    // supi-lsp not installed — no LSP provider available
  }
}

function createPendingLspCodeProvider(): import("./code-provider.ts").CodeProvider {
  return {
    references: async () => null,
    implementation: async () => null,
    documentSymbols: async () => null,
    workspaceSymbols: async () => null,
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

/**
 * Wire up the Tree-sitter code provider by reading the session-scoped
 * structural service. Called from code-intelligence's session_start handler.
 */
export async function wireTreeSitterProvider(cwd: string): Promise<void> {
  try {
    const { getSessionTreeSitterService } = await import("@mrclrchtr/supi-tree-sitter/api");
    const { createTreeSitterCodeProvider } = await import(
      "@mrclrchtr/supi-tree-sitter/provider/tree-sitter-code-provider"
    );

    const state = getSessionTreeSitterService(cwd);
    if (state.kind === "ready") {
      registerCodeProvider(cwd, createTreeSitterCodeProvider(state.service));
    }
  } catch {
    // supi-tree-sitter not installed — no TS provider available
  }
}

/** Clear the code provider for a session cwd. */
export function unwireProviders(cwd: string): void {
  clearCodeProvider(cwd);
}
