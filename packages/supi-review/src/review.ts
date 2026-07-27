import { buildSessionContext, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import { loadReviewConfig, registerReviewSettings } from "./config.ts";
import { listLocalBranches, listRecentCommits } from "./git.ts";
import { collectPlannerContext } from "./history/collect.ts";
import { getSelectableReviewModels, resolveAgentReviewModel } from "./model.ts";
import { ReviewPlanStore } from "./session/review-plan-store.ts";
import { formatReviewBatch, registerAgentReviewTools } from "./tool/agent-review-tools.ts";
import { pageText } from "./tool/output-page.ts";
import { normalizeReviewInput, prepareReview, runReview } from "./tool/review-workflow.ts";
import { reviewInputSchema } from "./tool/schemas.ts";
import type { ReviewInput, ReviewModelSelection, ReviewTargetSpec } from "./types.ts";

type CommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];

const DEFAULT_REVIEW: ReviewInput = {
  tasks: [
    {
      id: "general",
      instructions: "Review for concrete regressions introduced by this change.",
    },
  ],
};

async function selectTarget(ctx: CommandContext): Promise<ReviewTargetSpec | undefined> {
  const kind = await ctx.ui.select("Review target", [
    "Working tree",
    "Comparison against a base commit",
    "Single commit",
  ]);
  if (!kind) return undefined;
  if (kind === "Working tree") return { kind: "working-tree" };
  const choices =
    kind === "Single commit" ? await listRecentCommits(ctx.cwd) : await listLocalBranches(ctx.cwd);
  const label = await ctx.ui.select(
    kind === "Single commit" ? "Commit" : "Base branch",
    choices.map((choice) => choice.label),
  );
  const choice = choices.find((candidate) => candidate.label === label);
  if (!choice) return undefined;
  return kind === "Single commit"
    ? { kind: "commit", commit: choice.commit }
    : { kind: "comparison", baseCommit: choice.commit };
}

async function selectReviewerModel(ctx: CommandContext): Promise<ReviewModelSelection | undefined> {
  const models = getSelectableReviewModels(ctx);
  if (models.length === 0) {
    ctx.ui.notify("No scoped reviewer models are available.", "error");
    return undefined;
  }
  const id = await ctx.ui.select(
    "Reviewer model",
    models.map((model) => model.canonicalId),
  );
  return models.find((model) => model.canonicalId === id);
}

/** Parse editor JSON through the same structural and semantic contract as agent input. */
export async function editReview(
  ctx: CommandContext,
  review: ReviewInput,
): Promise<ReviewInput | undefined> {
  const text = await ctx.ui.editor("Edit review tasks (JSON)", JSON.stringify(review, null, 2));
  if (text === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Value.Check(reviewInputSchema, parsed)) {
      ctx.ui.notify("Review tasks do not match the required review schema.", "error");
      return undefined;
    }
    return normalizeReviewInput(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review tasks must be valid JSON.";
    ctx.ui.notify(message, "error");
    return undefined;
  }
}

async function runCommand(
  ctx: CommandContext,
  pi: ExtensionAPI,
  planStore: ReviewPlanStore,
): Promise<void> {
  if (!ctx.hasUI) return;
  const target = await selectTarget(ctx);
  if (!target) return;
  const reviewerModel = await selectReviewerModel(ctx);
  if (!reviewerModel) return;
  const planning = await ctx.ui.select("Review planning", ["Write tasks", "Suggest tasks"]);
  if (!planning) return;

  let review = DEFAULT_REVIEW;
  let planId: string | undefined;
  if (planning === "Suggest tasks") {
    const config = loadReviewConfig(ctx.cwd);
    const plannerModel = resolveAgentReviewModel(ctx, config.plannerModel);
    if (!plannerModel) {
      ctx.ui.notify(`Configured Planner model "${config.plannerModel}" is unavailable.`, "error");
      return;
    }
    const session = buildSessionContext(
      ctx.sessionManager.getEntries(),
      ctx.sessionManager.getLeafId(),
    );
    const outcome = await prepareReview({
      cwd: ctx.cwd,
      target,
      planning: "suggest",
      plannerContext: collectPlannerContext(session.messages),
      reviewerModel,
      plannerModel,
      planStore,
    });
    if (outcome.kind !== "prepared" || !outcome.plan.plannerDraft) {
      ctx.ui.notify("Planner did not produce a draft.", "error");
      return;
    }
    review = outcome.plan.plannerDraft;
    planId = outcome.plan.id;
  }

  const edited = await editReview(ctx, review);
  if (!edited) return;
  const approved = await ctx.ui.confirm(
    "Run review?",
    `${edited.tasks.length} task(s) using ${reviewerModel.canonicalId}`,
  );
  if (!approved) return;

  const outcome = planId
    ? await runReview({
        mode: "prepared",
        cwd: ctx.cwd,
        planId,
        decision: { kind: "use-review", review: edited },
        planStore,
      })
    : await runReview({
        mode: "direct",
        cwd: ctx.cwd,
        target,
        review: edited,
        reviewerModel,
      });
  if (outcome.kind !== "completed") {
    ctx.ui.notify(outcome.reason, "error");
    return;
  }
  pi.sendMessage({
    customType: "supi-review",
    content: pageText(formatReviewBatch(outcome.details)).text,
    display: true,
    details: outcome.details,
  });
}

export default function reviewExtension(pi: ExtensionAPI): void {
  const planStore = new ReviewPlanStore();
  registerReviewSettings(pi);
  registerAgentReviewTools(pi, planStore);
  pi.registerCommand("supi-review", {
    description: "Run one or more caller-defined read-only review tasks",
    handler: async (_args, ctx) => runCommand(ctx, pi, planStore),
  });
}
