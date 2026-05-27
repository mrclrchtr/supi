/**
 * Explicit analysis request context.
 *
 * Wraps the shared capability broker (@mrclrchtr/supi-code-runtime) and
 * workspace-session-local caches into an explicit context object that
 * deep analysis modules consume instead of calling getCodeProvider(cwd)
 * on their own.
 *
 * This is NOT a second capability registry — it's a composite read
 * over the canonical broker plus session-scoped state.
 */

import {
  getDefaultWorkspaceRuntime,
  type SemanticProvider,
  type StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";

/**
 * Unified code analysis provider combining semantic (LSP-backed) and
 * structural (tree-sitter-backed) operations.
 */
export interface CodeProvider extends SemanticProvider, StructuralProvider {}

/** Availability state for the code provider in a workspace. */
export type CodeProviderState =
  | { kind: "ready"; provider: CodeProvider }
  | { kind: "unavailable"; reason: string };

/**
 * Explicit context object passed to analysis services.
 *
 * Contains the cwd, a CodeProvider (ready or unavailable), and
 * any session-local model state that services need.
 */
export interface AnalysisContext {
  cwd: string;
  providerState: CodeProviderState;
}

/**
 * Build an AnalysisContext for a workspace cwd.
 *
 * Reads the shared capability broker from @mrclrchtr/supi-code-runtime
 * and returns a composite provider if at least one capability is available.
 */
export function buildAnalysisContext(cwd: string): AnalysisContext {
  return {
    cwd,
    providerState: getCodeProviderState(cwd),
  };
}

/**
 * Get the code provider state for a workspace cwd from the shared runtime.
 */
export function getCodeProviderState(cwd: string): CodeProviderState {
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

/** Alias for getCodeProviderState — kept for backward compatibility. */
export const getCodeProvider = getCodeProviderState;

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
    async references(filePath: string, position: { line: number; character: number }) {
      return semantic?.references(filePath, position) ?? null;
    },
    async implementation(filePath: string, position: { line: number; character: number }) {
      return semantic?.implementation(filePath, position) ?? null;
    },
    async documentSymbols(filePath: string) {
      return semantic?.documentSymbols(filePath) ?? null;
    },
    async workspaceSymbols(query: string) {
      return semantic?.workspaceSymbols(query) ?? null;
    },
    async calleesAt(file: string, line: number, character: number) {
      return (
        structural?.calleesAt(file, line, character) ?? {
          kind: "unavailable" as const,
          message: "Structural analysis not available.",
        }
      );
    },
    async exports(file: string) {
      return (
        structural?.exports(file) ?? {
          kind: "unavailable" as const,
          message: "Structural analysis not available.",
        }
      );
    },
    async outline(file: string) {
      return (
        structural?.outline(file) ?? {
          kind: "unavailable" as const,
          message: "Structural analysis not available.",
        }
      );
    },
    async imports(file: string) {
      return (
        structural?.imports(file) ?? {
          kind: "unavailable" as const,
          message: "Structural analysis not available.",
        }
      );
    },
    async nodeAt(file: string, line: number, character: number) {
      return (
        structural?.nodeAt(file, line, character) ?? {
          kind: "unavailable" as const,
          message: "Structural analysis not available.",
        }
      );
    },
  };
}
