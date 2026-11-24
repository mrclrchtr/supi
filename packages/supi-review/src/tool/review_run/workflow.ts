// biome-ignore lint/style/noExcessiveLinesPerFile: Review Target and Workspace lifecycle remain in one workflow module.
import type {
  AgentRunAuxiliaryModelSnapshot,
  AgentRunProviderAuthority,
  AgentRunRegistry,
} from "@mrclrchtr/supi-agent-runtime/api";
import {
  captureAgentRunAuxiliaryModels,
  combineAgentRunUsage,
  createEarlyCancellationDiagnostics,
  createUnobservedAgentRunDiagnostics,
  raceAgentRunStartup,
} from "@mrclrchtr/supi-agent-runtime/api";
import { resolveInstructionFileNames } from "@mrclrchtr/supi-code-intelligence/instruction-files";
import type { ChildWebToolProvision } from "@mrclrchtr/supi-core/session";
import type { LocalReviewAuditStore } from "../../audit/local-review-audit-store.ts";
import { isRootCommit, resolveReviewSnapshot, summarizeReviewSnapshot } from "../../git.ts";
import { normalizeReviewInput } from "../../review-input.ts";
import { normalizeReviewScope, validateReviewScope } from "../../review-scope.ts";
import { reviewTargetEndpoints } from "../../target/input.ts";
import {
  type ReviewInstructionFiles,
  selectReviewInstructionFiles,
} from "../../target/instruction-files.ts";
import { snapshotsMatch } from "../../target/snapshot-match.ts";
import type { ReviewThinkingLevel } from "../../thinking.ts";
import type {
  PlannerRunResult,
  PlanningRecord,
  ReviewBatchDetails,
  ReviewInput,
  ReviewModelSelection,
  ReviewScope,
  ReviewSnapshot,
  ReviewTargetSpec,
  ReviewTask,
  ReviewTaskResult,
} from "../../types.ts";
import { runDependencyBootstrap } from "../../workspace/dependency-bootstrap.ts";
import {
  materializeReviewWorkspace,
  type ReviewWorkspace,
} from "../../workspace/review-workspace.ts";
import {
  executeReviewTasks,
  type ReviewExecutionBatch,
  type ReviewExecutionUpdate,
} from "./execution.ts";
import { PLANNER_PROMPT_VERSION, runPlanner } from "./planner.ts";
import { buildPlannerPrompt } from "./planner-input.ts";

/** Tool update callback signature shared across workflow adapters. */
type OnUpdate = ReviewExecutionUpdate;

/** Input for a transient interactive Planner Draft. */
export interface DraftReviewTasksInput {
  cwd: string;
  providerAuthority?: AgentRunProviderAuthority;
  target: ReviewTargetSpec;
  /** Optional advisory path focus included in the Planner input. */
  scope?: ReviewScope;
  plannerContext: string;
  plannerModel?: ReviewModelSelection;
  plannerThinkingLevel?: ReviewThinkingLevel;
  /** Reflect the Reviewer capability option to the submit-only Planner; does not enable it there. */
  reviewerCodemodeEnabled?: boolean;
  /** Reflect Reviewer Web Access to the submit-only Planner; does not enable it there. */
  reviewerWebEnabled?: boolean;
  signal?: AbortSignal;
  onUpdate?: OnUpdate;
}

/** Complete caller-defined Review request. */
export interface RunReviewInput {
  cwd: string;
  providerAuthority?: AgentRunProviderAuthority;
  target: ReviewTargetSpec;
  review: ReviewInput;
  /** Optional batch-level path focus, validated in the frozen after state. */
  scope?: ReviewScope;
  reviewerModel: ReviewModelSelection;
  /** Requested thinking level for Reviewer Sessions in this workflow. */
  reviewerThinkingLevel?: ReviewThinkingLevel;
  /** Opt Reviewer investigation into Pi codemode and scoped auxiliary models. */
  reviewerCodemodeEnabled?: boolean;
  /** Reviewer Web Access snapshot captured in the containing session; omitted means none. */
  reviewerWebTools?: ChildWebToolProvision;
  /** Optional explicit second model for Submission Recovery. */
  recoveryModel?: ReviewModelSelection;
  /** Requested recovery model id when configuration did not resolve. */
  recoveryModelId?: string;
  /** Snapshot captured when the interactive target was selected. A mismatch stops before workspace creation. */
  expectedSnapshot?: ReviewSnapshot;
  /** Target that produced `expectedSnapshot` when edited modes finalize a different public target. */
  expectedSnapshotTarget?: ReviewTargetSpec;
  /** Planner metadata retained only for the interactive Review result. */
  planning?: PlanningRecord;
  /** The interactive flow marks a valid draft as planner-assisted. */
  provenance?: ReviewBatchDetails["provenance"];
  /** Shell command run once before reviewer fan-out. */
  bootstrapCommand?: string;
  projectTrusted?: boolean;
  /** Present when local reviewer replay is enabled. */
  auditStore?: LocalReviewAuditStore;
  /** Registry for the Pi runtime that owns the Review request. */
  registry?: AgentRunRegistry;
  signal?: AbortSignal;
  onUpdate?: OnUpdate;
}

