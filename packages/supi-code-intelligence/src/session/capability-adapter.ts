/**
 * Capability adapter — injected dependency for WorkspaceCodeIntelligenceSession.
 *
 * Encapsulates provider access and readiness so the session target
 * workflow can be tested with an in-memory adapter. Two adapters
 * (production and test) justify the seam.
 *
 * @mrclrchtr/supi-code-intelligence — internal, not exported via api.ts
 */

import type {
  CapabilityState,
  SemanticProvider,
  StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { getWorkspaceLspRuntime, type WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
import {
  type CodeProvider,
  type CodeProviderState,
  getCodeProviderState,
} from "../analysis/provider.ts";
import { ensureSemanticReadiness } from "../analysis/readiness.ts";

// ── Interface ─────────────────────────────────────────────────────────

/**
 * Readiness scope for semantic provider gating.
 * `workspace` waits for all servers; `file` waits for a specific file's server.
 */
export type ReadinessScope = { kind: "workspace" } | { kind: "file"; file: string };

/** Outcome of a readiness wait. */
export type ReadinessOutcome =
  | { kind: "ready" }
  | { kind: "timeout" }
  | { kind: "unavailable"; reason: string };

/**
 * Injected capability adapter.
 *
 * Production adapter reads the global workspace runtime. Test adapter
 * provides semantic/structural providers in memory without global state.
 */
export interface CapabilityAdapter {
  /** Get the composite code provider state for a workspace. */
  getProviderState(cwd: string): CodeProviderState;

  /** Convenience: get the ready composite provider, or null. */
  getProvider(cwd: string): CodeProvider | null;

  /** Get the raw semantic provider, or null. */
  getSemanticProvider(cwd: string): SemanticProvider | null;

  /** Get the raw structural provider, or null. */
  getStructuralProvider(cwd: string): StructuralProvider | null;

  /** Get the workspace LSP operational state for diagnostics and recovery workflows. */
  getLspRuntimeState(cwd: string): WorkspaceLspRuntimeState;

  /** Get semantic and structural capability states without exposing providers. */
  getCapabilityStates(cwd: string): {
    semantic: CapabilityState;
    structural: CapabilityState;
  };

  /**
   * Wait for semantic (LSP) readiness. Returns a typed outcome so
   * the target workflow can decide whether to proceed, return a
   * timeout note, or return an unavailable result.
   */
  ensureSemanticReadiness(cwd: string, scope: ReadinessScope): Promise<ReadinessOutcome>;
}

// ── Production adapter ────────────────────────────────────────────────

/**
 * Production capability adapter that reads from the global workspace
 * runtime. Used in the real pi session.
 */
export class WorkspaceCapabilityAdapter implements CapabilityAdapter {
  getProviderState(cwd: string): CodeProviderState {
    return getCodeProviderState(cwd);
  }

  getProvider(cwd: string): CodeProvider | null {
    const state = this.getProviderState(cwd);
    return state.kind === "ready" ? state.provider : null;
  }

  getSemanticProvider(cwd: string): SemanticProvider | null {
    const runtime = getDefaultWorkspaceRuntime();
    const ws = runtime.getWorkspace(cwd);
    if (
      (ws.semantic.state.kind === "ready" || ws.semantic.state.kind === "pending") &&
      ws.semantic.provider !== null
    ) {
      return ws.semantic.provider as SemanticProvider;
    }
    return null;
  }

  getStructuralProvider(cwd: string): StructuralProvider | null {
    const runtime = getDefaultWorkspaceRuntime();
    const ws = runtime.getWorkspace(cwd);
    if (ws.structural.state.kind === "ready" && ws.structural.provider !== null) {
      return ws.structural.provider as StructuralProvider;
    }
    return null;
  }

  async ensureSemanticReadiness(cwd: string, scope: ReadinessScope): Promise<ReadinessOutcome> {
    const result = await ensureSemanticReadiness(cwd, scope);
    return result;
  }

  getCapabilityStates(cwd: string): {
    semantic: CapabilityState;
    structural: CapabilityState;
  } {
    const workspace = getDefaultWorkspaceRuntime().getWorkspace(cwd);
    return { semantic: workspace.semantic.state, structural: workspace.structural.state };
  }

  getLspRuntimeState(cwd: string): WorkspaceLspRuntimeState {
    return getWorkspaceLspRuntime(cwd);
  }
}

// ── Test adapter ──────────────────────────────────────────────────────

/**
 * In-memory capability adapter for tests.
 *
 * Pass explicit providers and readiness outcomes without touching
 * the global workspace runtime.
 */
export class TestCapabilityAdapter implements CapabilityAdapter {
  readonly #semantic: SemanticProvider | null;
  readonly #structural: StructuralProvider | null;
  readonly #readiness: ReadinessOutcome;
  readonly #lspRuntime: WorkspaceLspRuntimeState;

  constructor(options: {
    semantic?: SemanticProvider | null;
    structural?: StructuralProvider | null;
    readiness?: ReadinessOutcome;
    lspRuntime?: WorkspaceLspRuntimeState;
  }) {
    this.#semantic = options.semantic ?? null;
    this.#structural = options.structural ?? null;
    this.#readiness = options.readiness ?? { kind: "ready" };
    this.#lspRuntime = options.lspRuntime ?? {
      kind: "unavailable" as const,
      reason: "no test LSP",
    };
  }

  getProviderState(_cwd: string): CodeProviderState {
    if (!this.#semantic && !this.#structural) {
      return { kind: "unavailable", reason: "No providers in test adapter" };
    }
    return {
      kind: "ready",
      provider: this.getProvider(_cwd) as CodeProvider,
      lspRuntime: this.#lspRuntime,
    };
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: adapter maps many provider methods; splitting would degrade readability
  getProvider(_cwd: string): CodeProvider | null {
    if (!this.#semantic && !this.#structural) return null;
    return {
      // Semantic pass-through
      references: this.#semantic?.references
        ? (...args: Parameters<SemanticProvider["references"]>) =>
            this.#semantic?.references?.(...args)
        : async () => null,
      implementation: this.#semantic?.implementation
        ? (...args) => this.#semantic?.implementation?.(...args)
        : async () => null,
      documentSymbols: this.#semantic?.documentSymbols
        ? (...args) => this.#semantic?.documentSymbols?.(...args)
        : async () => [],
      workspaceSymbols: this.#semantic?.workspaceSymbols
        ? (...args) => this.#semantic?.workspaceSymbols?.(...args)
        : async () => [],
      hover: this.#semantic?.hover ? (...args) => this.#semantic?.hover?.(...args) : undefined,
      definition: this.#semantic?.definition
        ? (...args) => this.#semantic?.definition?.(...args)
        : undefined,
      codeActions: this.#semantic?.codeActions
        ? (...args) => this.#semantic?.codeActions?.(...args)
        : undefined,
      rename: this.#semantic?.rename ? (...args) => this.#semantic?.rename?.(...args) : undefined,
      refactor: this.#semantic?.refactor
        ? (...args) => this.#semantic?.refactor?.(...args)
        : undefined,
      // Structural pass-through
      calleesAt: this.#structural?.calleesAt
        ? (...args) => this.#structural?.calleesAt?.(...args)
        : async () => ({ kind: "unavailable" as const, message: "no test structural" }),
      exports: this.#structural?.exports
        ? (...args) => this.#structural?.exports?.(...args)
        : async () => ({ kind: "unavailable" as const, message: "no test structural" }),
      outline: this.#structural?.outline
        ? (...args) => this.#structural?.outline?.(...args)
        : async () => ({ kind: "unavailable" as const, message: "no test structural" }),
      imports: this.#structural?.imports
        ? (...args) => this.#structural?.imports?.(...args)
        : async () => ({ kind: "unavailable" as const, message: "no test structural" }),
      nodeAt: this.#structural?.nodeAt
        ? (...args) => this.#structural?.nodeAt?.(...args)
        : async () => ({ kind: "unavailable" as const, message: "no test structural" }),
      callSites: this.#structural?.callSites
        ? (...args) => this.#structural?.callSites?.(...args)
        : async () => ({ kind: "unavailable" as const, message: "no test structural" }),
    } as CodeProvider;
  }

  getSemanticProvider(_cwd: string): SemanticProvider | null {
    return this.#semantic;
  }

  getStructuralProvider(_cwd: string): StructuralProvider | null {
    return this.#structural;
  }

  getLspRuntimeState(_cwd: string): WorkspaceLspRuntimeState {
    return this.#lspRuntime;
  }

  getCapabilityStates(_cwd: string): {
    semantic: CapabilityState;
    structural: CapabilityState;
  } {
    const unavailable: CapabilityState = { kind: "unavailable", reason: "not configured" };
    return {
      semantic: this.#semantic ? { kind: "ready" } : unavailable,
      structural: this.#structural ? { kind: "ready" } : unavailable,
    };
  }

  async ensureSemanticReadiness(_cwd: string, _scope: ReadinessScope): Promise<ReadinessOutcome> {
    return this.#readiness;
  }
}
