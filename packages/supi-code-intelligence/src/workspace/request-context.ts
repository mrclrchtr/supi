/**
 * Central access point for code-intelligence to read shared workspace
 * runtime capability state from @mrclrchtr/supi-code-runtime.
 *
 * Replaces the old local provider registry/wiring layer. The substrate
 * packages (supi-lsp, supi-tree-sitter) publish their capabilities into
 * the shared runtime via getDefaultWorkspaceRuntime(). This module reads
 * that same singleton to provide per-cwd capability state to the
 * code_* tool use-cases.
 */

import {
  type CalleesData,
  type CodeLocation,
  type CodePosition,
  type CodeResult,
  type CodeSymbol,
  type ExportData,
  getDefaultWorkspaceRuntime,
  type ImportData,
  type NodeAtData,
  type OutlineData,
  type SemanticProvider,
  type StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";

/**
 * Unified code analysis provider combining semantic (LSP-backed) and
 * structural (tree-sitter-backed) operations.
 *
 * This is the same shape as the old CodeProvider interface, now backed
 * by the shared workspace runtime instead of a local registry.
 */
export interface CodeProvider extends SemanticProvider, StructuralProvider {}

/** Availability state for the code provider in a workspace. */
export type CodeProviderState =
  | { kind: "ready"; provider: CodeProvider }
  | { kind: "unavailable"; reason: string };

/**
 * Get the code provider state for a workspace cwd from the shared runtime.
 *
 * Returns `ready` if at least one capability (semantic or structural) is
 * available. The provider object delegates to whichever capability is
 * present — null / unsupported-language for the missing ones.
 *
 * Returns `unavailable` if no capabilities are registered.
 */
export function getCodeProvider(cwd: string): CodeProviderState {
  const runtime = getDefaultWorkspaceRuntime();
  const ws = runtime.getWorkspace(cwd);

  const hasSemantic = ws.semantic.state.kind === "ready" && ws.semantic.provider !== null;
  const hasStructural = ws.structural.state.kind === "ready" && ws.structural.provider !== null;

  if (!hasSemantic && !hasStructural) {
    return {
      kind: "unavailable",
      reason: "No code provider initialized for this workspace",
    };
  }

  return {
    kind: "ready",
    provider: createCompositeProvider(
      (hasSemantic ? ws.semantic.provider : null) as SemanticProvider | null,
      (hasStructural ? ws.structural.provider : null) as StructuralProvider | null,
    ),
  };
}

/**
 * Create a single CodeProvider that delegates semantic methods to the
 * semantic (LSP) provider and structural methods to the structural
 * (tree-sitter) provider.
 */
function createCompositeProvider(
  semantic: SemanticProvider | null,
  structural: StructuralProvider | null,
): CodeProvider {
  return {
    // Semantic methods
    async references(filePath: string, position: CodePosition): Promise<CodeLocation[] | null> {
      return semantic?.references(filePath, position) ?? null;
    },
    async implementation(filePath: string, position: CodePosition): Promise<CodeLocation[] | null> {
      return semantic?.implementation(filePath, position) ?? null;
    },
    async documentSymbols(filePath: string): Promise<CodeSymbol[] | null> {
      return semantic?.documentSymbols(filePath) ?? null;
    },
    async workspaceSymbols(query: string): Promise<CodeSymbol[] | null> {
      return semantic?.workspaceSymbols(query) ?? null;
    },

    // Structural methods
    async calleesAt(
      file: string,
      line: number,
      character: number,
    ): Promise<CodeResult<CalleesData>> {
      return (
        structural?.calleesAt(file, line, character) ?? {
          kind: "unavailable",
          message: "Structural analysis not available. Use tree_sitter_callees.",
        }
      );
    },
    async exports(file: string): Promise<CodeResult<ExportData[]>> {
      return (
        structural?.exports(file) ?? {
          kind: "unavailable",
          message: "Structural analysis not available. Use tree_sitter_exports.",
        }
      );
    },
    async outline(file: string): Promise<CodeResult<OutlineData[]>> {
      return (
        structural?.outline(file) ?? {
          kind: "unavailable",
          message: "Structural analysis not available. Use tree_sitter_outline.",
        }
      );
    },
    async imports(file: string): Promise<CodeResult<ImportData[]>> {
      return (
        structural?.imports(file) ?? {
          kind: "unavailable",
          message: "Structural analysis not available. Use tree_sitter_imports.",
        }
      );
    },
    async nodeAt(file: string, line: number, character: number): Promise<CodeResult<NodeAtData>> {
      return (
        structural?.nodeAt(file, line, character) ?? {
          kind: "unavailable",
          message: "Structural analysis not available. Use tree_sitter_node_at.",
        }
      );
    },
  };
}
