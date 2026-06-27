/**
 * Workspace code-intelligence session facade.
 *
 * Per-workspace facade that owns session-scoped state (targets, plans,
 * coverage warnings) and provides typed workflow methods for all
 * public code_* tools. Tool executors receive this session explicitly
 * through their execution context; the session centralizes provider
 * access, target resolution, plan management, and readiness policy.
 *
 * The session does NOT own the shared capability broker in
 * @mrclrchtr/supi-code-runtime — it reads from it. It does NOT
 * render markdown or manage TUI state — executors and rendering
 * modules keep that.
 *
 * @mrclrchtr/supi-code-intelligence — internal, not exported via api.ts
 */

import {
  getDefaultWorkspaceRuntime,
  type SemanticProvider,
  type StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import type {
  LspRuntimeController,
  SessionLspService,
  SessionLspServiceState,
} from "@mrclrchtr/supi-lsp/api";
import type { CodeProvider } from "../analysis/context/request-context.ts";
import { getCodeProvider } from "../analysis/context/request-context.ts";
import {
  getPlan,
  type RefactorPlan,
  removePlan,
  storePlan,
} from "../analysis/refactor/plan-store.ts";
import { CoverageWarningState } from "../lsp/coverage-warnings.ts";
import {
  getWorkflowTarget,
  registerWorkflowTarget,
  type TargetLookupResult,
  type TargetRegistrationInput,
  type TargetRegistrationOutput,
  type TargetStoreEntry,
} from "./target-store.ts";

// ── Re-export types consumed by callers ───────────────────────────────

export type { CodeProvider, CodeProviderState } from "../analysis/context/request-context.ts";
export type { RefactorPlan } from "../analysis/refactor/plan-store.ts";
export type { CoverageWarningState } from "../lsp/coverage-warnings.ts";
export type {
  TargetLookupResult,
  TargetRegistrationInput,
  TargetRegistrationOutput,
  TargetStoreEntry,
} from "./target-store.ts";

// ── Target ID expansion result ────────────────────────────────────────

export type TargetIdExpansionResult =
  | {
      kind: "ok";
      file: string;
      line: number;
      character: number;
      targetName: string | null;
      targetKind: string | null;
      entry: TargetStoreEntry;
    }
  | { kind: "not-provided" }
  | { kind: "error"; message: string };

// ── Session class ─────────────────────────────────────────────────────

/**
 * Per-cwd workspace code-intelligence session.
 *
 * Owns session-scoped state and provides centralized methods for
 * provider access, target resolution, plan management, and readiness
 * policy. Lifecycle modules attach controller references.
 */
export class WorkspaceCodeIntelligenceSession {
  /** Canonical workspace directory for this session. */
  readonly cwd: string;

  /** Whether the hidden architecture overview has been injected. */
  hasInjectedOverview = false;

  /** Session-scoped workflow target storage (targetId → entry). */
  readonly workflowTargets = new Map<string, TargetStoreEntry>();

  /** Session-scoped refactor plan storage (planId → plan). */
  readonly refactorPlans = new Map<string, RefactorPlan>();

  /**
   * Coverage warning state for deduplication and grace-period timing.
   */
  readonly coverageWarningState = new CoverageWarningState();

  /**
   * Optional LSP controller reference — attached by LSP lifecycle module
   * for coverage evaluation and server management.
   */
  lspController: LspRuntimeController | null = null;

  /**
   * Optional Tree-sitter controller reference — attached by TS lifecycle
   * module for structural provider lifecycle management.
   */
  tsController: import("@mrclrchtr/supi-tree-sitter/api").TreeSitterRuntimeController | null = null;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  // ── Provider access ───────────────────────────────────────────────

  /**
   * Get the composite code provider state for this workspace.
   * Combines semantic (LSP) and structural (tree-sitter) capabilities.
   */
  getProviders(): import("../analysis/context/request-context.ts").CodeProviderState {
    return getCodeProvider(this.cwd);
  }

  /**
   * Get the ready composite code provider, or null if unavailable.
   */
  getProvider(): CodeProvider | null {
    const state = this.getProviders();
    return state.kind === "ready" ? state.provider : null;
  }

  /**
   * Get the LSP service state for this workspace.
   */
  getLspService(): SessionLspServiceState {
    const state = this.getProviders();
    return state.kind === "ready"
      ? state.lspService
      : { kind: "unavailable" as const, reason: "No provider" };
  }

  /**
   * Get the LSP service instance when ready, or null.
   */
  getLspServiceInstance(): SessionLspService | null {
    const state = this.getLspService();
    return state.kind === "ready" ? state.service : null;
  }

  /**
   * Get the semantic provider from the shared runtime.
   */
  getSemanticProvider(): SemanticProvider | null {
    const ws = getDefaultWorkspaceRuntime().getWorkspace(this.cwd);
    if (
      (ws.semantic.state.kind === "ready" || ws.semantic.state.kind === "pending") &&
      ws.semantic.provider !== null
    ) {
      return ws.semantic.provider as SemanticProvider;
    }
    return null;
  }

  /**
   * Get the structural provider from the shared runtime.
   */
  getStructuralProvider(): StructuralProvider | null {
    const ws = getDefaultWorkspaceRuntime().getWorkspace(this.cwd);
    if (ws.structural.state.kind === "ready" && ws.structural.provider !== null) {
      return ws.structural.provider as StructuralProvider;
    }
    return null;
  }

  /**
   * Get the raw workspace state from the shared runtime.
   *
   * Exposes semantic/structural state and provider refs for tools
   * that need detailed status (e.g. code_health). Prefer higher-level
   * methods (`getProvider()`, `getSemanticProvider()`) when you only
   * need a ready provider reference.
   */
  getWorkspaceState() {
    return getDefaultWorkspaceRuntime().getWorkspace(this.cwd);
  }

  // ── Target resolution ─────────────────────────────────────────────

  /**
   * Look up a stored target by targetId in this session's store.
   */
  lookupTargetId(targetId: string): TargetLookupResult {
    return getWorkflowTarget(this.workflowTargets, targetId);
  }

  /**
   * Register a resolved target in this session's store and return
   * stable session-scoped handles.
   */
  registerTarget(input: TargetRegistrationInput): TargetRegistrationOutput {
    return registerWorkflowTarget(this.workflowTargets, this.cwd, input);
  }

  /**
   * Expand an optional targetId from tool params into anchored
   * file/line/character.
   *
   * Usage at the top of each target-oriented executor:
   *
   * ```ts
   * const expansion = session.expandTargetId(params);
   * if (expansion.kind === "error") return errorResult(expansion.message);
   * if (expansion.kind === "ok") {
   *   params.file = expansion.file;
   *   params.line = expansion.line;
   *   params.character = expansion.character;
   * }
   * ```
   */
  expandTargetId(params: {
    targetId?: string;
    file?: string;
    line?: number;
    character?: number;
    symbol?: string;
  }): TargetIdExpansionResult {
    return expandSessionTargetId(this, params);
  }

  /**
   * Look up a targetId without expanding into file/line/character.
   * Returns the raw store entry or an error.
   */
  lookupTargetEntry(targetId: string): TargetLookupResult {
    return getWorkflowTarget(this.workflowTargets, targetId);
  }

  // ── Plan store ────────────────────────────────────────────────────

  /**
   * Store a refactor plan and return its planId.
   */
  storePlan(plan: RefactorPlan): string {
    return storePlan(this.refactorPlans, plan);
  }

  /**
   * Retrieve a plan by id, or undefined.
   */
  getPlan(id: string): RefactorPlan | undefined {
    return getPlan(this.refactorPlans, id);
  }

  /**
   * Remove a plan after successful apply.
   */
  removePlan(id: string): void {
    removePlan(this.refactorPlans, id);
  }

  // ── Cleanup ───────────────────────────────────────────────────────

  /** Clear all session-scoped stores. */
  clearStores(): void {
    this.refactorPlans.clear();
    this.workflowTargets.clear();
  }
}

// ── Standalone target-id expansion helper ─────────────────────────────

/**
 * Expand an optional targetId into anchored file/line/character params
 * using the given session's store.
 *
 * Exported separately so executors that already hold a session ref
 * can call it directly without accessing `getOrCreateSessionForCwd`.
 */
export function expandSessionTargetId(
  session: WorkspaceCodeIntelligenceSession,
  params: {
    targetId?: string;
    file?: string;
    line?: number;
    character?: number;
    symbol?: string;
  },
): TargetIdExpansionResult {
  const targetId = params.targetId;
  if (targetId === undefined || targetId === null) {
    return { kind: "not-provided" };
  }

  const result = session.lookupTargetEntry(targetId);
  if (result.kind === "unavailable") {
    return {
      kind: "error",
      message: `**Error:** ${result.reason}`,
    };
  }

  const { entry } = result;
  return {
    kind: "ok",
    file: entry.file,
    line: entry.displayLine,
    character: entry.displayCharacter,
    targetName: entry.name,
    targetKind: entry.kind,
    entry,
  };
}