/** Translate a resolveReviewSnapshot error to a no-target reason. */
function snapshotErrorReason(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Could not resolve the Review Target.";
}
/** Capture one selected interactive target before task editing begins. */
export async function captureReviewTarget(
  cwd: string,
  spec: ReviewTargetSpec,
  signal?: AbortSignal,
) {
  try {
    return { kind: "captured" as const, snapshot: await resolveReviewSnapshot(cwd, spec, signal) };
  } catch (error) {
    return { kind: "no-target" as const, reason: snapshotErrorReason(error) };
  }
}
type PlannerFailure = Exclude<PlannerRunResult, { kind: "success" }>;

/** Normalize a Planner Draft without changing its required task modes. */
function normalizePlannerDraft(snapshot: ReviewSnapshot, value: ReviewInput): ReviewInput {
  const draft = normalizeReviewInput(value);
  if (hasChangeTask(draft.tasks) && snapshot.changes.length === 0) {
    throw new Error("Invalid Planner Draft.");
  }
  return draft;
}

/** Resolve the target and create one transient Planner Draft for `/supi-review`. */
export async function draftReviewTasks(input: DraftReviewTasksInput) {
  const scope = normalizeReviewScope(input.scope);
  input.onUpdate?.({
    content: [{ type: "text", text: "Resolving target…" }],
    details: {},
  });
  let snapshot: ReviewSnapshot;
  try {
    snapshot = await resolveReviewSnapshot(input.cwd, input.target, input.signal);
  } catch (error) {
    input.signal?.throwIfAborted();
    return { kind: "no-target" as const, reason: snapshotErrorReason(error) };
  }

  const promptVersion = PLANNER_PROMPT_VERSION;
  if (!input.plannerModel) {
    return {
      kind: "planner-failed" as const,
      result: { kind: "failed", failureCode: "session-creation-failed" } satisfies PlannerFailure,
      promptVersion,
    };
  }
  const modelId = input.plannerModel.canonicalId;

  input.onUpdate?.({
    content: [{ type: "text", text: "Running planner…" }],
    details: {},
  });
  let result: PlannerRunResult;
  try {
    result = await runPlanner({
      cwd: snapshot.repositoryRoot,
      model: input.plannerModel.model,
      requestedThinkingLevel: input.plannerThinkingLevel,
      ...(input.providerAuthority ? { providerAuthority: input.providerAuthority } : {}),
      reviewerCodemodeEnabled: input.reviewerCodemodeEnabled,
      ...(input.reviewerWebEnabled ? { reviewerWebEnabled: true } : {}),
      prompt: buildPlannerPrompt(snapshot, scope, input.plannerContext),
      signal: input.signal,
    });
  } catch {
    const failure: PlannerFailure = input.signal?.aborted
      ? { kind: "canceled", diagnostics: createEarlyCancellationDiagnostics() }
      : {
          kind: "failed",
          failureCode: "unexpected-runner-failure",
          diagnostics: createUnobservedAgentRunDiagnostics(),
        };
    return {
      kind: "planner-failed" as const,
      result: failure,
      modelId,
      promptVersion,
    };
  }

  if (result.kind !== "success") {
    return {
      kind: "planner-failed" as const,
      result,
      modelId,
      promptVersion,
    };
  }

  try {
    const draft = normalizePlannerDraft(snapshot, result.value);
    const planning: PlanningRecord = {
      promptVersion,
      modelId,
      draft,
      ...(result.usage ? { usage: result.usage } : {}),
    };
    return { kind: "planned" as const, snapshot, planning };
  } catch {
    return {
      kind: "planner-failed" as const,
      result: {
        kind: "failed",
        failureCode: "unexpected-runner-failure",
        diagnostics: createUnobservedAgentRunDiagnostics(),
        ...(result.usage ? { usage: result.usage } : {}),
      } satisfies PlannerFailure,
      modelId,
      promptVersion,
    };
  }
}

