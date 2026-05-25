// Tree-sitter CodeProvider adapter — wraps TreeSitterService into the unified
// CodeProvider contract.

import type { CodeProvider } from "@mrclrchtr/supi-code-intelligence/api";
import type { TreeSitterService } from "../types.ts";
import { createTreeSitterProvider } from "./tree-sitter-provider.ts";

/**
 * Create a CodeProvider backed by a TreeSitterService.
 *
 * Structural methods delegate to the existing structural provider adapter.
 * Semantic methods return null since tree-sitter does not provide LSP operations.
 */
export function createTreeSitterCodeProvider(service: TreeSitterService): CodeProvider {
  const structural = createTreeSitterProvider(service);

  return {
    // Semantic methods — unavailable through tree-sitter
    references: async () => null,
    implementation: async () => null,
    documentSymbols: async () => null,
    workspaceSymbols: async () => null,

    // Structural methods
    calleesAt: structural.calleesAt,
    exports: structural.exports,
    outline: structural.outline,
    imports: structural.imports,
    nodeAt: structural.nodeAt,
  };
}
