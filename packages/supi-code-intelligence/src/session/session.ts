/**
 * Workspace code-intelligence session.
 *
 *
 * Per-workspace module that owns session-scoped state (targets, plans,
 * Capability Warnings) and provides typed workflow methods for all
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

import * as path from "node:path";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { LspRuntimeController } from "@mrclrchtr/supi-lsp/api";
import {
  type CapabilityWarning,
  CapabilityWarningState,
  evaluateCapabilityWarnings,
  gatherCapabilityWarningInput,
} from "../analysis/capability/capability-warnings.ts";
import { type CapabilityAdapter, WorkspaceCapabilityAdapter } from "./capability-adapter.ts";
import type { FindWorkflowInput, FindWorkflowOutcome } from "./find-types.ts";
import { runFindWorkflow } from "./find-workflow.ts";
import type { GraphWorkflowInput, GraphWorkflowOutcome } from "./graph-types.ts";
import { runGraphWorkflow } from "./graph-workflow.ts";
import type { HealthWorkflowInput, HealthWorkflowOutcome } from "./health-types.ts";
import { runHealthWorkflow } from "./health-workflow.ts";
import { parseResolveRequest } from "./input/common.ts";
import type { InspectWorkflowInput, InspectWorkflowOutcome } from "./inspect-types.ts";
import { runInspectWorkflow } from "./inspect-workflow.ts";
import type { OrientationWorkflowInput, OrientationWorkflowOutcome } from "./orientation-types.ts";
import { runOrientationWorkflow } from "./orientation-workflow.ts";
import { getPlan, type RefactorPlan, removePlan, storePlan } from "./refactor-plans.ts";
import type {
  RefactorApplyWorkflowInput,
  RefactorApplyWorkflowOutcome,
  RefactorPlanWorkflowInput,
  RefactorPlanWorkflowOutcome,
} from "./refactor-types.ts";
import { runRefactorApplyWorkflow, runRefactorPlanWorkflow } from "./refactor-workflow.ts";
import type { ResolveTargetInput, TargetInput } from "./target-input.ts";
import {
  getWorkflowTarget,
  registerWorkflowTarget,
  type TargetLookupResult,
  type TargetRegistrationInput,
  type TargetRegistrationOutput,
  type TargetStoreEntry,
} from "./target-store.ts";
import {
  resolveTargetWorkflow,
  type TargetWorkflowOutcome,
  type TargetWorkflowPolicy,
} from "./target-workflow.ts";
import { reportProgress, throwIfAborted, type WorkflowControl } from "./workflow-control.ts";

// ── Re-export types consumed by callers ───────────────────────────────

export type { CapabilityWarningState } from "../analysis/capability/capability-warnings.ts";
export type { CapabilityAdapter } from "./capability-adapter.ts";
export type {
  FindMode,
  FindWorkflowData,
  FindWorkflowInput,
  FindWorkflowOutcome,
} from "./find-types.ts";
export type {
  GraphRelationKind,
  GraphSection,
  GraphWorkflowInput,
  GraphWorkflowOutcome,
  RequestedGraphRelation,
} from "./graph-types.ts";
export type {
  CodeActionSuggestion,
  HealthCodeActions,
  HealthData,
  HealthSection,
  HealthWorkflowInput,
  HealthWorkflowOutcome,
} from "./health-types.ts";
export type {
  InspectResultData,
  InspectWorkflowInput,
  InspectWorkflowOutcome,
} from "./inspect-types.ts";
export type {
  OrientationFocusInput,
  OrientationWorkflowInput,
  OrientationWorkflowOutcome,
} from "./orientation-types.ts";
export type { RefactorPlan } from "./refactor-plans.ts";
export type {
  PublicSourceRange,
  RefactorApplyWorkflowInput,
  RefactorApplyWorkflowOutcome,
  RefactorOperationInput,
  RefactorPlanWorkflowInput,
  RefactorPlanWorkflowOutcome,
} from "./refactor-types.ts";
export type {
  GraphTargetInput,
  OrientationTargetInput,
  RefactorTargetInput,
  ResolveTargetInput,
  SourcePointInput,
  SymbolTargetInput,
  TargetInput,
  TargetSymbolKind,
} from "./target-input.ts";
export type {
  TargetLookupResult,
  TargetRegistrationInput,
  TargetRegistrationOutput,
  TargetStoreEntry,
} from "./target-store.ts";
export type { TargetWorkflowOutcome, TargetWorkflowPolicy } from "./target-workflow.ts";
export type { WorkflowControl, WorkflowProgressEvent } from "./workflow-control.ts";

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

  /** Injected capability adapter — two adapters (production/test) justify the seam. */
  readonly #capability: CapabilityAdapter;

  /** Whether the hidden architecture overview has been injected. */
  #hasInjectedOverview = false;

  /** Whether Orientation already included git context for this session. */
  #hasShownOrientationGitContext = false;

  /** Time of the most recent explicit health refresh. */
  #lastHealthRefresh: number | undefined;

  /** Session-scoped workflow target storage (targetId → entry). */
  readonly #workflowTargets = new Map<string, TargetStoreEntry>();

  /** Session-scoped refactor plan storage (planId → plan). */
  readonly #refactorPlans = new Map<string, RefactorPlan>();

  /** Capability Warning state for deduplication and grace-period timing. */
  readonly #capabilityWarningState = new CapabilityWarningState();

  /** Absolute instruction files already loaded by PI's native context-file mechanism. */
  readonly #nativeInstructionPaths = new Set<string>();

  /** Absolute directories whose instruction files were already surfaced by code_orientation. */
  readonly #surfacedInstructionDirs = new Set<string>();

  /**
   * Optional LSP controller reference — attached by LSP lifecycle module
   * for Capability Warning evaluation and server management.
   */
  #lspController: LspRuntimeController | null = null;

  /** Workspace sentinel snapshot for change detection across explicit queries. */
  #sentinelSnapshot: Map<string, number> = new Map();

  constructor(cwd: string, capability?: CapabilityAdapter) {
    this.cwd = cwd;
    this.#capability = capability ?? new WorkspaceCapabilityAdapter();
  }

  /** Attach lifecycle-owned LSP state without exposing it to Tool adapters. */
  attachLspController(controller: LspRuntimeController | null): void {
    this.#lspController = controller;
  }

  /**
   * Seed the sentinel snapshot from lifecycle-owned state after session start.
   * Called by the extension entry point after LSP initialization.
   */
  seedSentinelSnapshot(snapshot: Map<string, number>): void {
    this.#sentinelSnapshot = snapshot;
  }

  /** Restore overview state from the active session branch. */
  restoreOverviewInjection(): void {
    this.#hasInjectedOverview = true;
  }

  /** Atomically claim first-turn overview injection for this workspace session. */
  claimOverviewInjection(): boolean {
    if (this.#hasInjectedOverview) return false;
    this.#hasInjectedOverview = true;
    return true;
  }

  /** Evaluate and deduplicate Capability Warnings behind the session seam. */
  pendingCapabilityWarnings(): readonly CapabilityWarning[] {
    const report = evaluateCapabilityWarnings(
      gatherCapabilityWarningInput(this.cwd, this.#lspController),
    );
    return this.#capabilityWarningState.getPendingWarnings(report);
  }

  // ── Target workflow (deep seam) ───────────────────────────────────

  /**
   * Resolve target input into an immutable resolved target.
   *
   * This is the deep module interface. Tool executors use it instead of
   * bypassing session policy through one-off target adapters. Returns typed
   * outcomes — no markdown and no mutated parameters.
   */
  async resolveTarget(
    input: TargetInput,
    policy: TargetWorkflowPolicy,
  ): Promise<TargetWorkflowOutcome> {
    return resolveTargetWorkflow(input, policy, this.targetWorkflowDeps());
  }

  /** Resolve one public target source and register its session-scoped handle. */
  async resolve(
    input: { readonly target: ResolveTargetInput; readonly maxResults?: number },
    control?: WorkflowControl,
  ): Promise<TargetWorkflowOutcome> {
    const parsed = parseResolveRequest(input);
    if (parsed.kind === "invalid-input") return parsed;
    const request = parsed.value;
    throwIfAborted(control);
    reportProgress(control, {
      intent: "resolve",
      phase: "target",
      message: "Resolving target evidence",
    });
    return resolveTargetWorkflow(
      request.target,
      {
        fileLevelAllowed: true,
        nameAnchorRequired: false,
        maxResults: request.maxResults,
      },
      this.targetWorkflowDeps(),
    );
  }

  /** Collect evidence-backed workspace health facts. */
  async health(
    input: HealthWorkflowInput,
    control?: WorkflowControl,
  ): Promise<HealthWorkflowOutcome> {
    return runHealthWorkflow(
      input,
      {
        cwd: this.cwd,
        capability: this.#capability,
        lspController: this.#lspController,
        lastRefresh: this.#lastHealthRefresh,
        trackRefresh: () => {
          this.#lastHealthRefresh = Date.now();
        },
        sentinelSnapshot: this.#sentinelSnapshot,
      },
      control,
    );
  }

  /** Search one explicit structural or semantic substrate. */
  async find(input: FindWorkflowInput, control?: WorkflowControl): Promise<FindWorkflowOutcome> {
    return runFindWorkflow(input, { cwd: this.cwd, capability: this.#capability }, control);
  }

  /** Orient around the workspace or one exact focus. */
  async orient(
    input: OrientationWorkflowInput,
    control?: WorkflowControl,
  ): Promise<OrientationWorkflowOutcome> {
    const showGitContext = !this.#hasShownOrientationGitContext;
    this.#hasShownOrientationGitContext = true;
    return runOrientationWorkflow(
      input,
      {
        ...this.targetWorkflowDeps(),
        nativeInstructionPaths: this.#nativeInstructionPaths,
        surfacedInstructionDirs: this.#surfacedInstructionDirs,
        markInstructionDirsSurfaced: (directories) => this.markInstructionDirsSurfaced(directories),
        showGitContext,
      },
      control,
    );
  }

  /** Plan one precise semantic refactor without mutating files. */
  async planRefactor(
    input: RefactorPlanWorkflowInput,
    control?: WorkflowControl,
  ): Promise<RefactorPlanWorkflowOutcome> {
    return runRefactorPlanWorkflow(input, this.refactorWorkflowDeps(), control);
  }

  /** Revalidate and apply one stored refactor plan. */
  async applyRefactor(
    input: RefactorApplyWorkflowInput,
    control?: WorkflowControl,
  ): Promise<RefactorApplyWorkflowOutcome> {
    return runRefactorApplyWorkflow(input, this.refactorWorkflowDeps(), control);
  }

  /** Inspect one exact source point with available semantic and structural evidence. */
  async inspect(
    input: InspectWorkflowInput,
    control?: WorkflowControl,
  ): Promise<InspectWorkflowOutcome> {
    return runInspectWorkflow(input, { cwd: this.cwd, capability: this.#capability }, control);
  }

  /** Collect evidence-backed relations for one exact target. */
  async graph(input: GraphWorkflowInput, control?: WorkflowControl): Promise<GraphWorkflowOutcome> {
    return runGraphWorkflow(input, this.targetWorkflowDeps(), control);
  }

  private refactorWorkflowDeps() {
    return {
      ...this.targetWorkflowDeps(),
      storePlan: (plan: RefactorPlan) => this.#storePlan(plan),
      getPlan: (id: string) => this.#getPlan(id),
      removePlan: (id: string) => this.#removePlan(id),
    };
  }

  private targetWorkflowDeps() {
    return {
      cwd: this.cwd,
      capability: this.#capability,
      lookupTargetId: (id: string) => this.#lookupTargetId(id),
      registerTarget: (input: TargetRegistrationInput) => this.#registerTarget(input),
    };
  }

  // ── Instruction-file state ───────────────────────────────────────

  /** Remember instruction/context file paths already loaded by PI natively. */
  captureNativeInstructionPaths(files: Array<{ path: string }>): void {
    for (const file of files) {
      this.#nativeInstructionPaths.add(path.resolve(this.cwd, file.path));
    }
  }

  /** Mark directory-local instruction files as surfaced after a successful orientation render. */
  markInstructionDirsSurfaced(directories: string[]): void {
    for (const directory of directories) {
      this.#surfacedInstructionDirs.add(path.resolve(this.cwd, directory));
    }
  }

  /** Clear instruction-file dedup state after compaction. */
  resetSurfacedInstructionDirs(): void {
    this.#surfacedInstructionDirs.clear();
  }

  /** Reconstruct surfaced instruction directories from branch tool-result details after compaction. */
  reconstructInstructionState(branch: SessionEntry[]): void {
    this.#surfacedInstructionDirs.clear();
    const entries = entriesAfterLatestCompaction(branch);
    for (const entry of entries) {
      for (const directory of extractInstructionDirectories(entry)) {
        this.#surfacedInstructionDirs.add(path.resolve(this.cwd, directory));
      }
    }
  }

  // ── Private session stores ───────────────────────────────────────

  #lookupTargetId(targetId: string): TargetLookupResult {
    return getWorkflowTarget(this.#workflowTargets, targetId);
  }

  #registerTarget(input: TargetRegistrationInput): TargetRegistrationOutput {
    return registerWorkflowTarget(this.#workflowTargets, this.cwd, input);
  }

  #storePlan(plan: RefactorPlan): string {
    return storePlan(this.#refactorPlans, plan);
  }

  #getPlan(id: string): RefactorPlan | undefined {
    return getPlan(this.#refactorPlans, id);
  }

  #removePlan(id: string): void {
    removePlan(this.#refactorPlans, id);
  }

  // ── Cleanup ───────────────────────────────────────────────────────

  /** Clear all session-scoped stores. */
  clearStores(): void {
    this.#refactorPlans.clear();
    this.#workflowTargets.clear();
    this.#surfacedInstructionDirs.clear();
    this.#nativeInstructionPaths.clear();
    this.#sentinelSnapshot.clear();
    this.#capabilityWarningState.reset();
    this.#lspController = null;
  }
}

function entriesAfterLatestCompaction(branch: SessionEntry[]): SessionEntry[] {
  let start = 0;
  for (let i = 0; i < branch.length; i++) {
    if (branch[i]?.type === "compaction") start = i + 1;
  }
  return branch.slice(start);
}

function extractInstructionDirectories(entry: SessionEntry): string[] {
  if (entry.type !== "message" || entry.message.role !== "toolResult") return [];
  if (entry.message.toolName !== "code_orientation") return [];

  const details = entry.message.details as
    | { type?: string; data?: { instructions?: { files?: Array<{ directory?: unknown }> } } }
    | undefined;
  if (details?.type !== "context") return [];

  const files = details.data?.instructions?.files;
  if (!Array.isArray(files)) return [];

  return files
    .map((file) => file.directory)
    .filter((directory): directory is string => typeof directory === "string");
}