function workspaceFailureReason(error: unknown): string {
  if (error instanceof Error && error.message.startsWith("Review Workspace ")) {
    return error.message;
  }
  return "Could not create the Review Workspace.";
}

type MaterializedReviewWorkspace =
  | { kind: "ready"; workspace: ReviewWorkspace }
  | { kind: "invalid"; reason: string };

/** Materialize the frozen after state and validate its batch Review Scope before fan-out. */
async function materializeReviewWorkspaceWithScope(
  snapshot: ReviewSnapshot,
  scope: ReviewScope,
  signal?: AbortSignal,
): Promise<MaterializedReviewWorkspace> {
  let workspace: ReviewWorkspace;
  try {
    workspace = await materializeReviewWorkspace(snapshot, signal);
  } catch (error) {
    signal?.throwIfAborted();
    return { kind: "invalid", reason: workspaceFailureReason(error) };
  }
  try {
    await validateReviewScope(snapshot, workspace.cwd, scope, signal);
  } catch (error) {
    const cleanupWarning = await workspace.cleanup();
    signal?.throwIfAborted();
    const reason = error instanceof Error ? error.message : "Could not validate the Review Scope.";
    return {
      kind: "invalid",
      reason: cleanupWarning
        ? `${reason} Review Workspace cleanup warning: ${cleanupWarning.message} Recovery: ${cleanupWarning.recoveryCommand}`
        : reason,
    };
  }
  return { kind: "ready", workspace };
}

interface DependencyBootstrapInput {
  cwd: string;
  command?: string;
  signal?: AbortSignal;
  onUpdate?: OnUpdate;
}

/** Run the configured command once before reviewers share the workspace. */
async function bootstrapReviewWorkspace(input: DependencyBootstrapInput): Promise<boolean> {
  const command = input.command?.trim();
  if (!command) return false;
  input.onUpdate?.({
    content: [{ type: "text", text: "Bootstrapping dependencies…" }],
    details: {},
  });
  await runDependencyBootstrap(input.cwd, command, input.signal);
  return true;
}

function hasChangeTask(tasks: ReviewTask[]): boolean {
  return tasks.some((task) => task.mode === "change");
}

/** Use an after-state title when every task audits the current filesystem state. */
function reviewModeSnapshot(snapshot: ReviewSnapshot, review: ReviewInput): ReviewSnapshot {
  if (!hasChangeTask(review.tasks) && snapshot.target.includeUncommittedChanges) {
    return { ...snapshot, title: "Current filesystem" };
  }
  return snapshot;
}

async function targetRuleError(
  snapshot: ReviewSnapshot,
  review: ReviewInput,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const change = hasChangeTask(review.tasks);
  const requestedTarget = reviewTargetEndpoints(snapshot.requestedTarget);
  if (!change && requestedTarget.from !== undefined) {
    return "Review Targets for all-state tasks must not set from.";
  }
  if (!snapshot.target.includeUncommittedChanges && change && requestedTarget.from === undefined) {
    return "A committed change Review Target requires an explicit from endpoint.";
  }
  if (!snapshot.target.includeUncommittedChanges && change) {
    const root = await isRootCommit(snapshot.repositoryRoot, snapshot.target.toCommit, signal);
    if (root) return "A committed change Review Target cannot use a root commit as to.";
  }
  if (change && snapshot.changes.length === 0) {
    return "Every change Review Task requires a non-empty canonical change.";
  }
  return undefined;
}

type ResolvedReviewInput =
  | { kind: "ready"; snapshot: ReviewSnapshot; review: ReviewInput; scope: ReviewScope }
  | { kind: "no-target"; reason: string }
  | { kind: "invalid"; reason: string };

function reviewTargetsMatch(left: ReviewTargetSpec, right: ReviewTargetSpec): boolean {
  const leftTarget = reviewTargetEndpoints(left);
  const rightTarget = reviewTargetEndpoints(right);
  return (
    leftTarget.kind === rightTarget.kind &&
    leftTarget.from === rightTarget.from &&
    leftTarget.to === rightTarget.to
  );
}

