import type { Api, Model } from "@earendil-works/pi-ai";
import {
  type AskUserOutcome,
  type NormalizedQuestionnaire,
  openAskUserForm,
} from "@mrclrchtr/supi-ask-user/api";
import { countCodePoints, promptImproverContextCounts } from "./context.ts";
import { capturePromptImproverError, type PromptImproverDiagnostics } from "./diagnostics.ts";
import {
  type CommandContext,
  canRun,
  captureOwnership,
  capturePromptContext,
  collectDraft,
  ownershipFailureReason,
  transferConfirmedDraft,
} from "./draft.ts";
import { improveDraft, ProviderRequestError, RequestCancelledError } from "./model-request.ts";
import { notifyStaleEditor, reviewAndApply } from "./proposal-review.ts";
import type { RunResult, WorkflowState } from "./workflow-types.ts";

interface RunOptions {
  args: string;
  ctx: CommandContext;
  model: Model<Api>;
  modelId: string;
  controller: AbortController;
  diagnostics: PromptImproverDiagnostics;
}

type ClarificationFormResult =
  | { kind: "answered"; value: AskUserOutcome }
  | { kind: "cancelled"; reasonCode: string }
  | { kind: "failed" };

/** Run the local draft, model request, clarification, and proposal screens. */
export async function runPromptImprover(options: RunOptions): Promise<void> {
  if (!canRun(options.ctx)) {
    options.ctx.ui.notify(
      "Prompt improvement needs an idle TUI session with no pending work.",
      "warning",
    );
    options.diagnostics.record(
      "invocation",
      "warning",
      "Prompt improvement invocation rejected",
      () => ({ outcome: "rejected", reasonCode: "workflow_not_idle" }),
    );
    options.diagnostics.finish("rejected", "workflow_not_idle");
    return;
  }
  const result = await runConfirmedWorkflow(options);
  options.diagnostics.finish(result.outcome, result.reasonCode);
}

async function runConfirmedWorkflow(options: RunOptions): Promise<RunResult> {
  const { args, ctx, model, modelId, controller, diagnostics } = options;
  const ownership = captureOwnership(ctx);
  const local = await collectDraft({ ctx, args, signal: controller.signal, modelId, diagnostics });
  if (!local) return { outcome: "failed", reasonCode: "draft_editor_failed" };
  if (local.kind !== "confirmed") {
    const reasonCode = controller.signal.aborted ? "lifecycle_cancelled" : "draft_input_cancelled";
    diagnostics.record("draft", "info", "Prompt draft input cancelled", () => ({
      outcome: "cancelled",
      reasonCode,
    }));
    return { outcome: "cancelled", reasonCode };
  }

  diagnostics.record("draft.confirmed", "info", "Prompt draft confirmed", () => ({
    outcome: "confirmed",
    draft: local.text,
    draftCodePoints: countCodePoints(local.text),
  }));
  if (controller.signal.aborted) return { outcome: "cancelled", reasonCode: "lifecycle_cancelled" };

  const transfer = transferConfirmedDraft(ctx, ownership, local.text);
  if (transfer.kind === "rejected")
    return handleDraftRejection(ctx, diagnostics, local.text, transfer);

  const background = capturePromptContext(ctx, diagnostics);
  if (!background) return { outcome: "failed", reasonCode: "loaded_context_unavailable" };
  diagnostics.record("context.snapshot", "info", "Prompt improvement context captured", () => ({
    outcome: "captured",
    background,
    counts: promptImproverContextCounts(background),
  }));
  return improveConfirmedDraft({
    ctx,
    model,
    modelId,
    draft: transfer.draft,
    background,
    ownership,
    controller,
    diagnostics,
  });
}

function handleDraftRejection(
  ctx: CommandContext,
  diagnostics: PromptImproverDiagnostics,
  draft: string,
  transfer: Extract<ReturnType<typeof transferConfirmedDraft>, { kind: "rejected" }>,
): RunResult {
  diagnostics.record("draft.rejected", "warning", "Confirmed prompt draft was rejected", () => ({
    outcome: "rejected",
    reasonCode: transfer.reasonCode,
    draftCodePoints: countCodePoints(draft),
  }));
  if (isOwnershipRejection(transfer.reasonCode)) {
    notifyStaleEditor(ctx);
    return { outcome: "stale", reasonCode: transfer.reasonCode };
  }
  if (transfer.message) ctx.ui.notify(transfer.message, "warning");
  return { outcome: "rejected", reasonCode: transfer.reasonCode };
}

function isOwnershipRejection(reasonCode: string): boolean {
  return [
    "session_changed",
    "branch_changed",
    "editor_changed",
    "agent_busy",
    "pending_messages",
  ].includes(reasonCode);
}

