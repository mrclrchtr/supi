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
  type CodeRequestControl,
  getDefaultWorkspaceRuntime,
  type SemanticProvider,
  type StructuralProvider,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import { getWorkspaceLspRuntime, type WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";

/**
 * Unified code analysis provider combining semantic (LSP-backed) and
 * structural (tree-sitter-backed) operations.
 */
export interface CodeProvider extends SemanticProvider, StructuralProvider {}

/** Availability state for the code provider in a workspace. */
export type CodeProviderState =
  | { kind: "ready"; provider: CodeProvider; lspRuntime: WorkspaceLspRuntimeState }
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

  const hasSemantic =
    (ws.semantic.state.kind === "ready" || ws.semantic.state.kind === "pending") &&
    ws.semantic.provider !== null;
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
    lspRuntime: getWorkspaceLspRuntime(cwd),
  };
}

/** Alias for getCodeProviderState — kept for backward compatibility. */
export const getCodeProvider = getCodeProviderState;

/** Bind one exact request-control value to every semantic provider operation. */
export function withSemanticRequestControl<T extends SemanticProvider>(
  provider: T | null,
  control: CodeRequestControl | undefined,
): T | null {
  if (!provider || !control) return provider;
  return {
    ...provider,
    references: (file, position) => provider.references(file, position, control),
    implementation: (file, position) => provider.implementation(file, position, control),
    documentSymbols: (file) => provider.documentSymbols(file, control),
    workspaceSymbols: (query, _requestControl, scopes) =>
      provider.workspaceSymbols(query, control, scopes),
    hover: provider.hover
      ? (file, position) => provider.hover?.(file, position, control)
      : undefined,
    definition: provider.definition
      ? (file, position) => provider.definition?.(file, position, control)
      : undefined,
    refactor: provider.refactor ? (request) => provider.refactor?.(request, control) : undefined,
    rename: provider.rename
      ? (file, position, newName) => provider.rename?.(file, position, newName, control)
      : undefined,
    codeActions: provider.codeActions
      ? (file, position) => provider.codeActions?.(file, position, control)
      : undefined,
  } as T;
}

/** Bind one exact request-control value to every structural provider operation. */
export function withStructuralRequestControl<T extends StructuralProvider>(
  provider: T | null,
  control: CodeRequestControl | undefined,
): T | null {
  if (!provider || !control) return provider;
  return {
    ...provider,
    calleesAt: (file, line, character, depthOrOptions) => {
      const depth = typeof depthOrOptions === "string" ? depthOrOptions : depthOrOptions?.depth;
      return provider.calleesAt(file, line, character, { depth, control });
    },
    exports: (file) => provider.exports(file, control),
    outline: (file) => provider.outline(file, control),
    imports: (file) => provider.imports(file, control),
    nodeAt: (file, line, character) => provider.nodeAt(file, line, character, control),
    callSites: (file) => provider.callSites(file, control),
  } as T;
}

/**
 * Create a single CodeProvider that delegates semantic methods to the
 * semantic (LSP) provider and structural methods to the structural
 * (tree-sitter) provider.
 *
 * Uses `...args` spread so that new optional parameters added to
 * provider methods are forwarded automatically — no need to update
 * the composite wrapper.
 */
/** Build a composite facade that deliberately exposes structural evidence only. */
export function createStructuralCodeProvider(
  structural: StructuralProvider | null,
): CodeProvider | null {
  return structural ? createCompositeProvider(null, structural) : null;
}

function createCompositeProvider(
  semantic: SemanticProvider | null,
  structural: StructuralProvider | null,
): CodeProvider {
  return {
    // ── Semantic methods ──────────────────────────────────────────────
    async references(...args: Parameters<SemanticProvider["references"]>) {
      return (
        semantic?.references(...args) ?? unavailableCodeQuery("Semantic references unavailable")
      );
    },
    async implementation(...args: Parameters<SemanticProvider["implementation"]>) {
      return (
        semantic?.implementation(...args) ??
        unavailableCodeQuery("Semantic implementations unavailable")
      );
    },
    async documentSymbols(...args: Parameters<SemanticProvider["documentSymbols"]>) {
      return (
        semantic?.documentSymbols(...args) ??
        unavailableCodeQuery("Semantic document symbols unavailable")
      );
    },
    async workspaceSymbols(...args: Parameters<SemanticProvider["workspaceSymbols"]>) {
      return (
        semantic?.workspaceSymbols(...args) ??
        unavailableCodeQuery("Semantic workspace symbols unavailable")
      );
    },
    async hover(...args: Parameters<NonNullable<SemanticProvider["hover"]>>) {
      return semantic?.hover?.(...args) ?? unavailableCodeQuery("Semantic hover unavailable");
    },
    async definition(...args: Parameters<NonNullable<SemanticProvider["definition"]>>) {
      return (
        semantic?.definition?.(...args) ?? unavailableCodeQuery("Semantic definition unavailable")
      );
    },
    async refactor(...args: Parameters<NonNullable<SemanticProvider["refactor"]>>) {
      const result = await semantic?.refactor?.(...args);
      return (
        result ?? {
          kind: "unavailable" as const,
          reason: "Refactor not available",
        }
      );
    },
    async codeActions(...args: Parameters<NonNullable<SemanticProvider["codeActions"]>>) {
      return semantic?.codeActions?.(...args) ?? [];
    },

    async rename(...args: Parameters<NonNullable<SemanticProvider["rename"]>>) {
      const result = await semantic?.rename?.(...args);
      return (
        result ?? {
          kind: "unavailable" as const,
          reason: "Rename not available",
        }
      );
    },

    // ── Structural methods ────────────────────────────────────────────
    async calleesAt(...args: Parameters<StructuralProvider["calleesAt"]>) {
      return (
        structural?.calleesAt(...args) ?? {
          kind: "unavailable" as const,
          message: "Structural analysis not available.",
        }
      );
    },
    async exports(...args: Parameters<StructuralProvider["exports"]>) {
      return (
        structural?.exports(...args) ?? {
          kind: "unavailable" as const,
          message: "Structural analysis not available.",
        }
      );
    },
    async outline(...args: Parameters<StructuralProvider["outline"]>) {
      return (
        structural?.outline(...args) ?? {
          kind: "unavailable" as const,
          message: "Structural analysis not available.",
        }
      );
    },
    async imports(...args: Parameters<StructuralProvider["imports"]>) {
      return (
        structural?.imports(...args) ?? {
          kind: "unavailable" as const,
          message: "Structural analysis not available.",
        }
      );
    },
    async nodeAt(...args: Parameters<StructuralProvider["nodeAt"]>) {
      return (
        structural?.nodeAt(...args) ?? {
          kind: "unavailable" as const,
          message: "Structural analysis not available.",
        }
      );
    },
    async callSites(...args: Parameters<StructuralProvider["callSites"]>) {
      return (
        structural?.callSites(...args) ?? {
          kind: "unavailable" as const,
          message: "Structural analysis not available.",
        }
      );
    },
  };
}
