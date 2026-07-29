import { resolveReviewSnapshot, summarizeReviewSnapshot } from "../git.ts";
import { normalizeReviewInput } from "../review-input.ts";
import type { ReviewPlanLease, ReviewPlanStore } from "../session/review-plan-store.ts";
import { buildFileManifest } from "../target/file-manifest.ts";
import type {
  PlannerDraft,
  PlannerRunResult,
  PlanningRecord,
  ReviewBatchDetails,
  ReviewInput,
  ReviewModelSelection,
  ReviewSnapshot,
  ReviewTargetSpec,
  ReviewTaskResult,
} from "../types.ts";
import { materializeReviewWorkspace } from "../workspace/review-workspace.ts";
import {
  createEarlyCancellationDiagnostics,
  createUnobservedChildFailureDiagnostics,
} from "./child-failure-diagnostics.ts";
import { combineUsage } from "./child-usage.ts";
import { PLANNER_PROMPT_VERSION, runPlanner } from "./planner-runner.ts";
import { executeReviewTasks, type ReviewExecutionUpdate } from "./review-execution.ts";

/** Input required by the prepare workflow: target resolution plus optional Planner run. */
export interface PrepareReviewInput {
  cwd: string;
  target: ReviewTargetSpec;
  planning: "none" | "suggest";
  plannerContext: string;
  reviewerModel: ReviewModelSelection;
  plannerModel?: ReviewModelSelection;
  planStore: ReviewPlanStore;
  signal?: AbortSignal;
  onUpdate?: OnUpdate;
}

/** Tool update callback signature shared across workflow adapters. */
type OnUpdate = ReviewExecutionUpdate;

/** Complete Direct Review request: target, full review input, and reviewer model. */
export interface DirectRunInput {
  mode: "direct";
  cwd: string;
  target: ReviewTargetSpec;
  review: ReviewInput;
  reviewerModel: ReviewModelSelection;
  projectTrusted?: boolean;
  signal?: AbortSignal;
  onUpdate?: OnUpdate;
}

/** One-shot Prepared Review request: plan id, explicit decision, and plan store. */
export interface PreparedRunInput {
  mode: "prepared";
  cwd: string;
  planId: string;
  decision: { kind: "accept-draft" } | { kind: "use-review"; review: ReviewInput };
  planStore: ReviewPlanStore;
  projectTrusted?: boolean;
  signal?: AbortSignal;
  onUpdate?: OnUpdate;
}

/** Discriminated union accepted by `runReview` for both Direct and Prepared paths. */
export type RunReviewInput = DirectRunInput | PreparedRunInput;

function plannerPrompt(snapshot: ReviewSnapshot, context: string): string {
  return [
    "# Review Planning Input",
    "",
    `Target: ${snapshot.title}`,
    `Changed files: ${snapshot.changes.length}`,
    `Diff stats: +${snapshot.stats.additions} / -${snapshot.stats.deletions}`,
    "",
    "## Changed-path inventory",
    ...buildFileManifest(snapshot.changes),
    "",
    "## Bounded session conversation",
    context || "No session conversation was available.",
  ].join("\n");
}

/** Translate a resolveReviewSnapshot error to a no-target reason. */
function snapshotErrorReason(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "No reviewable changes found.";
}

interface PlannerPreparation {
  draft?: PlannerDraft;
  failure?: Exclude<PlannerRunResult, { kind: "success" }>;
  canceled?: Extract<PlannerRunResult, { kind: "canceled" }>;
  usage?: PlannerRunResult["usage"];
  modelId?: string;
  promptVersion?: string;
}

