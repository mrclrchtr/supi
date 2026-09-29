import type { PromptImproverContext } from "./context.ts";
import { capturePromptImproverError } from "./diagnostics.ts";
import type { CommandContext } from "./draft.ts";
import { ownershipFailureReason } from "./draft.ts";
import { reviewProposal } from "./ui-review.ts";
import type { PreparedProposal, RunResult, WorkflowState } from "./workflow-types.ts";

/** Show a proposed prompt and apply it only while the captured editor remains current. */
export async function reviewAndApply(
  state: WorkflowState,
  prepared: PreparedProposal,
): Promise<RunResult> {
  const reviewStartedAt = state.diagnostics.startClock();
  state.diagnostics.record(
    "proposal.presented",
    "info",
    "Prompt improvement proposal shown",
    () => ({
      outcome: "presented",
      proposal: prepared.proposal,
      originalDraft: state.draft,
      modelId: state.modelId,
      includedContext: includedContextCategories(prepared.context),
    }),
  );
  let review: "accept" | "dismiss" | undefined;
  try {
    review = await reviewProposal(state.ctx.ui, state.controller.signal, {
      proposal: prepared.proposal,
      original: state.draft,
      model: state.modelId,
      includedContext: includedContextCategories(prepared.context),
    });
  } catch (error) {
    state.diagnostics.record("proposal.review", "error", "Prompt proposal review failed", () => ({
      outcome: "failed",
      reasonCode: "proposal_review_failed",
      durationMs: state.diagnostics.durationSince(reviewStartedAt),
      ...capturePromptImproverError(error),
    }));
    state.ctx.ui.notify(
      "The proposal review could not open. The confirmed draft was kept.",
      "error",
    );
    return { outcome: "failed", reasonCode: "proposal_review_failed" };
  }
  if (review !== "accept" || state.controller.signal.aborted) {
    return recordReviewExit(state, reviewStartedAt, state.controller.signal.aborted);
  }
  return acceptProposal(state, prepared, reviewStartedAt);
}

function recordReviewExit(
  state: WorkflowState,
  startedAt: number | undefined,
  cancelled: boolean,
): RunResult {
  const outcome = cancelled ? "cancelled" : "dismissed";
  const reasonCode = cancelled ? "lifecycle_cancelled" : "proposal_dismissed";
  state.diagnostics.record("proposal.review", "info", "Prompt proposal review ended", () => ({
    outcome,
    reasonCode,
    durationMs: state.diagnostics.durationSince(startedAt),
  }));
  return { outcome, reasonCode };
}

function acceptProposal(
  state: WorkflowState,
  prepared: PreparedProposal,
  startedAt: number | undefined,
): RunResult {
  const staleReason = ownershipFailureReason(state.ctx, state.ownership, state.draft);
  if (staleReason) {
    state.diagnostics.record(
      "proposal.review",
      "warning",
      "Stale prompt proposal was rejected",
      () => ({
        outcome: "stale",
        reasonCode: staleReason,
        durationMs: state.diagnostics.durationSince(startedAt),
      }),
    );
    notifyStaleEditor(state.ctx);
    return { outcome: "stale", reasonCode: staleReason };
  }
  // No await or diagnostic append may occur between the final guard and this editor write.
  state.ctx.ui.setEditorText(prepared.proposal);
  state.diagnostics.record("proposal.review", "info", "Prompt proposal accepted", () => ({
    outcome: "accepted",
    durationMs: state.diagnostics.durationSince(startedAt),
  }));
  state.ctx.ui.notify(
    "Proposal accepted into the editor. Review and submit it when ready.",
    "info",
  );
  return { outcome: "accepted", reasonCode: "proposal_accepted" };
}

function includedContextCategories(context: PromptImproverContext): string[] {
  const categories: string[] = [];
  if (context.guidance.length > 0) categories.push("loaded project guidance");
  if (context.conversation.length > 0) categories.push("recent conversation");
  if (context.summary) categories.push("available session summary");
  return categories;
}

export function notifyStaleEditor(ctx: CommandContext): void {
  ctx.ui.notify("The session or editor changed. The newer editor state was kept.", "warning");
}
