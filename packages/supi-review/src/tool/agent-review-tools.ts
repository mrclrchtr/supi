import { buildSessionContext, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadReviewConfig } from "../config.ts";
import { summarizeReviewSnapshot } from "../git.ts";
import { collectPlannerContext } from "../history/collect.ts";
import { resolveAgentReviewModel } from "../model.ts";
import type { ReviewPlanStore } from "../session/review-plan-store.ts";
import type { ReviewBatchDetails, ReviewTargetSpec, ReviewTaskResult } from "../types.ts";
import {
  type PrepareReviewToolInput,
  parsePrepareReviewToolInput,
  parseRunReviewToolInput,
  prepareReviewSchema,
  runReviewSchema,
} from "./agent-review-schemas.ts";
import { pageText } from "./output-page.ts";
import { prepareReview, runReview } from "./review-workflow.ts";

function target(input: PrepareReviewToolInput["target"]): ReviewTargetSpec {
  return (input ?? { kind: "working-tree" }) as ReviewTargetSpec;
}

function formatPrepared(plan: {
  id: string;
  snapshot: { title: string; changedFiles: string[] };
  plannerDraft?: { sharedContext?: string; tasks: Array<{ id: string; instructions: string }> };
}): string {
  const lines = [
    "# Review Plan Prepared",
    "",
    `Plan ID: ${plan.id}`,
    `Target: ${plan.snapshot.title}`,
    `Files changed: ${plan.snapshot.changedFiles.length}`,
  ];
  if (plan.plannerDraft) {
    lines.push("", "## Planner Draft");
    if (plan.plannerDraft.sharedContext) lines.push("", plan.plannerDraft.sharedContext);
    for (const task of plan.plannerDraft.tasks) {
      lines.push("", `### ${task.id}`, task.instructions);
    }
    lines.push("", "Call supi_review_run with an explicit accept-draft or use-review decision.");
  } else {
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
  if (result.status === "failed") return [...lines, `Status: failed (${result.failureCode})`];
  if (result.status === "canceled") return [...lines, "Status: canceled"];
  if (result.status === "timeout") {
    return [...lines, `Status: timeout (${result.timeoutMs} ms)`];
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
    "# Review Complete",
    "",
    `Mode: ${details.mode}`,
    `Provenance: ${details.provenance}`,
    `Target: ${details.snapshot.title}`,
  ];
  if (details.planning) {
    lines.push(
      `Planner: ${details.planning.modelId} (protocol ${details.planning.promptVersion})`,
      `Planner decision: ${details.planning.decision}`,
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
  return { reviewer, planner, config };
}

/** Register optional preparation and universal direct/prepared execution tools. */
export function registerAgentReviewTools(pi: ExtensionAPI, planStore: ReviewPlanStore): void {
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
    // biome-ignore lint/complexity/useMaxParams: Pi ToolDefinition execute signature
    async execute(_id, params, signal, _update, ctx) {
      const input = parsePrepareReviewToolInput(params);
      const models = resolveModels(ctx);
      if ((input.planning ?? "none") === "suggest" && !models.planner) {
        throw new Error(`Configured Planner model "${models.config.plannerModel}" is unavailable.`);
      }
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
      });
      if (outcome.kind !== "prepared")
        throw new Error(
          outcome.kind === "no-target" ? outcome.reason : "Planner failed to produce a draft.",
        );
      return {
        content: [{ type: "text", text: pageText(formatPrepared(outcome.plan)).text }],
        details: {
          kind: "review-prepared",
          planId: outcome.plan.id,
          snapshot: summarizeReviewSnapshot(outcome.plan.snapshot),
          reviewerModelId: outcome.plan.reviewerModel.canonicalId,
          plannerDraft: outcome.plan.plannerDraft,
          plannerModelId: outcome.plan.plannerModelId,
          plannerPromptVersion: outcome.plan.plannerPromptVersion,
        },
      };
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
    // biome-ignore lint/complexity/useMaxParams: Pi ToolDefinition execute signature
    async execute(_id, params, signal, _update, ctx) {
      const input = parseRunReviewToolInput(params);
      const outcome =
        input.mode === "direct"
          ? await runReview({
              mode: "direct",
              cwd: ctx.cwd,
              target: input.target,
              review: input.review,
              reviewerModel: resolveModels(ctx).reviewer,
              signal,
            })
          : await runReview({
              mode: "prepared",
              cwd: ctx.cwd,
              planId: input.planId,
              decision: input.decision,
              planStore,
              signal,
            });
      if (outcome.kind !== "completed") throw new Error(outcome.reason);
      return {
        content: [{ type: "text", text: pageText(formatReviewBatch(outcome.details)).text }],
        details: outcome.details,
      };
    },
  });

  pi.on("session_start", () => planStore.clear());
  pi.on("session_shutdown", () => planStore.clear());
}
