import { resolveReviewSnapshot, summarizeReviewSnapshot } from "../git.ts";
import { normalizeReviewSubmission } from "../review-result.ts";
import type { ReviewPlanStore } from "../session/review-plan-store.ts";
import { buildReviewPacket } from "../target/packet.ts";
import type {
  PlannerDraft,
  PlanningRecord,
  ReviewBatchDetails,
  ReviewInput,
  ReviewModelSelection,
  ReviewSnapshot,
  ReviewTargetSpec,
  ReviewTaskResult,
} from "../types.ts";
import { createUnobservedChildFailureDiagnostics } from "./child-failure-diagnostics.ts";
import { PLANNER_PROMPT_VERSION, runPlanner } from "./planner-runner.ts";
import { runReviewer } from "./review-runner.ts";

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
type OnUpdate = (result: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

/** Complete Direct Review request: target, full review input, and reviewer model. */
export interface DirectRunInput {
  mode: "direct";
  cwd: string;
  target: ReviewTargetSpec;
  review: ReviewInput;
  reviewerModel: ReviewModelSelection;
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
  signal?: AbortSignal;
  onUpdate?: OnUpdate;
}

/** Discriminated union accepted by `runReview` for both Direct and Prepared paths. */
export type RunReviewInput = DirectRunInput | PreparedRunInput;

const MAX_PLANNER_FILE_COUNT = 200;
const MAX_PLANNER_FILE_CHARS = 8_000;

/** Canonicalize and semantically validate review input for every adapter. */
export function normalizeReviewInput(review: ReviewInput): ReviewInput {
  const sharedContext = review.sharedContext?.trim();
  const tasks = review.tasks.map((task) => ({
    id: task.id.trim(),
    instructions: task.instructions.trim(),
  }));
  if (tasks.length < 1 || tasks.length > 4)
    throw new Error("Provide between one and four review tasks.");
  if (tasks.some((task) => !task.id || !task.instructions)) {
    throw new Error("Review task ids and instructions must not be blank.");
  }
  if (tasks.some((task) => task.id.length > 64)) {
    throw new Error("Review task ids must not exceed 64 characters.");
  }
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length) {
    throw new Error("Review task ids must be unique.");
  }
  return { ...(sharedContext ? { sharedContext } : {}), tasks };
}

function plannerFileManifest(files: string[]): string[] {
  const lines: string[] = [];
  let size = 0;
  for (const file of files) {
    const line = `- ${JSON.stringify(file)}`;
    if (
      lines.length >= MAX_PLANNER_FILE_COUNT ||
      size + line.length + 1 > MAX_PLANNER_FILE_CHARS - 100
    ) {
      break;
    }
    lines.push(line);
    size += line.length + 1;
  }
  const omitted = files.length - lines.length;
  if (omitted > 0) lines.push(`- … ${omitted} additional file(s) omitted`);
  return lines;
}

function plannerPrompt(snapshot: ReviewSnapshot, context: string): string {
  return [
    "# Review Planning Input",
    "",
    `Target: ${snapshot.title}`,
    `Changed files: ${snapshot.changedFiles.length}`,
    `Diff stats: +${snapshot.stats.additions} / -${snapshot.stats.deletions}`,
    "",
    "## Changed file names",
    ...plannerFileManifest(snapshot.changedFiles),
    "",
    "## Bounded session conversation",
    context || "No session conversation was available.",
  ].join("\n");
}

/** Resolve and store a one-shot plan, optionally asking the advisory Planner for tasks. */
export async function prepareReview(input: PrepareReviewInput) {
  input.onUpdate?.({
    content: [{ type: "text", text: "Resolving target…" }],
    details: {},
  });
  const snapshot = await resolveReviewSnapshot(input.cwd, input.target);
  if (!snapshot) return { kind: "no-target" as const, reason: "No reviewable changes found." };
  let plannerDraft: PlannerDraft | undefined;
  if (input.planning === "suggest") {
    if (!input.plannerModel) throw new Error("A configured Planner model is required.");
    input.onUpdate?.({
      content: [{ type: "text", text: "Running planner…" }],
      details: {},
    });
    const result = await runPlanner({
      cwd: input.cwd,
      model: input.plannerModel.model,
      prompt: plannerPrompt(snapshot, input.plannerContext),
      signal: input.signal,
    });
    if (result.kind !== "success") return { kind: "planner-failed" as const, result };
    plannerDraft = normalizeReviewInput(result.draft);
  }
  const plan = input.planStore.create({
    snapshot,
    reviewerModel: input.reviewerModel,
    ...(plannerDraft ? { plannerDraft } : {}),
    ...(input.plannerModel ? { plannerModelId: input.plannerModel.canonicalId } : {}),
    ...(plannerDraft ? { plannerPromptVersion: PLANNER_PROMPT_VERSION } : {}),
  });
  return { kind: "prepared" as const, plan };
}