/** Resolve Review input and revalidate any target captured before task editing. */
async function resolveReviewInput(input: RunReviewInput): Promise<ResolvedReviewInput> {
  try {
    const review = normalizeReviewInput(input.review);
    const scope = normalizeReviewScope(input.scope);
    // Resolve the execution target first. Materialization later verifies this exact snapshot.
    const snapshot = await resolveReviewSnapshot(input.cwd, input.target, input.signal);
    if (input.expectedSnapshot) {
      const snapshotTarget = input.expectedSnapshotTarget ?? input.target;
      const revalidatedSnapshot = reviewTargetsMatch(input.target, snapshotTarget)
        ? snapshot
        : await resolveReviewSnapshot(input.cwd, snapshotTarget, input.signal);
      if (!snapshotsMatch(input.expectedSnapshot, revalidatedSnapshot)) {
        return {
          kind: "invalid",
          reason: "The review target changed while tasks were edited. Start a new review.",
        };
      }
    }
    return { kind: "ready", snapshot, review, scope };
  } catch (error) {
    input.signal?.throwIfAborted();
    return { kind: "no-target", reason: snapshotErrorReason(error) };
  }
}

function captureReviewerAuxiliaryModels(
  enabled: boolean | undefined,
  providerAuthority?: AgentRunProviderAuthority,
): Promise<AgentRunAuxiliaryModelSnapshot | undefined> {
  if (!enabled || !providerAuthority) return Promise.resolve(undefined);
  return captureAgentRunAuxiliaryModels(providerAuthority);
}

/**
 * A Review that passed the start boundary: its target is frozen in a verified Review Workspace,
 * any configured Dependency Bootstrap has run, and its tasks are resolved. The owner must pass it
 * to {@link executePreparedReview}, which removes the workspace once every task is terminal.
 */
export interface PreparedReview {
  /** Execution settings from the original request; `signal` and `onUpdate` are not retained. */
  readonly request: Omit<RunReviewInput, "signal" | "onUpdate">;
  /** Resolved snapshot, with the after-state title applied for all-state batches. */
  readonly snapshot: ReviewSnapshot;
  readonly review: ReviewInput;
  readonly scope: ReviewScope;
  /** Frozen workspace and its Review Workspace Receipt. */
  readonly workspace: ReviewWorkspace;
  readonly provenance: ReviewBatchDetails["provenance"];
  readonly dependencyBootstrapConfigured: boolean;
  /** Repository instruction files embedded in every Reviewer Packet of this Review. */
  readonly instructionFiles: ReviewInstructionFiles;
  readonly authorizedAuxiliaryModels?: AgentRunAuxiliaryModelSnapshot;
}

/** Result of {@link prepareReview}: a prepared Review or the reason no Review can start. */
export type PrepareReviewOutcome =
  | { kind: "prepared"; review: PreparedReview }
  | { kind: "no-target"; reason: string }
  | { kind: "invalid"; reason: string };

/** Cancellation and progress for executing one prepared Review. */
export interface ExecutePreparedReviewControl {
  signal?: AbortSignal;
  onUpdate?: OnUpdate;
  /** Batch identity and per-task result observer of a Background Review. */
  batch?: ReviewExecutionBatch;
}

/**
 * Run the Review start boundary: validate input, resolve the Review Target, materialize and verify
 * the Review Workspace, and run any configured Dependency Bootstrap. Any failure removes the
 * workspace; cancellation rejects after that cleanup.
 */
export async function prepareReview(input: RunReviewInput): Promise<PrepareReviewOutcome> {
  input.signal?.throwIfAborted();
  const capture = captureReviewerAuxiliaryModels(
    input.reviewerCodemodeEnabled,
    input.providerAuthority,
  );
  const { result: captureResult } = raceAgentRunStartup(capture, input.signal);
  const authorizedAuxiliaryModels = await captureResult;
  input.signal?.throwIfAborted();
  const resolved = await resolveReviewInput(input);
  if (resolved.kind !== "ready") return resolved;
  const { snapshot: resolvedSnapshot, review, scope } = resolved;
  const ruleError = await targetRuleError(resolvedSnapshot, review, input.signal);
  if (ruleError) return { kind: "invalid" as const, reason: ruleError };
  const snapshot = reviewModeSnapshot(resolvedSnapshot, review);

  const provenance = input.provenance ?? "caller-supplied";
  input.onUpdate?.({
    content: [{ type: "text", text: "Freezing Review Workspace…" }],
    details: {
      completedCount: 0,
      totalCount: review.tasks.length,
      targetTitle: snapshot.title,
      reviewerModelId: input.reviewerModel.canonicalId,
      ...(review.sharedContext ? { sharedContext: review.sharedContext } : {}),
      ...(scope.paths?.length ? { scope } : {}),
      tasks: review.tasks,
      taskIds: review.tasks.map((task) => task.id),
    },
  });
  const materializedWorkspace = await materializeReviewWorkspaceWithScope(
    snapshot,
    scope,
    input.signal,
  );
  if (materializedWorkspace.kind === "invalid") return materializedWorkspace;
  const { workspace } = materializedWorkspace;

  let dependencyBootstrapConfigured: boolean;
  try {
    dependencyBootstrapConfigured = await bootstrapReviewWorkspace({
      cwd: workspace.cwd,
      command: input.bootstrapCommand,
      signal: input.signal,
      onUpdate: input.onUpdate,
    });
  } catch {
    await workspace.cleanup();
    input.signal?.throwIfAborted();
    return { kind: "invalid" as const, reason: "Configured Dependency Bootstrap failed." };
  }

  const selection = await selectReviewInstructionFiles({
    workspaceCwd: workspace.cwd,
    snapshot,
    review,
    scope,
    fileNames: resolveInstructionFileNames(input.cwd, input.projectTrusted ?? false),
  }).catch((error: unknown) => ({
    kind: "invalid" as const,
    reason: `Could not read the repository instruction files: ${error instanceof Error ? error.message : String(error)}`,
  }));
  if (selection.kind !== "selected") {
    await workspace.cleanup();
    input.signal?.throwIfAborted();
    return { kind: "invalid" as const, reason: selection.reason };
  }

  const { signal: _signal, onUpdate: _onUpdate, ...request } = input;
  return {
    kind: "prepared",
    review: {
      request,
      snapshot,
      review,
      scope,
      workspace,
      provenance,
      dependencyBootstrapConfigured,
      instructionFiles: selection.instructionFiles,
      ...(authorizedAuxiliaryModels ? { authorizedAuxiliaryModels } : {}),
    },
  };
}