async function preparePlanner(
  input: PrepareReviewInput,
  snapshot: ReviewSnapshot,
): Promise<PlannerPreparation> {
  if (input.planning === "none") return {};
  if (!input.plannerModel) {
    return { failure: { kind: "failed", failureCode: "session-creation-failed" } };
  }
  input.onUpdate?.({
    content: [{ type: "text", text: "Running planner…" }],
    details: {},
  });
  const modelId = input.plannerModel.canonicalId;
  const promptVersion = PLANNER_PROMPT_VERSION;
  let result: PlannerRunResult;
  try {
    result = await runPlanner({
      cwd: snapshot.repositoryRoot,
      model: input.plannerModel.model,
      prompt: plannerPrompt(snapshot, input.plannerContext),
      signal: input.signal,
    });
  } catch {
    if (input.signal?.aborted) {
      return {
        canceled: { kind: "canceled", diagnostics: createEarlyCancellationDiagnostics() },
        modelId,
        promptVersion,
      };
    }
    return {
      failure: {
        kind: "failed",
        failureCode: "unexpected-runner-failure",
        diagnostics: createUnobservedChildFailureDiagnostics(),
      },
      modelId,
      promptVersion,
    };
  }
  const identity = {
    ...(result.usage ? { usage: result.usage } : {}),
    modelId,
    promptVersion,
  };
  if (result.kind === "canceled") return { canceled: result, ...identity };
  if (result.kind === "success") {
    return { draft: normalizeReviewInput(result.draft), ...identity };
  }
  return { failure: result, ...identity };
}

/** Resolve and store a one-shot plan, optionally asking the advisory Planner for tasks. */
export async function prepareReview(input: PrepareReviewInput) {
  input.onUpdate?.({
    content: [{ type: "text", text: "Resolving target…" }],
    details: {},
  });
  let snapshot: Awaited<ReturnType<typeof resolveReviewSnapshot>>;
  try {
    snapshot = await resolveReviewSnapshot(input.cwd, input.target);
  } catch (error) {
    return { kind: "no-target" as const, reason: snapshotErrorReason(error) };
  }
  if (!snapshot) return { kind: "no-target" as const, reason: "No reviewable changes found." };
  const planning = await preparePlanner(input, snapshot);
  if (planning.canceled) return { kind: "canceled" as const, result: planning.canceled };
  const plan = input.planStore.create({
    snapshot,
    reviewerModel: input.reviewerModel,
    ...(planning.draft ? { plannerDraft: planning.draft } : {}),
    ...(planning.failure ? { plannerFailure: planning.failure } : {}),
    ...(planning.usage ? { plannerUsage: planning.usage } : {}),
    ...(planning.modelId ? { plannerModelId: planning.modelId } : {}),
    ...(planning.promptVersion ? { plannerPromptVersion: planning.promptVersion } : {}),
  });
  return { kind: "prepared" as const, plan, ...(planning.usage ? { usage: planning.usage } : {}) };
}

function targetsMatch(left: ReviewSnapshot["target"], right: ReviewSnapshot["target"]): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "working-tree" && right.kind === "working-tree") {
    return (
      left.headCommit === right.headCommit &&
      left.requestedBaseCommit === right.requestedBaseCommit &&
      left.mergeBaseCommit === right.mergeBaseCommit
    );
  }
  if (left.kind === "comparison" && right.kind === "comparison") {
    return (
      left.requestedBaseCommit === right.requestedBaseCommit &&
      left.mergeBaseCommit === right.mergeBaseCommit &&
      left.headCommit === right.headCommit
    );
  }
  return (
    left.kind === "commit" &&
    right.kind === "commit" &&
    left.commit === right.commit &&
    left.parentCommit === right.parentCommit
  );
}

function snapshotsMatch(left: ReviewSnapshot, right: ReviewSnapshot): boolean {
  return left.diffHash === right.diffHash && targetsMatch(left.target, right.target);
}

