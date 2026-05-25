/**
 * Workspace-scoped capability registry.
 *
 * Substrates (LSP, tree-sitter) register their capabilities per cwd
 * at session startup. Code-intelligence reads capability state from
 * this registry instead of maintaining a local provider composition
 * layer.
 *
 * Capabilities are independent: registering a semantic provider does not
 * affect an already-registered structural provider for the same cwd.
 */

import type { CapabilityState, SemanticProvider, StructuralProvider } from "../capability/types.ts";

// ── Public types ───────────────────────────────────────────────────────

/**
 * The combined capability state for a workspace.
 * Each capability slot includes both the availability state and the
 * provider instance (null when not ready).
 */
export interface WorkspaceCapabilities {
  semantic: { state: CapabilityState; provider: SemanticProvider | null };
  structural: { state: CapabilityState; provider: StructuralProvider | null };
}

// ── Defaults ───────────────────────────────────────────────────────────

const DEFAULT_UNAVAILABLE_REASON = "No provider registered for this workspace";

function createDefaultCapabilities(): WorkspaceCapabilities {
  return {
    semantic: {
      state: { kind: "unavailable", reason: DEFAULT_UNAVAILABLE_REASON },
      provider: null,
    },
    structural: {
      state: { kind: "unavailable", reason: DEFAULT_UNAVAILABLE_REASON },
      provider: null,
    },
  };
}

// ── Runtime ────────────────────────────────────────────────────────────

/**
 * Workspace-scoped capability registry keyed by cwd/project root.
 *
 * Each workspace stores independent capability state for semantic
 * (LSP-backed) and structural (tree-sitter-backed) analysis. Substrates
 * register their capabilities at session start; consumers read them
 * as needed.
 *
 * The registry is intentionally unopinionated about which capabilities
 * are required — a workspace may have only semantic, only structural,
 * both, or neither.
 */
export class WorkspaceRuntime {
  readonly #workspaces = new Map<string, WorkspaceCapabilities>();

  /**
   * Get the capability state for a workspace cwd.
   * Returns a default "unavailable" state if the workspace
   * has never been registered.
   */
  getWorkspace(cwd: string): WorkspaceCapabilities {
    return this.#workspaces.get(cwd) ?? createDefaultCapabilities();
  }

  /**
   * Register a semantic provider for a workspace.
   * Replaces any existing semantic provider for the same cwd
   * without affecting the structural provider.
   */
  registerSemantic(cwd: string, provider: SemanticProvider): void {
    const existing = this.#workspaces.get(cwd);
    if (existing) {
      existing.semantic = { state: { kind: "ready" }, provider };
    } else {
      this.#workspaces.set(cwd, {
        semantic: { state: { kind: "ready" }, provider },
        structural: createDefaultCapabilities().structural,
      });
    }
  }

  /**
   * Register a structural provider for a workspace.
   * Replaces any existing structural provider for the same cwd
   * without affecting the semantic provider.
   */
  registerStructural(cwd: string, provider: StructuralProvider): void {
    const existing = this.#workspaces.get(cwd);
    if (existing) {
      existing.structural = { state: { kind: "ready" }, provider };
    } else {
      this.#workspaces.set(cwd, {
        semantic: createDefaultCapabilities().semantic,
        structural: { state: { kind: "ready" }, provider },
      });
    }
  }

  /**
   * Remove all capability state for a single workspace cwd.
   */
  clearWorkspace(cwd: string): void {
    this.#workspaces.delete(cwd);
  }

  /**
   * Clear only the semantic capability slot for a workspace.
   * Leaves the structural slot untouched.
   */
  clearSemantic(cwd: string): void {
    const ws = this.#workspaces.get(cwd);
    if (!ws) return;
    ws.semantic = createDefaultCapabilities().semantic;
    // If both slots are now unavailable, remove the entire entry
    if (ws.semantic.state.kind === "unavailable" && ws.structural.state.kind === "unavailable") {
      this.#workspaces.delete(cwd);
    }
  }

  /**
   * Clear only the structural capability slot for a workspace.
   * Leaves the semantic slot untouched.
   */
  clearStructural(cwd: string): void {
    const ws = this.#workspaces.get(cwd);
    if (!ws) return;
    ws.structural = createDefaultCapabilities().structural;
    // If both slots are now unavailable, remove the entire entry
    if (ws.semantic.state.kind === "unavailable" && ws.structural.state.kind === "unavailable") {
      this.#workspaces.delete(cwd);
    }
  }

  /**
   * Remove all capability state for every workspace.
   */
  clearAll(): void {
    this.#workspaces.clear();
  }
}

// ── Default singleton ───────────────────────────────────────────────────

const RUNTIME_SYMBOL = Symbol.for("@mrclrchtr/supi-code-runtime/default-runtime");

/**
 * Get the shared default workspace runtime instance.
 *
 * Backed by `globalThis` + `Symbol.for` so that all jiti module instances
 * (even duplicate loads through separate `node_modules` paths) share the
 * same WorkspaceRuntime. Without this, standalone installs where
 * `supi-lsp`, `supi-tree-sitter`, and `supi-code-intelligence` each bundle
 * their own copy of `@mrclrchtr/supi-code-runtime` would get separate
 * runtimes — LSP/tree-sitter would register capabilities into one while
 * code-intelligence reads from another.
 */
export function getDefaultWorkspaceRuntime(): WorkspaceRuntime {
  const g = globalThis as Record<symbol, unknown>;
  let runtime = g[RUNTIME_SYMBOL] as WorkspaceRuntime | undefined;
  if (!runtime) {
    runtime = new WorkspaceRuntime();
    g[RUNTIME_SYMBOL] = runtime;
  }
  return runtime;
}
