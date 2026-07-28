import type { Usage } from "@earendil-works/pi-ai";
import { buildSessionContext, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StatusSpinner } from "@mrclrchtr/supi-core/status-spinner";
import { loadReviewConfig } from "../config.ts";
import { summarizeReviewSnapshot } from "../git.ts";
import { collectPlannerContext } from "../history/collect.ts";
import { resolveAgentReviewModel } from "../model.ts";
import type { ReviewArtifactStore } from "../session/review-artifact-store.ts";
import type { ReviewPlanStore } from "../session/review-plan-store.ts";
import { renderPrepareCall, renderPrepareResult } from "../tui/prepare.ts";
import { renderRunCall, renderRunResult } from "../tui/run.ts";
import type { ReviewBatchDetails, ReviewTargetSpec, ReviewTaskResult } from "../types.ts";
import {
  type PrepareReviewToolInput,
  parsePrepareReviewToolInput,
  parseRunReviewToolInput,
  prepareReviewSchema,
  runReviewSchema,
} from "./agent-review-schemas.ts";
import { formatChildFailureDiagnostics } from "./child-failure-diagnostics.ts";
import { createReviewOutput } from "./review-output-tool.ts";
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

function formatPrepared(plan: {
  id: string;
  snapshot: { title: string; changedFiles: string[] };
  plannerDraft?: { sharedContext?: string; tasks: Array<{ id: string; instructions: string }> };
  plannerFailure?: { kind: string; failureCode?: string; timeoutMs?: number };
  plannerUsage?: Usage;
}): string {
  const lines = [
    "# Review Plan Prepared",
    "",
    `Plan ID: ${plan.id}`,
    `Target: ${plan.snapshot.title}`,
    `Files changed: ${plan.snapshot.changedFiles.length}`,
  ];
  if (plan.plannerUsage) lines.push(`Planner usage: ${formatReviewUsage(plan.plannerUsage)}`);
  if (plan.plannerDraft) {
    lines.push("", "## Planner Draft");
    if (plan.plannerDraft.sharedContext) lines.push("", plan.plannerDraft.sharedContext);
    for (const task of plan.plannerDraft.tasks) {
      lines.push("", `### ${task.id}`, task.instructions);
    }
    lines.push("", "Call supi_review_run with an explicit accept-draft or use-review decision.");
  } else {
    if (plan.plannerFailure) {
      const reason = plannerFailureReason(plan.plannerFailure);
      lines.push("", `Planner unavailable: ${reason}. The plan remains usable without a draft.`);
    }
    lines.push("", "Call supi_review_run with a use-review decision containing one to four tasks.");
  }
  return lines.join("\n");
}

function formatTaskResult(result: ReviewTaskResult): string[] {
  const lines = [
    "",
    `## ${result.taskId}`,
    `Model: ${result.modelId}`,
    `Packet SHA-256: ${result.packetHash}`,
  ];
  if (result.usage) lines.push(`Usage: ${formatReviewUsage(result.usage)}`);
  if (result.status === "failed") {
    lines.push(`Status: failed (${result.failureCode})`);
    if (result.diagnostics) {
      lines.push("", ...formatChildFailureDiagnostics(result.diagnostics));
    }
    return lines;
  }
  if (result.status === "canceled") {
    lines.push("Status: canceled");
    if (result.diagnostics) {
      lines.push("", ...formatChildFailureDiagnostics(result.diagnostics));
    }
    return lines;
  }
  if (result.status === "timeout") {
    lines.push(`Status: timeout (${result.timeoutMs} ms)`);
    if (result.diagnostics) {
      lines.push("", ...formatChildFailureDiagnostics(result.diagnostics));
    }
    return lines;
  }
  lines.push(`Verdict: ${result.verdict.toUpperCase()}`, "", result.summary);
  for (const finding of result.findings) {
    lines.push(
      "",
      `- ${finding.title} [${finding.blocksAcceptance ? "blocking" : "non-blocking"}; impact ${finding.impact}; effort ${finding.effort}; confidence ${finding.confidence}]`,
      ...(finding.location
        ? [
            `  Location: ${finding.location.path}:${finding.location.startLine}-${finding.location.endLine}`,
          ]
        : []),
      `  ${finding.description}`,
    );
  }
  return lines;
}

