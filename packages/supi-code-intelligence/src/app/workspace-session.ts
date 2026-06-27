/**
 * Workspace session state for supi-code-intelligence.
 *
 * Each cwd gets exactly one session instance. The session owns:
 * - overview-injection state (hasInjectedOverview)
 * - refactor plan storage (refactorPlans)
 * - workflow target storage (workflowTargets)
 * - coverage warning state (coverageWarningState)
 *
 * The session does NOT own the shared capability broker in
 * @mrclrchtr/supi-code-runtime — that remains the canonical broker.
 * This session coordinates local state *around* it.
 */

import type { RefactorPlan } from "../analysis/refactor/plan-store.ts";
import { CoverageWarningState } from "../lsp/coverage-warnings.ts";
import type { TargetStoreEntry } from "../workflow/target-store.ts";

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

  /** Session-scoped refactor plan storage (planId → plan). */
  readonly refactorPlans: Map<string, RefactorPlan>;

  /** Session-scoped workflow target storage (targetId → entry). */
  readonly workflowTargets: Map<string, TargetStoreEntry>;

  /**
   * Coverage warning state for deduplication and grace-period timing.
   * Evaluated after session startup to avoid transient pending noise.
   */
  coverageWarningState: CoverageWarningState;
}

/**
 * Create a new workspace session for the given cwd.
 */
export function createWorkspaceSession(cwd: string): WorkspaceSession {
  return {
    cwd,
    hasInjectedOverview: false,
    refactorPlans: new Map(),
    workflowTargets: new Map(),
    coverageWarningState: new CoverageWarningState(),
  };
}
