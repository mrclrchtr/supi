import type { Usage } from "@earendil-works/pi-ai";
import { buildSessionContext, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StatusSpinner } from "@mrclrchtr/supi-core/status-spinner";
import type { LocalReviewAuditStore } from "../audit/local-review-audit-store.ts";
import { loadReviewConfig } from "../config.ts";
import { summarizeReviewSnapshot } from "../git.ts";
import { collectPlannerContext } from "../history/collect.ts";
import { resolveAgentReviewModel } from "../model.ts";
import type { ReviewArtifactStore } from "../session/review-artifact-store.ts";
import type { ReviewPlanStore } from "../session/review-plan-store.ts";
import { renderPrepareCall, renderPrepareResult } from "../tui/prepare.ts";
import { renderRunCall, renderRunResult } from "../tui/run.ts";
import type { ReviewInput, ReviewSnapshot, ReviewTargetSpec, ReviewTask } from "../types.ts";
import {
  type PrepareReviewToolInput,
  parsePrepareReviewToolInput,
  parseRunReviewToolInput,
  prepareReviewSchema,
  runReviewSchema,
} from "./agent-review-schemas.ts";
import { withPostReviewInstruction } from "./post-review-policy.ts";
import { formatReviewBatch } from "./review-format.ts";
import { createReviewOutput } from "./review-output-tool.ts";

export { formatReviewBatch } from "./review-format.ts";

import { prepareReview, runReview } from "./review-workflow.ts";
import { formatReviewUsage } from "./usage-format.ts";

function target(input: PrepareReviewToolInput["target"]): ReviewTargetSpec {
  return (input ?? { kind: "working-tree" }) as ReviewTargetSpec;
}

function plannerFailureReason(failure: {
  kind: string;
  failureCode?: string;
  timeoutMs?: number;
}): string {
  if (failure.kind === "failed") return failure.failureCode ?? "failed";
  if (failure.kind === "timeout") return `timeout (${failure.timeoutMs} ms)`;
  return failure.kind;
}

type PreparedSnapshot = Pick<ReviewSnapshot, "title" | "changes" | "requestedTarget">;

function preparedTargetDetail(snapshot: PreparedSnapshot): string {
  if (snapshot.requestedTarget.kind === "current-state") {
    return `Review scope: ${snapshot.requestedTarget.paths?.map((path) => JSON.stringify(path)).join(", ") ?? "repository-wide discovery"}`;
  }
  return `Files changed: ${snapshot.changes.length}`;
}

function preparedTaskLines(task: ReviewTask, currentState: boolean): string[] {
  const lines = [
    "",
    `### ${task.id} (${currentState ? "criteria-only" : (task.findingScope ?? "change-only")})`,
    task.instructions,
  ];
  if (task.criteriaSources?.length) {
    lines.push(
      "Criteria sources:",
      ...task.criteriaSources.map((source) => `- ${source.reference}: ${source.summary}`),
    );
  }
  return lines;
}

function formatPrepared(plan: {
  id: string;
  snapshot: PreparedSnapshot;
  plannerDraft?: ReviewInput;
  plannerFailure?: { kind: string; failureCode?: string; timeoutMs?: number };
  plannerUsage?: Usage;
}): string {
  const currentState = plan.snapshot.requestedTarget.kind === "current-state";
  const lines = [
    "# Review Plan Prepared",
    "",
    `Plan ID: ${plan.id}`,
    `Target: ${plan.snapshot.title}`,
    preparedTargetDetail(plan.snapshot),
  ];
  if (plan.plannerUsage) lines.push(`Planner usage: ${formatReviewUsage(plan.plannerUsage)}`);
  if (plan.plannerDraft) {
    lines.push("", "## Planner Draft");
    if (plan.plannerDraft.sharedContext) lines.push("", plan.plannerDraft.sharedContext);
    for (const task of plan.plannerDraft.tasks)
      lines.push(...preparedTaskLines(task, currentState));
    lines.push(
      "",
      "Call supi_review_run with prepared: { planId, draftDecision: { useDraft: {} } } to use this draft.",
    );
  } else {
    if (plan.plannerFailure) {
      const reason = plannerFailureReason(plan.plannerFailure);
      lines.push("", `Planner unavailable: ${reason}. The plan remains usable without a draft.`);
    }
    lines.push(
      "",
      "Call supi_review_run with prepared.draftDecision.replaceDraft containing one to four tasks.",
    );
  }
  return lines.join("\n");
}