export function formatReviewBatch(details: ReviewBatchDetails): string {
  const lines = [
    "# Review Finished",
    "",
    `Mode: ${details.mode}`,
    `Provenance: ${details.provenance}`,
    `Target: ${details.snapshot.title}`,
  ];
  if (details.planning) {
    lines.push(
      `Planner: ${details.planning.modelId} (protocol ${details.planning.promptVersion})`,
      `Planner decision: ${details.planning.decision}`,
      ...(details.planning.usage
        ? [`Planner usage: ${formatReviewUsage(details.planning.usage)}`]
        : []),
    );
  }
  for (const result of details.results) lines.push(...formatTaskResult(result));
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
        ? `Reviewing… (${completedCount} of ${totalCount} tasks complete)`
        : "Reviewing…";
    statusSpinner.update(label);
    onUpdate?.(result);
  };
  return { statusSpinner, wrappedUpdate };
}

/** Compute the initial task count for the progress indicator. */
function initialTaskCount(
  input: ReturnType<typeof parseRunReviewToolInput>,
  planStore: ReviewPlanStore,
): number {
  if (input.mode === "direct") return input.review?.tasks?.length ?? 1;
  if (input.decision?.kind === "use-review") return input.decision.review?.tasks?.length ?? 0;
  if (input.decision?.kind === "accept-draft") {
    return planStore.peek(input.planId)?.plannerDraft?.tasks.length ?? 0;
  }
  return 0;
}

/** Factory for the supi_review_run execute function with animated status-bar spinner. */
function makeRunReviewExecute(
  planStore: ReviewPlanStore,
  artifactStore: ReviewArtifactStore,
): NonNullable<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]> {
  // biome-ignore lint/complexity/useMaxParams: Pi ToolDefinition execute signature
  return async (_id, params, signal, onUpdate, ctx) => {
    const input = parseRunReviewToolInput(params);

    const { statusSpinner, wrappedUpdate } = wireSpinnerToProgress(ctx, onUpdate);

    const taskCount = initialTaskCount(input, planStore);
    wrappedUpdate({
      content: [{ type: "text", text: "Starting review…" }],
      details: taskCount > 0 ? { completedCount: 0, totalCount: taskCount } : {},
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
              signal,
              onUpdate: wrappedUpdate,
            })
          : await runReview({
              mode: "prepared",
              cwd: ctx.cwd,
              planId: input.planId,
              decision: input.decision,
              planStore,
              signal,
              onUpdate: wrappedUpdate,
            });
      if (outcome.kind !== "completed") throw new Error(outcome.reason);
      const output = createReviewOutput(artifactStore, formatReviewBatch(outcome.details));
      return {
        content: [{ type: "text", text: output.text }],
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
): void {
  pi.registerTool({
    name: "supi_review_prepare",
    label: "Prepare Review",
    description: "Create a one-shot Review Plan, optionally with a lightweight Planner Draft.",
    promptSnippet: "Prepare an optional one-shot code review plan",
    promptGuidelines: [
      "Use supi_review_prepare only when a caller wants to inspect or request a Planner Draft before execution.",
      "Use supi_review_run in direct mode when the current skill or agent already knows the review tasks.",
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
    description: "Run one to four caller-defined review tasks directly or from a prepared plan.",
    promptSnippet: "Run independent read-only code review tasks",
    promptGuidelines: [
      "Use supi_review_run directly when a skill or the main agent already has complete review task instructions.",
      "Repository stability from invocation through completion is a caller precondition for supi_review_run.",
    ],
    parameters: runReviewSchema,
    renderCall: renderRunCall,
    renderResult: renderRunResult,
    execute: makeRunReviewExecute(planStore, artifactStore),
  });

  pi.on("session_start", () => planStore.clear());
  pi.on("session_shutdown", () => planStore.clear());
}
