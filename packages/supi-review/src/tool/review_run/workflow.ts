// biome-ignore lint/style/noExcessiveLinesPerFile: Review Target and Workspace lifecycle remain in one workflow module.
import type { AgentRunProviderAuthority } from "@mrclrchtr/supi-agent-runtime/api";
import {
  combineAgentRunUsage,
  createEarlyCancellationDiagnostics,
  createUnobservedAgentRunDiagnostics,
} from "@mrclrchtr/supi-agent-runtime/api";
import type { LocalReviewAuditStore } from "../../audit/local-review-audit-store.ts";
import { isRootCommit, resolveReviewSnapshot, summarizeReviewSnapshot } from "../../git.ts";
import { normalizeReviewInput } from "../../review-input.ts";
import { normalizeReviewScope, validateReviewScope } from "../../review-scope.ts";
import { reviewTargetEndpoints } from "../../target/input.ts";
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
import { materializeReviewWorkspace } from "../../workspace/review-workspace.ts";
import { executeReviewTasks, type ReviewExecutionUpdate } from "./execution.ts";
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
  | { kind: "ready"; workspace: Awaited<ReturnType<typeof materializeReviewWorkspace>> }
  | { kind: "invalid"; reason: string };

/** Materialize the frozen after state and validate its batch Review Scope before fan-out. */
async function materializeReviewWorkspaceWithScope(
  snapshot: ReviewSnapshot,
  scope: ReviewScope,
  signal?: AbortSignal,
): Promise<MaterializedReviewWorkspace> {
  let workspace: Awaited<ReturnType<typeof materializeReviewWorkspace>>;
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

/** Execute one caller-defined Review. */
export async function runReview(input: RunReviewInput) {
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

  let results: ReviewTaskResult[];
  let cleanupWarning: Awaited<ReturnType<typeof workspace.cleanup>>;
  try {
    results = await executeReviewTasks(
      workspace.cwd,
      snapshot,
      review,
      scope,
      input.reviewerModel,
      input.reviewerThinkingLevel,
      input.projectTrusted,
      input.signal,
      input.onUpdate,
      input.auditStore
        ? { store: input.auditStore, workspaceReceipt: workspace.receipt }
        : undefined,
      dependencyBootstrapConfigured,
      input.providerAuthority,
      input.recoveryModel,
      input.recoveryModelId,
    );
  } finally {
    cleanupWarning = await workspace.cleanup();
  }
  const details: ReviewBatchDetails = {
    kind: "review-batch",
    provenance,
    snapshot: summarizeReviewSnapshot(snapshot),
    review,
    ...(scope.paths?.length ? { scope } : {}),
    workspaceReceipt: workspace.receipt,
    ...(input.planning ? { planning: input.planning } : {}),
    ...(cleanupWarning ? { cleanupWarning } : {}),
    results,
  };
  const usage = combineAgentRunUsage(results.map((result) => result.usage));
  return { kind: "completed" as const, details, ...(usage ? { usage } : {}) };
}