function resolveModels(ctx: Parameters<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>[4]) {
  const config = loadReviewConfig(ctx.cwd);
  const reviewer = resolveAgentReviewModel(ctx, config.agentModel);
  const planner = resolveAgentReviewModel(ctx, config.plannerModel);
  if (!reviewer)
    throw new Error(`Configured reviewer model "${config.agentModel}" is unavailable.`);
  return { reviewer, planner };
}

/**
 * Wraps onUpdate to also update a StatusSpinner with progress counts.
 * Returns the adapted callback that both updates the spinner and calls onUpdate.
 */
function wireSpinnerToProgress(
  // biome-ignore lint/suspicious/noExplicitAny: tool execute ctx type is narrower than ExtensionContext
  ctx: any,
  // biome-ignore lint/suspicious/noExplicitAny: onUpdate callback type varies per tool
  onUpdate: any,
  startMessage = "Reviewing…",
): {
  statusSpinner: StatusSpinner;
  wrappedUpdate: (result: {
    content: Array<{ type: "text"; text: string }>;
    details: Record<string, unknown>;
  }) => void;
} {
  const statusSpinner = new StatusSpinner(ctx, "supi-review");
  statusSpinner.start(startMessage);

  let completedCount = 0;
  let totalCount = 0;
  const wrappedUpdate = (result: {
    content: Array<{ type: "text"; text: string }>;
    details: Record<string, unknown>;
  }) => {
    const details = result.details as { completedCount?: number; totalCount?: number };
    completedCount = details.completedCount ?? completedCount;
    totalCount = details.totalCount ?? totalCount;
    const label =
      totalCount > 0
        ? `Reviewing… (${completedCount} of ${totalCount} tasks finished)`
        : "Reviewing…";
    statusSpinner.update(label);
    onUpdate?.(result);
  };
  return { statusSpinner, wrappedUpdate };
}

function initialReviewInput(
  input: ReturnType<typeof parseRunReviewToolInput>,
  planStore: ReviewPlanStore,
): ReviewInput | undefined {
  if (input.mode === "direct") return input.review;
  if (input.decision.kind === "use-review") return input.decision.review;
  return planStore.peek(input.planId)?.plannerDraft;
}

function initialReviewProgress(review: ReviewInput | undefined) {
  if (!review) return {};
  return {
    completedCount: 0,
    totalCount: review.tasks.length,
    ...(review.sharedContext ? { sharedContext: review.sharedContext } : {}),
    tasks: review.tasks,
    taskIds: review.tasks.map((task) => task.id),
  };
}

/** Factory for the supi_review_run execute function with animated status-bar spinner. */
function makeRunReviewExecute(
  planStore: ReviewPlanStore,
  artifactStore: ReviewArtifactStore,
  localAuditStore?: LocalReviewAuditStore,
): NonNullable<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]> {
  // biome-ignore lint/complexity/useMaxParams: Pi ToolDefinition execute signature
  return async (_id, params, signal, onUpdate, ctx) => {
    const input = parseRunReviewToolInput(params);
    const config = loadReviewConfig(ctx.cwd);
    const auditStore = config.auditEnabled ? localAuditStore : undefined;

    const { statusSpinner, wrappedUpdate } = wireSpinnerToProgress(ctx, onUpdate);

    const initialReview = initialReviewInput(input, planStore);
    wrappedUpdate({
      content: [{ type: "text", text: "Starting review…" }],
      details: initialReviewProgress(initialReview),
    });

    try {
      const outcome =
        input.mode === "direct"
          ? await runReview({
              mode: "direct",
              cwd: ctx.cwd,
              target: input.target,
              review: input.review,
              reviewerModel: resolveModels(ctx).reviewer,
              bootstrapCommand: config.bootstrapCommand,
              projectTrusted: ctx.isProjectTrusted(),
              ...(auditStore ? { auditStore } : {}),
              signal,
              onUpdate: wrappedUpdate,
            })
          : await runReview({
              mode: "prepared",
              cwd: ctx.cwd,
              planId: input.planId,
              decision: input.decision,
              planStore,
              bootstrapCommand: config.bootstrapCommand,
              projectTrusted: ctx.isProjectTrusted(),
              ...(auditStore ? { auditStore } : {}),
              signal,
              onUpdate: wrappedUpdate,
            });
      if (outcome.kind !== "completed") throw new Error(outcome.reason);
      const output = createReviewOutput(artifactStore, formatReviewBatch(outcome.details));
      const text = withPostReviewInstruction(
        output.text,
        config.postReviewPolicy,
        outcome.details,
        output.reference,
      );
      return {
        content: [{ type: "text", text }],
        details: { ...outcome.details, output: output.reference },
        ...(outcome.usage ? { usage: outcome.usage } : {}),
      };
    } finally {
      statusSpinner.stop();
    }
  };
}