/** Execute a Direct Review or atomically consume and execute a Prepared Review. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: direct/prepared orchestration stays at one public seam
export async function runReview(input: RunReviewInput) {
  let snapshot: ReviewSnapshot;
  let review: ReviewInput;
  let model: ReviewModelSelection;
  let planning: PlanningRecord | undefined;
  let lease: ReviewPlanLease | undefined;
  let planStore: ReviewPlanStore | undefined;
  let provenance: ReviewBatchDetails["provenance"] = "caller-supplied";

  if (input.mode === "direct") {
    let resolved: Awaited<ReturnType<typeof resolveReviewSnapshot>>;
    try {
      resolved = await resolveReviewSnapshot(input.cwd, input.target);
    } catch (error) {
      return { kind: "no-target" as const, reason: snapshotErrorReason(error) };
    }
    if (!resolved) return { kind: "no-target" as const, reason: "No reviewable changes found." };
    snapshot = resolved;
    review = normalizeReviewInput(input.review);
    model = input.reviewerModel;
  } else {
    const plan = input.planStore.peek(input.planId);
    if (!plan) {
      return {
        kind: "invalid" as const,
        reason: `Review Plan ${input.planId} was not found, is already running, or was consumed.`,
      };
    }
    if (input.decision.kind === "accept-draft" && !plan.plannerDraft) {
      return { kind: "invalid" as const, reason: "This plan has no Planner Draft." };
    }
    const selectedReview =
      input.decision.kind === "accept-draft"
        ? plan.plannerDraft
        : normalizeReviewInput(input.decision.review);
    if (!selectedReview) {
      return { kind: "invalid" as const, reason: "This plan has no Planner Draft." };
    }
    planStore = input.planStore;
    lease = planStore.acquire(input.planId);
    if (!lease) {
      return {
        kind: "invalid" as const,
        reason: `Review Plan ${input.planId} is already running.`,
      };
    }
    let refreshed: Awaited<ReturnType<typeof resolveReviewSnapshot>>;
    try {
      refreshed = await resolveReviewSnapshot(input.cwd, lease.plan.snapshot.requestedTarget);
    } catch {
      input.planStore.invalidate(lease);
      return {
        kind: "invalid" as const,
        reason: "Could not revalidate this Review Plan target. Prepare a new plan.",
      };
    }
    if (!refreshed || !snapshotsMatch(lease.plan.snapshot, refreshed)) {
      input.planStore.invalidate(lease);
      return {
        kind: "invalid" as const,
        reason: "This Review Plan is stale because its target changed. Prepare a new plan.",
      };
    }
    snapshot = refreshed;
    review = selectedReview;
    model = lease.plan.reviewerModel;
    provenance = input.decision.kind === "accept-draft" ? "planner-assisted" : "caller-supplied";
    if (lease.plan.plannerDraft && lease.plan.plannerModelId && lease.plan.plannerPromptVersion) {
      planning = {
        promptVersion: lease.plan.plannerPromptVersion,
        modelId: lease.plan.plannerModelId,
        ...(lease.plan.plannerUsage ? { usage: lease.plan.plannerUsage } : {}),
        draft: lease.plan.plannerDraft,
        effectiveReview: review,
        decision: input.decision.kind,
      };
    }
  }

  input.onUpdate?.({
    content: [{ type: "text", text: "Freezing Review Workspace…" }],
    details: {
      completedCount: 0,
      totalCount: review.tasks.length,
      targetTitle: snapshot.title,
      reviewerModelId: model.canonicalId,
      ...(review.sharedContext ? { sharedContext: review.sharedContext } : {}),
      tasks: review.tasks,
      taskIds: review.tasks.map((task) => task.id),
    },
  });
  let workspace: Awaited<ReturnType<typeof materializeReviewWorkspace>>;
  try {
    workspace = await materializeReviewWorkspace(snapshot);
  } catch {
    if (lease && planStore) planStore.release(lease);
    return { kind: "invalid" as const, reason: "Could not create the Review Workspace." };
  }

  let results: ReviewTaskResult[];
  let cleanupWarning: Awaited<ReturnType<typeof workspace.cleanup>>;
  try {
    results = await executeReviewTasks(
      workspace.cwd,
      snapshot,
      review,
      model,
      input.projectTrusted,
      input.signal,
      input.onUpdate,
    );
  } catch (error) {
    if (lease && planStore) planStore.release(lease);
    throw error;
  } finally {
    cleanupWarning = await workspace.cleanup();
  }
  if (lease && planStore) {
    if (results.some((result) => result.status === "completed")) planStore.consume(lease);
    else planStore.release(lease);
  }
  const details: ReviewBatchDetails = {
    kind: "review-batch",
    mode: input.mode,
    provenance,
    snapshot: summarizeReviewSnapshot(snapshot),
    review,
    ...(planning ? { planning } : {}),
    ...(cleanupWarning ? { cleanupWarning } : {}),
    results,
  };
  const usage = combineUsage(results.map((result) => result.usage));
  return { kind: "completed" as const, details, ...(usage ? { usage } : {}) };
}
