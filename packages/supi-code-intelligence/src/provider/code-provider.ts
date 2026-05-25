// Unified CodeProvider interface combining semantic (LSP-backed) and
// structural (tree-sitter-backed) code analysis capabilities.

import type { SemanticProvider, StructuralProvider } from "./types.ts";

/**
 * Unified code analysis provider combining semantic (LSP-backed) and
 * structural (tree-sitter-backed) operations.
 *
 * CodeProvider extends both SemanticProvider and StructuralProvider, so
 * it is assignable to either — callers that only need one side can
 * pass a CodeProvider where SemanticProvider or StructuralProvider is
 * expected.
 *
 * Providers that cannot serve a particular method return `null` for
 * semantic methods or an `"unsupported-language"`/`"unavailable"` result
 * for structural methods. Callers should handle both availability states.
 */
export interface CodeProvider extends SemanticProvider, StructuralProvider {}
