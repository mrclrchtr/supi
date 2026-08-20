// biome-ignore lint/style/noExcessiveLinesPerFile: the sequential interactive Review flow stays auditable in one module.
import {
  BorderedLoader,
  buildSessionContext,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { createAgentRunProviderAuthority } from "@mrclrchtr/supi-agent-runtime/api";
import type { LocalReviewAuditStore } from "../audit/local-review-audit-store.ts";
import { loadReviewConfig } from "../config.ts";
import { collectPlannerContext } from "../history/collect.ts";
import {
  CURRENT_SESSION_REVIEW_MODEL,
  getSelectableReviewModels,
  resolveAgentReviewModel,
  resolveRecoveryReviewModel,
} from "../model.ts";
import type { ReviewArtifactStore } from "../session/review-artifact-store.ts";
import { createReviewOutput } from "../tool/output-page.ts";
import { formatReviewBatch } from "../tool/review_run/format.ts";
import { queuePostReviewTurn } from "../tool/review_run/post-policy.ts";
import { captureReviewTarget, draftReviewTasks, runReview } from "../tool/review_run/workflow.ts";
import type {
  PlanningRecord,
  ReviewInput,
  ReviewMode,
  ReviewModelSelection,
  ReviewScope,
  ReviewSnapshot,
  ReviewTargetSpec,
  ReviewTask,
} from "../types.ts";
import {
  formatInteractiveReviewScope,
  selectInteractiveReviewScope,
} from "./review-scope-picker.ts";
import { type InteractiveTarget, selectInteractiveTarget } from "./review-target-picker.ts";

type CommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];

type EditableReview = Omit<ReviewInput, "tasks"> & {
  tasks: Array<Omit<ReviewTask, "mode"> & { mode?: ReviewMode }>;
};

function manualReview(): EditableReview {
  return {
    tasks: [
      {
        id: "general",
        instructions: "Review the selected target against the requested criteria.",
      },
    ],
  };
}

function hasChangeTask(review: ReviewInput): boolean {
  return review.tasks.some((task) => task.mode === "change");
}

function selectReviewerModel(ctx: CommandContext): Promise<ReviewModelSelection | undefined> {
  const models = getSelectableReviewModels(ctx);
  if (models.length === 0) {
    ctx.ui.notify("No scoped reviewer models are available.", "error");
    return Promise.resolve(undefined);
  }
  return ctx.ui
    .select(
      "Reviewer model",
      models.map((model) => model.canonicalId),
    )
    .then((id) => models.find((model) => model.canonicalId === id));
}

/** Edit one task's instructions. Undefined stops the interactive Review. */
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

/** Ask for Review Mode after each task edit and retain the drafted mode as the visible first choice. */
async function selectTaskMode(
  ctx: CommandContext,
  task: { id: string; mode?: ReviewMode },
  modes: ReviewMode[],
): Promise<ReviewMode | undefined> {
  const choices =
    task.mode && modes.includes(task.mode)
      ? [task.mode, ...modes.filter((mode) => mode !== task.mode)]
      : modes;
  const title = task.mode
    ? `Review Mode for ${task.id} (current: ${task.mode})`
    : `Review Mode for ${task.id}`;
  const mode = await ctx.ui.select(title, choices);
  return mode === "change" || mode === "state"
    ? choices.includes(mode)
      ? mode
      : undefined
    : undefined;
}

/** Edit each task in sequence. Mode is selected explicitly after its instructions. */
async function editReviewInteractive(
  ctx: CommandContext,
  review: EditableReview,
  options: { allowResize: boolean; modes: ReviewMode[] },
): Promise<ReviewInput | undefined> {
  let taskCount = review.tasks.length;
  if (options.allowResize) {
    const count = await ctx.ui.select("How many review tasks?", ["1", "2", "3", "4"]);
    if (!count) return undefined;
    taskCount = Number(count);
  }

  const tasks: ReviewTask[] = [];
  for (let index = 0; index < taskCount; index++) {
    const existing = review.tasks[index];
    const id = existing?.id ?? `task-${index + 1}`;
    const instructions = await editTaskInstructions(ctx, {
      index,
      taskCount,
      id,
      defaultInstructions: existing?.instructions ?? "",
    });
    if (instructions === undefined) return undefined;
    const mode = await selectTaskMode(ctx, { id, mode: existing?.mode }, options.modes);
    if (!mode) return undefined;
    tasks.push({
      id,
      instructions,
      mode,
      ...(existing?.criteriaSources?.length ? { criteriaSources: existing.criteriaSources } : {}),
    });
  }

  const sharedContext = await ctx.ui.editor(
    "Shared context (optional)",
    review.sharedContext ?? "",
  );
  if (sharedContext === undefined) return undefined;
  return { ...(sharedContext.trim() ? { sharedContext: sharedContext.trim() } : {}), tasks };
}

