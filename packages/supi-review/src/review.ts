import {
  BorderedLoader,
  buildSessionContext,
  type ExtensionAPI,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { Box } from "@earendil-works/pi-tui";
import { LocalReviewAuditStore } from "./audit/local-review-audit-store.ts";
import { loadReviewConfig, registerReviewSettings } from "./config.ts";
import { listLocalBranches, listRecentCommits } from "./git-choices.ts";
import { collectPlannerContext } from "./history/collect.ts";
import { getSelectableReviewModels, resolveAgentReviewModel } from "./model.ts";
import { ReviewArtifactStore } from "./session/review-artifact-store.ts";
import { ReviewPlanStore } from "./session/review-plan-store.ts";
import { formatReviewBatch, registerAgentReviewTools } from "./tool/agent-review-tools.ts";
import { registerReviewAuditTool } from "./tool/review-audit-tool.ts";
import { createReviewOutput, registerReviewOutputTool } from "./tool/review-output-tool.ts";
import { prepareReview, runReview } from "./tool/review-workflow.ts";
import { renderRunResult } from "./tui/run.ts";
import type { ReviewInput, ReviewModelSelection, ReviewTargetSpec } from "./types.ts";
import { registerReviewWorkspaceCleanupCommand } from "./workspace/cleanup-command.ts";

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
    "Uncommitted changes against HEAD",
    "Current work against a base branch",
    "Committed changes against a base branch",
    "Single commit",
  ]);
  if (!kind) return undefined;
  if (kind === "Uncommitted changes against HEAD") return { kind: "working-tree" };
  const choices =
    kind === "Single commit" ? await listRecentCommits(ctx.cwd) : await listLocalBranches(ctx.cwd);
  const label = await ctx.ui.select(
    kind === "Single commit" ? "Commit" : "Base branch",
    choices.map((choice) => choice.label),
  );
  const choice = choices.find((candidate) => candidate.label === label);
  if (!choice) return undefined;
  if (kind === "Single commit") return { kind: "commit", commit: choice.commit };
  if (kind === "Current work against a base branch") {
    return { kind: "working-tree", baseCommit: choice.commit };
  }
  return { kind: "comparison", baseCommit: choice.commit };
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

/** Edit one task's instructions via a focused editor. Returns undefined on cancel. */
async function editTaskInstructions(
  ctx: CommandContext,
  opts: { index: number; taskCount: number; id: string; defaultInstructions: string },
): Promise<string | undefined> {
  const { index, taskCount, id, defaultInstructions } = opts;
  const label = taskCount > 1 ? `Task ${index + 1} of ${taskCount}: ${id}` : `Task: ${id}`;
  const instructions = await ctx.ui.editor(label, defaultInstructions);
  if (instructions === undefined) return undefined;
  if (!instructions.trim()) {
    ctx.ui.notify("Task instructions must not be blank.", "error");
    return undefined;
  }
  return instructions.trim();
}

/** Step-by-step wizard: edit each task's instructions in its own focused editor. */
async function editReviewInteractive(
  ctx: CommandContext,
  review: ReviewInput,
  { allowResize }: { allowResize: boolean },
): Promise<ReviewInput | undefined> {
  let taskCount = review.tasks.length;

  if (allowResize) {
    const countStr = await ctx.ui.select("How many review tasks?", ["1", "2", "3", "4"]);
    if (!countStr) return undefined;
    taskCount = Number(countStr);
  }

  const tasks: ReviewInput["tasks"] = [];
  for (let i = 0; i < taskCount; i++) {
    const existing = review.tasks[i];
    const id = existing?.id ?? `task-${i + 1}`;
    const defaultInstructions = existing?.instructions ?? "";

    const instructions = await editTaskInstructions(ctx, {
      index: i,
      taskCount,
      id,
      defaultInstructions,
    });
    if (instructions === undefined) return undefined;
    tasks.push({ id, instructions });
  }

  const result: ReviewInput = { tasks };
  const sharedContext = await ctx.ui.editor(
    "Shared context (optional)",
    review.sharedContext ?? "",
  );
  if (sharedContext === undefined) return undefined;
  if (sharedContext.trim()) result.sharedContext = sharedContext.trim();
  return result;
}