function toTaskResult(
  taskId: string,
  packetHash: string,
  result: Awaited<ReturnType<typeof runReviewer>>,
): ReviewTaskResult {
  const identity = { taskId, packetHash, modelId: result.modelId };
  if (result.kind === "success") {
    const normalized = normalizeReviewSubmission(result.submission);
    return {
      status: "completed",
      ...identity,
      verdict: normalized.verdict,
      summary: normalized.summary,
      findings: normalized.findings,
    };
  }
  if (result.kind === "failed") {
    return {
      status: "failed",
      ...identity,
      failureCode: result.failureCode,
      ...(result.diagnostics ? { diagnostics: result.diagnostics } : {}),
    };
  }
  if (result.kind === "canceled") {
    return { status: "canceled", ...identity, diagnostics: result.diagnostics };
  }
  return {
    status: "timeout",
    ...identity,
    timeoutMs: result.timeoutMs,
    diagnostics: result.diagnostics,
  };
}

// biome-ignore lint/complexity/useMaxParams: compact internal fan-out helper
async function execute(
  cwd: string,
  snapshot: ReviewSnapshot,
  reviewInput: ReviewInput,
  model: ReviewModelSelection,
  signal?: AbortSignal,
  onUpdate?: OnUpdate,
): Promise<ReviewTaskResult[]> {
  const review = normalizeReviewInput(reviewInput);
  let completedCount = 0;
  const totalCount = review.tasks.length;

  return Promise.all(
    review.tasks.map(async (task) => {
      const packet = buildReviewPacket(snapshot, review, task, model);
      try {
        const result = await runReviewer({
          cwd,
          snapshot,
          task,
          prompt: packet.prompt,
          model,
          signal,
        });
        const taskResult = toTaskResult(task.id, packet.packetHash, result);
        completedCount++;
        const verb = taskResult.status === "completed" ? "complete" : taskResult.status;
        onUpdate?.({
          content: [
            { type: "text", text: `Task ${task.id} ${verb} (${completedCount} of ${totalCount})` },
          ],
          details: { completedCount, totalCount },
        });
        return taskResult;
      } catch {
        const taskResult: ReviewTaskResult = {
          status: "failed",
          taskId: task.id,
          packetHash: packet.packetHash,
          modelId: model.canonicalId,
          failureCode: "unexpected-runner-failure",
          diagnostics: createUnobservedChildFailureDiagnostics(),
        };
        completedCount++;
        onUpdate?.({
          content: [
            {
              type: "text",
              text: `Task ${task.id} failed (${completedCount} of ${totalCount})`,
            },
          ],
          details: { completedCount, totalCount },
        });
        return taskResult;
      }
    }),
  );
}

/** Execute a Direct Review or atomically consume and execute a Prepared Review. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: direct/prepared orchestration stays at one public seam
export async function runReview(input: RunReviewInput) {
  let snapshot: ReviewSnapshot;
  let review: ReviewInput;
  let model: ReviewModelSelection;
  let planning: PlanningRecord | undefined;
  let provenance: ReviewBatchDetails["provenance"] = "caller-supplied";

  if (input.mode === "direct") {
    const resolved = await resolveReviewSnapshot(input.cwd, input.target);
    if (!resolved) return { kind: "no-target" as const, reason: "No reviewable changes found." };
    snapshot = resolved;
    review = normalizeReviewInput(input.review);
    model = input.reviewerModel;
  } else {
    const plan = input.planStore.take(input.planId);
    if (!plan) {
      return {
        kind: "invalid" as const,
        reason: `Review Plan ${input.planId} was not found or was already consumed.`,
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
    snapshot = plan.snapshot;
    review = selectedReview;
    model = plan.reviewerModel;
    if (plan.plannerDraft) provenance = "planner-assisted";
    if (plan.plannerDraft && plan.plannerModelId && plan.plannerPromptVersion) {
      planning = {
        promptVersion: plan.plannerPromptVersion,
        modelId: plan.plannerModelId,
        draft: plan.plannerDraft,
        effectiveReview: review,
        decision: input.decision.kind,
      };
    }
  }

  const details: ReviewBatchDetails = {
    kind: "review-batch",
    mode: input.mode,
    provenance,
    snapshot: summarizeReviewSnapshot(snapshot),
    review,
    ...(planning ? { planning } : {}),
    results: await execute(input.cwd, snapshot, review, model, input.signal, input.onUpdate),
  };
  return { kind: "completed" as const, details };
}
