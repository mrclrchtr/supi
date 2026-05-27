/**
 * Workspace session state for supi-code-intelligence.
 *
 * Each cwd gets exactly one session instance. The session owns:
 * - overview-injection state (hasInjectedOverview)
 * - model-cache state (modelCache)
 * - references to semantic/structural adapter state (adapterState)
 *
 * The session does NOT own the shared capability broker in
 * @mrclrchtr/supi-code-runtime — that remains the canonical broker.
 * This session coordinates local state *around* it.
 */

import type { LspAdapterState } from "../lsp/runtime-state.ts";
import type { TsAdapterState } from "../tree-sitter/session-lifecycle.ts";

/**
 * Adapter state slots that workspace-session coordinates.
 *
 * The actual lifecycle (init, teardown, capability publishing) is
 * owned by `lsp/runtime-state.ts` and `tree-sitter/session-lifecycle.ts`.
 * The workspace session holds references to those adapter instances.
 */
export interface AdapterStateSlots {
  semantic: LspAdapterState | undefined;
  structural: TsAdapterState | undefined;
}

/**
 * Per-cwd session-scoped app state.
 *
 * Coordinates local session state around the shared `supi-code-runtime` broker.
 * Does NOT replace or duplicate the broker.
 */
export interface WorkspaceSession {
  /** Canonical workspace directory for this session. */
  readonly cwd: string;

  /** Whether the hidden architecture overview has been injected. */
  hasInjectedOverview: boolean;

  /** Session/workspace cache and invalidation state for architecture models. */
  modelCache: Record<string, unknown>;

  /**
   * References to semantic/structural adapter state.
   *
   * The actual adapter instances and lifecycle are managed by
   * substrate modules. The session holds lightweight references
   * to coordinate cleanup and access.
   */
  adapterState: AdapterStateSlots;
}

/**
 * Create a new workspace session for the given cwd.
 */
export function createWorkspaceSession(cwd: string): WorkspaceSession {
  return {
    cwd,
    hasInjectedOverview: false,
    modelCache: {},
    adapterState: {
      semantic: undefined,
      structural: undefined,
    },
  };
}