/** Run command-owned child work behind an Escape-cancellable Pi loader. */
async function withCancellableLoader<T>(
  ctx: CommandContext,
  message: string,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T | undefined> {
  return ctx.ui.custom<T | undefined>((tui, theme, _keybindings, done) => {
    const loader = new BorderedLoader(tui, theme, message);
    let settled = false;
    const finish = (value: T | undefined) => {
      if (settled) return;
      settled = true;
      done(value);
    };
    loader.onAbort = () => {
      // CancellableLoader aborts loader.signal; lifecycle cleanup determines the final outcome.
    };
    void operation(loader.signal).then(
      (value) => finish(value),
      (error) => {
        ctx.ui.notify(
          error instanceof Error ? error.message : "Review failed unexpectedly.",
          "error",
        );
        finish(undefined);
      },
    );
    return loader;
  });
}

async function prepareInteractiveReview(
  ctx: CommandContext,
  target: ReviewTargetSpec,
  reviewerModel: ReviewModelSelection,
  planStore: ReviewPlanStore,
): Promise<{ review: ReviewInput; planId: string } | undefined> {
  const config = loadReviewConfig(ctx.cwd);
  const plannerModel = resolveAgentReviewModel(ctx, config.plannerModel);
  const session = buildSessionContext(
    ctx.sessionManager.getEntries(),
    ctx.sessionManager.getLeafId(),
  );
  const outcome = await withCancellableLoader(ctx, "Planning review…", (signal) =>
    prepareReview({
      cwd: ctx.cwd,
      target,
      planning: "suggest",
      plannerContext: collectPlannerContext(session.messages),
      reviewerModel,
      plannerModel,
      planStore,
      signal,
    }),
  );
  if (!outcome) return undefined;
  if (outcome.kind === "canceled") {
    ctx.ui.notify("Review planning canceled.", "info");
    return undefined;
  }
  if (outcome.kind !== "prepared") {
    ctx.ui.notify(outcome.reason, "error");
    return undefined;
  }
  if (outcome.plan.plannerFailure) {
    ctx.ui.notify("Planner unavailable; edit replacement tasks to continue.", "warning");
  }
  return {
    review: outcome.plan.plannerDraft ?? DEFAULT_REVIEW,
    planId: outcome.plan.id,
  };
}

async function executeInteractiveReview(
  ctx: CommandContext,
  input: {
    target: ReviewTargetSpec;
    review: ReviewInput;
    reviewerModel: ReviewModelSelection;
    planId?: string;
    planStore: ReviewPlanStore;
    auditStore?: LocalReviewAuditStore;
  },
) {
  const config = loadReviewConfig(ctx.cwd);
  const bootstrapCommand = config.bootstrapCommand;
  const auditStore = config.auditEnabled ? input.auditStore : undefined;
  return withCancellableLoader(ctx, "Reviewing…", (signal) =>
    input.planId
      ? runReview({
          mode: "prepared",
          cwd: ctx.cwd,
          planId: input.planId,
          decision: { kind: "use-review", review: input.review },
          planStore: input.planStore,
          bootstrapCommand,
          projectTrusted: ctx.isProjectTrusted(),
          ...(auditStore ? { auditStore } : {}),
          signal,
        })
      : runReview({
          mode: "direct",
          cwd: ctx.cwd,
          target: input.target,
          review: input.review,
          reviewerModel: input.reviewerModel,
          bootstrapCommand,
          projectTrusted: ctx.isProjectTrusted(),
          ...(auditStore ? { auditStore } : {}),
          signal,
        }),
  );
}

interface ReviewCommandServices {
  pi: ExtensionAPI;
  planStore: ReviewPlanStore;
  artifactStore: ReviewArtifactStore;
  auditStore: LocalReviewAuditStore;
}

async function runCommand(ctx: CommandContext, services: ReviewCommandServices): Promise<void> {
  const { pi, planStore, artifactStore, auditStore } = services;
  if (!ctx.hasUI) return;
  const target = await selectTarget(ctx);
  if (!target) return;
  const reviewerModel = await selectReviewerModel(ctx);
  if (!reviewerModel) return;
  const planning = await ctx.ui.select("Review planning", [
    "Write my own tasks",
    "AI suggests tasks",
  ]);
  if (!planning) return;

  const prepared =
    planning === "AI suggests tasks"
      ? await prepareInteractiveReview(ctx, target, reviewerModel, planStore)
      : undefined;
  if (planning === "AI suggests tasks" && !prepared) return;
  const review = prepared?.review ?? DEFAULT_REVIEW;
  const planId = prepared?.planId;

  const edited = await editReviewInteractive(ctx, review, {
    allowResize: planning === "Write my own tasks",
  });
  if (!edited) return;
  const approved = await ctx.ui.confirm(
    "Run review?",
    `${edited.tasks.length} task(s) using ${reviewerModel.canonicalId}`,
  );
  if (!approved) return;
  const outcome = await executeInteractiveReview(ctx, {
    target,
    review: edited,
    reviewerModel,
    ...(planId ? { planId } : {}),
    planStore,
    auditStore,
  });
  if (!outcome) return;
  if (outcome.kind !== "completed") {
    ctx.ui.notify(outcome.reason, "error");
    return;
  }
  const output = createReviewOutput(artifactStore, formatReviewBatch(outcome.details));
  pi.sendMessage({
    customType: "supi-review",
    content: output.text,
    display: true,
    details: { ...outcome.details, output: output.reference, usage: outcome.usage },
  });
}

export default function reviewExtension(pi: ExtensionAPI): void {
  const planStore = new ReviewPlanStore();
  const artifactStore = new ReviewArtifactStore();
  const auditStore = new LocalReviewAuditStore({
    agentDir: process.env.PI_CODING_AGENT_DIR || getAgentDir(),
  });
  registerReviewSettings(pi);
  registerAgentReviewTools(pi, planStore, artifactStore, auditStore);
  registerReviewOutputTool(pi, artifactStore);
  if (loadReviewConfig(process.cwd()).auditEnabled) registerReviewAuditTool(pi, auditStore);
  registerReviewWorkspaceCleanupCommand(pi);

  // Message renderer for the /supi-review slash command output.
  // Adapts the sendMessage shape into the shape renderRunResult expects.
  pi.registerMessageRenderer("supi-review", (message, options, theme) => {
    const adapted = {
      content: [{ type: "text" as const, text: message.content as string }],
      details: message.details,
      isError: false,
    };
    const result = renderRunResult(adapted, { ...options, isPartial: false }, theme);
    const box = new Box(options.outputPad, 0, undefined);
    box.addChild(result);
    return box;
  });

  pi.registerCommand("supi-review", {
    description: "Run one or more caller-defined Inspection-only review tasks",
    handler: async (_args, ctx) => runCommand(ctx, { pi, planStore, artifactStore, auditStore }),
  });
}
