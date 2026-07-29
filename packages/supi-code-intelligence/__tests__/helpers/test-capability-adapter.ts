/**
 * In-memory capability adapter for tests.
 *
 * Pass explicit providers and readiness outcomes without touching
 * the global workspace runtime.
 */

import {
  type CapabilityState,
  completedCodeQuery,
  type SemanticProvider,
  type StructuralProvider,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import type { WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
import type { CodeProvider, CodeProviderState } from "../../src/analysis/provider.ts";
import type {
  CapabilityAdapter,
  ReadinessOutcome,
  ReadinessScope,
} from "../../src/session/capability-adapter.ts";

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
            this.#semantic?.references(...args)
        : async () => unavailableCodeQuery("No test semantic references provider"),
      implementation: this.#semantic?.implementation
        ? (...args) => this.#semantic?.implementation(...args)
        : async () => unavailableCodeQuery("No test semantic implementation provider"),
      documentSymbols: this.#semantic?.documentSymbols
        ? (...args) => this.#semantic?.documentSymbols(...args)
        : async () => completedCodeQuery([]),
      workspaceSymbols: this.#semantic?.workspaceSymbols
        ? (...args) => this.#semantic?.workspaceSymbols(...args)
        : async () => completedCodeQuery([]),
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