/** Throw an actionable error from a non-prepared outcome. */
function throwPrepareFailure(
  outcome: { kind: string; reason?: string } & Record<string, unknown>,
): never {
  if (outcome.kind === "no-target")
    throw new Error(outcome.reason ?? "No reviewable changes found.");
  const result = outcome.result as { kind: string; failureCode?: string; timeoutMs?: number };
  const diagnostic =
    result.kind === "failed"
      ? result.failureCode
      : result.kind === "timeout"
        ? `timeout (${result.timeoutMs} ms)`
        : result.kind;
  throw new Error(`Planner failed: ${diagnostic}`);
}

/** Register optional preparation and universal direct/prepared execution tools. */
export function registerAgentReviewTools(
  pi: ExtensionAPI,
  planStore: ReviewPlanStore,
  artifactStore: ReviewArtifactStore,
  localAuditStore?: LocalReviewAuditStore,
): void {
  pi.registerTool({
    name: "supi_review_prepare",
    label: "Prepare Review",
    description:
      "Create a session-scoped, one-shot Review Plan for a Git change or a Current-State Audit; optionally draft tasks from bounded context and target metadata without inspecting code. Use only before a Prepared Review. Large output is paged.",
    promptSnippet: "Prepare an optional one-shot review plan",
    promptGuidelines: [
      "Use supi_review_prepare only when the caller asks for a Review Plan or Planner Draft; otherwise call supi_review_run directly.",
    ],
    parameters: prepareReviewSchema,
    renderCall: renderPrepareCall,
    renderResult: renderPrepareResult,
    // biome-ignore lint/complexity/useMaxParams: Pi ToolDefinition execute signature
    async execute(_id, params, signal, onUpdate, ctx) {
      const input = parsePrepareReviewToolInput(params);
      const models = resolveModels(ctx);
      const { statusSpinner, wrappedUpdate } = wireSpinnerToProgress(
        ctx,
        onUpdate,
        "Preparing review…",
      );

      try {
        const session = buildSessionContext(
          ctx.sessionManager.getEntries(),
          ctx.sessionManager.getLeafId(),
        );
        const outcome = await prepareReview({
          cwd: ctx.cwd,
          target: target(input.target),
          planning: input.planning ?? "none",
          plannerContext: collectPlannerContext(session.messages),
          reviewerModel: models.reviewer,
          plannerModel: models.planner,
          planStore,
          signal,
          onUpdate: wrappedUpdate,
        });
        if (outcome.kind !== "prepared") throwPrepareFailure(outcome);
        const output = createReviewOutput(artifactStore, formatPrepared(outcome.plan));
        return {
          content: [{ type: "text", text: output.text }],
          details: {
            kind: "review-prepared",
            planId: outcome.plan.id,
            snapshot: summarizeReviewSnapshot(outcome.plan.snapshot),
            reviewerModelId: outcome.plan.reviewerModel.canonicalId,
            plannerDraft: outcome.plan.plannerDraft,
            plannerModelId: outcome.plan.plannerModelId,
            plannerPromptVersion: outcome.plan.plannerPromptVersion,
            plannerUsage: outcome.plan.plannerUsage,
            plannerFailure: outcome.plan.plannerFailure,
            output: output.reference,
          },
          ...(outcome.usage ? { usage: outcome.usage } : {}),
        };
      } finally {
        statusSpinner.stop();
      }
    },
  });

  pi.registerTool({
    name: "supi_review_run",
    label: "Run Review",
    description:
      "Run one to four independent Inspection-only review tasks concurrently against one frozen Git change or Current-State Audit, directly or from a prepared plan. Creates a disposable linked Git worktree; large output is paged.",
    promptSnippet: "Run independent inspection-only review tasks",
    promptGuidelines: [
      "Unless explicitly requested otherwise, use `supi_review_run` for reviews instead of `Agent` or generic subagents.",
    ],
    parameters: runReviewSchema,
    renderCall: renderRunCall,
    renderResult: renderRunResult,
    execute: makeRunReviewExecute(planStore, artifactStore, localAuditStore),
  });

  pi.on("session_start", () => planStore.clear());
  pi.on("session_shutdown", () => planStore.clear());
}