interface CancellableLoaderOptions {
  /** Finish at once on Escape only when the operation has no cleanup work. */
  finishOnAbort?: boolean;
}

/** Run command-owned child work behind an Escape-cancellable Pi loader. */
async function withCancellableLoader<T>(
  ctx: CommandContext,
  message: string,
  operation: (signal: AbortSignal) => Promise<T>,
  options: CancellableLoaderOptions = {},
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
      if (options.finishOnAbort) finish(undefined);
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

async function captureInteractiveTarget(
  ctx: CommandContext,
  target: ReviewTargetSpec,
): Promise<ReviewSnapshot | undefined> {
  const outcome = await withCancellableLoader(
    ctx,
    "Resolving target…",
    (signal) => captureReviewTarget(ctx.cwd, target, signal),
    { finishOnAbort: true },
  );
  if (!outcome) return undefined;
  if (outcome.kind === "captured") return outcome.snapshot;
  ctx.ui.notify(outcome.reason, "error");
  return undefined;
}

interface InteractivePlannerDraft {
  review: ReviewInput;
  snapshot: ReviewSnapshot;
  planning: PlanningRecord;
}

async function draftInteractiveReview(
  ctx: CommandContext,
  target: ReviewTargetSpec,
  scope: ReviewScope,
): Promise<InteractivePlannerDraft | undefined> {
  const config = loadReviewConfig(ctx.cwd);
  const plannerModel = resolveAgentReviewModel(ctx, config.plannerModel);
  const session = buildSessionContext(
    ctx.sessionManager.getEntries(),
    ctx.sessionManager.getLeafId(),
  );
  const outcome = await withCancellableLoader(ctx, "Planning review…", (signal) =>
    draftReviewTasks({
      cwd: ctx.cwd,
      providerAuthority: createAgentRunProviderAuthority(ctx.modelRegistry),
      target,
      scope,
      plannerContext: collectPlannerContext(session.messages),
      plannerModel,
      signal,
    }),
  );
  if (!outcome) return undefined;
  if (outcome.kind === "planned") {
    return {
      review: outcome.planning.draft,
      snapshot: outcome.snapshot,
      planning: outcome.planning,
    };
  }
  if (outcome.kind === "no-target") {
    ctx.ui.notify(outcome.reason, "error");
    return undefined;
  }
  ctx.ui.notify(
    outcome.result.kind === "canceled"
      ? "Review planning canceled."
      : "Planner did not produce a valid draft.",
    outcome.result.kind === "canceled" ? "info" : "error",
  );
  return undefined;
}

async function executeInteractiveReview(
  ctx: CommandContext,
  input: {
    target: ReviewTargetSpec;
    review: ReviewInput;
    scope: ReviewScope;
    reviewerModel: ReviewModelSelection;
    expectedSnapshot: ReviewSnapshot;
    expectedSnapshotTarget: ReviewTargetSpec;
    planning?: PlanningRecord;
    provenance: "caller-supplied" | "planner-assisted";
    auditStore?: LocalReviewAuditStore;
  },
) {
  const config = loadReviewConfig(ctx.cwd);
  const auditStore = config.auditEnabled ? input.auditStore : undefined;
  const recoveryModel = resolveRecoveryReviewModel(ctx, config.recoveryModel);
  return withCancellableLoader(
    ctx,
    `Reviewing… (${formatInteractiveReviewScope(input.scope)})`,
    (signal) =>
      runReview({
        cwd: ctx.cwd,
        providerAuthority: createAgentRunProviderAuthority(ctx.modelRegistry),
        target: input.target,
        review: input.review,
        scope: input.scope,
        reviewerModel: input.reviewerModel,
        ...(recoveryModel ? { recoveryModel } : {}),
        ...(config.recoveryModel !== "disabled" &&
        config.recoveryModel !== CURRENT_SESSION_REVIEW_MODEL &&
        !recoveryModel
          ? { recoveryModelId: config.recoveryModel }
          : {}),
        expectedSnapshot: input.expectedSnapshot,
        expectedSnapshotTarget: input.expectedSnapshotTarget,
        ...(input.planning ? { planning: input.planning } : {}),
        provenance: input.provenance,
        bootstrapCommand: config.bootstrapCommand,
        projectTrusted: ctx.isProjectTrusted(),
        ...(auditStore ? { auditStore } : {}),
        signal,
      }),
  );
}

interface ReviewCommandServices {
  pi: ExtensionAPI;
  artifactStore: ReviewArtifactStore;
  auditStore: LocalReviewAuditStore;
}

/** Select the target after Review Modes are edited. State batches never pass a before endpoint. */
function finalTarget(
  selected: InteractiveTarget,
  review: ReviewInput,
): ReviewTargetSpec | undefined {
  if (!hasChangeTask(review)) return selected.stateTarget;
  return selected.changeTarget;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every cancellation stops before reviewer execution.
export async function runReviewCommand(
  ctx: CommandContext,
  services: ReviewCommandServices,
): Promise<void> {
  const { pi, artifactStore, auditStore } = services;
  if (!ctx.hasUI) return;
  let selectedTarget: InteractiveTarget | undefined;
  try {
    selectedTarget = await selectInteractiveTarget(ctx);
  } catch (error) {
    ctx.ui.notify(
      error instanceof Error ? error.message : "Could not select a Review Target.",
      "error",
    );
    return;
  }
  if (!selectedTarget) return;
  const reviewerModel = await selectReviewerModel(ctx);
  if (!reviewerModel) return;
  const scope = await selectInteractiveReviewScope(ctx);
  if (!scope) return;
  const planningChoice = await ctx.ui.select("Review planning", [
    "Write my own tasks",
    "AI suggests tasks",
  ]);
  if (!planningChoice) return;

  const plannerDraft =
    planningChoice === "AI suggests tasks"
      ? await draftInteractiveReview(ctx, selectedTarget.selectedTarget, scope)
      : undefined;
  if (planningChoice === "AI suggests tasks" && !plannerDraft) return;
  const snapshot =
    plannerDraft?.snapshot ?? (await captureInteractiveTarget(ctx, selectedTarget.selectedTarget));
  if (!snapshot) return;
  const draftChoice = plannerDraft
    ? await ctx.ui.select("Planner Draft", [
        "Edit planner draft",
        "Discard draft and write my own tasks",
      ])
    : undefined;
  if (plannerDraft && !draftChoice) return;

  const usePlannerDraft = draftChoice === "Edit planner draft";
  const review = usePlannerDraft && plannerDraft ? plannerDraft.review : manualReview();
  const modes: ReviewMode[] =
    selectedTarget.changeTarget && snapshot.changes.length > 0 ? ["change", "state"] : ["state"];
  const edited = await editReviewInteractive(ctx, review, {
    allowResize: !usePlannerDraft,
    modes,
  });
  if (!edited) return;
  const target = finalTarget(selectedTarget, edited);
  if (!target) {
    ctx.ui.notify("Change Review Mode is unavailable for a root commit.", "error");
    return;
  }
  const approved = await ctx.ui.confirm(
    "Run review?",
    `${edited.tasks.length} task(s) using ${reviewerModel.canonicalId}\nFocus: ${formatInteractiveReviewScope(scope)}`,
  );
  if (!approved) return;
  const outcome = await executeInteractiveReview(ctx, {
    target,
    review: edited,
    scope,
    reviewerModel,
    expectedSnapshot: snapshot,
    expectedSnapshotTarget: selectedTarget.selectedTarget,
    ...(usePlannerDraft && plannerDraft ? { planning: plannerDraft.planning } : {}),
    provenance: usePlannerDraft ? "planner-assisted" : "caller-supplied",
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
  queuePostReviewTurn(
    pi,
    loadReviewConfig(ctx.cwd).postReviewPolicy,
    outcome.details,
    output.reference,
  );
}