async function improveConfirmedDraft(state: WorkflowState): Promise<RunResult> {
  try {
    const result = await improveDraft({
      ...state,
      askForClarification: async (questionnaire) => {
        assertCurrent(state, "assessment");
        const form = await askForClarification(state, questionnaire);
        if (form.kind === "cancelled") {
          throw new WorkflowStopped({ outcome: "cancelled", reasonCode: form.reasonCode });
        }
        if (form.kind === "failed") {
          throw new WorkflowStopped({ outcome: "failed", reasonCode: "clarification_form_failed" });
        }
        assertCurrent(state, "clarification");
        return form.value;
      },
    });
    assertCurrent(state, "proposal");
    if (result.kind === "unchanged") {
      state.ctx.ui.notify("The draft does not need a change.", "info");
      return { outcome: "unchanged", reasonCode: "draft_unchanged" };
    }
    return reviewAndApply(state, { proposal: result.proposal, context: result.selectedContext });
  } catch (error) {
    if (error instanceof WorkflowStopped) return error.result;
    notifyFailure(state.ctx, error);
    return requestFailureResult(state.controller, error);
  }
}

async function askForClarification(
  state: WorkflowState,
  questionnaire: NormalizedQuestionnaire,
): Promise<ClarificationFormResult> {
  state.diagnostics.record(
    "clarification.questions",
    "info",
    "Prompt clarification questions shown",
    () => ({
      outcome: "presented",
      questionnaire,
      questionCount: questionnaire.questions.length,
    }),
  );
  try {
    const outcome = await openAskUserForm(questionnaire, {
      ui: state.ctx.ui,
      overlay: true,
      signal: state.controller.signal,
      onToggleToolsExpanded: () => state.ctx.ui.setToolsExpanded(!state.ctx.ui.getToolsExpanded()),
    });
    return recordClarificationResult(state, questionnaire, outcome);
  } catch (error) {
    state.diagnostics.record(
      "clarification.failed",
      "error",
      "Prompt clarification form failed",
      () => ({
        outcome: "failed",
        reasonCode: "clarification_form_failed",
        ...capturePromptImproverError(error),
      }),
    );
    state.ctx.ui.notify(
      "The clarification form could not open. The confirmed draft was kept.",
      "error",
    );
    return { kind: "failed" };
  }
}

function recordClarificationResult(
  state: WorkflowState,
  questionnaire: NormalizedQuestionnaire,
  outcome: Awaited<ReturnType<typeof openAskUserForm>>,
): ClarificationFormResult {
  if ("kind" in outcome) {
    const reasonCode = state.controller.signal.aborted
      ? "lifecycle_cancelled"
      : "clarification_cancelled";
    state.diagnostics.record(
      "clarification.result",
      "info",
      "Prompt clarification was cancelled",
      () => ({
        outcome: "cancelled",
        reasonCode,
        questionnaire,
      }),
    );
    return { kind: "cancelled", reasonCode };
  }
  state.diagnostics.record(
    "clarification.result",
    "info",
    "Prompt clarification answers submitted",
    () => ({
      outcome: "submitted",
      questionnaire,
      answers: outcome,
    }),
  );
  return { kind: "answered", value: outcome };
}

function assertCurrent(state: WorkflowState, stage: string): void {
  if (state.controller.signal.aborted) {
    throw new WorkflowStopped({ outcome: "cancelled", reasonCode: "lifecycle_cancelled" });
  }
  const reasonCode = ownershipFailureReason(state.ctx, state.ownership, state.draft);
  if (!reasonCode) return;
  state.diagnostics.record(
    "ownership.rejected",
    "warning",
    "Prompt improvement ownership check failed",
    () => ({ outcome: "stale", reasonCode, stage }),
  );
  notifyStaleEditor(state.ctx);
  throw new WorkflowStopped({ outcome: "stale", reasonCode });
}

/** Carry a handled UI or ownership exit through the model's clarification callback. */
class WorkflowStopped extends Error {
  constructor(readonly result: RunResult) {
    super(result.reasonCode);
    this.name = "PromptImproverWorkflowStopped";
  }
}

function requestFailureResult(controller: AbortController, error: unknown): RunResult {
  if (error instanceof RequestCancelledError || controller.signal.aborted) {
    return { outcome: "cancelled", reasonCode: "request_cancelled" };
  }
  if (error instanceof ProviderRequestError)
    return { outcome: "failed", reasonCode: "provider_error" };
  return { outcome: "failed", reasonCode: "response_rejected" };
}

function notifyFailure(ctx: CommandContext, error: unknown): void {
  if (error instanceof RequestCancelledError || ctx.signal?.aborted) return;
  const message =
    error instanceof ProviderRequestError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Prompt improvement failed. The confirmed draft was kept.";
  ctx.ui.notify(message, "error");
}