/**
 * Run the Reviewer Sessions of a prepared Review in its frozen workspace, then remove the workspace
 * once every Review Task is terminal. A cleanup failure becomes the result's cleanup warning.
 */
export async function executePreparedReview(
  prepared: PreparedReview,
  control: ExecutePreparedReviewControl = {},
) {
  const { request, snapshot, review, scope, workspace } = prepared;
  let results: ReviewTaskResult[];
  let cleanupWarning: Awaited<ReturnType<typeof workspace.cleanup>>;
  try {
    results = await executeReviewTasks({
      workspaceCwd: workspace.cwd,
      snapshot,
      review,
      scope,
      model: request.reviewerModel,
      reviewerThinkingLevel: request.reviewerThinkingLevel,
      projectTrusted: request.projectTrusted,
      signal: control.signal,
      onUpdate: control.onUpdate,
      audit: request.auditStore
        ? { store: request.auditStore, workspaceReceipt: workspace.receipt }
        : undefined,
      dependencyBootstrapConfigured: prepared.dependencyBootstrapConfigured,
      instructionFiles: prepared.instructionFiles,
      providerAuthority: request.providerAuthority,
      recoveryModel: request.recoveryModel,
      recoveryModelId: request.recoveryModelId,
      registry: request.registry,
      reviewerCodemodeEnabled: request.reviewerCodemodeEnabled ?? false,
      authorizedAuxiliaryModels: prepared.authorizedAuxiliaryModels,
      reviewerWebTools: request.reviewerWebTools,
      targetDiff: workspace.targetDiff,
      batch: control.batch,
    });
  } finally {
    cleanupWarning = await workspace.cleanup();
  }
  const details = reviewBatchDetails(prepared, results, cleanupWarning);
  const usage = combineAgentRunUsage(results.map((result) => result.usage));
  return { kind: "completed" as const, details, ...(usage ? { usage } : {}) };
}

/**
 * Review Engine details of a prepared Review with the given task results. A running Background
 * Review passes only its finished results.
 */
export function reviewBatchDetails(
  prepared: PreparedReview,
  results: ReviewTaskResult[],
  cleanupWarning?: ReviewBatchDetails["cleanupWarning"],
): ReviewBatchDetails {
  const { request, snapshot, review, scope, workspace } = prepared;
  return {
    kind: "review-batch",
    provenance: prepared.provenance,
    snapshot: summarizeReviewSnapshot(snapshot),
    review,
    ...(scope.paths?.length ? { scope } : {}),
    workspaceReceipt: workspace.receipt,
    ...(request.planning ? { planning: request.planning } : {}),
    ...(cleanupWarning ? { cleanupWarning } : {}),
    results,
  };
}

/** Execute one caller-defined Review in the foreground: prepare it, then run it to completion. */
export async function runReview(input: RunReviewInput) {
  const prepared = await prepareReview(input);
  if (prepared.kind !== "prepared") return prepared;
  return executePreparedReview(prepared.review, {
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.onUpdate ? { onUpdate: input.onUpdate } : {}),
  });
}
