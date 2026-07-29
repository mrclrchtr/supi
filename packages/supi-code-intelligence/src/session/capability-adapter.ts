/**
 * Capability adapter — injected dependency for WorkspaceCodeIntelligenceSession.
 *
 * Encapsulates provider access and readiness so the session target
 * workflow can be tested with an in-memory adapter.
 *
 * @mrclrchtr/supi-code-intelligence — internal, not exported via api.ts
 */

import {
  type CapabilityState,
  getDefaultWorkspaceRuntime,
  type SemanticProvider,
  type StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";
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
 * Production adapter reads the global workspace runtime.
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
