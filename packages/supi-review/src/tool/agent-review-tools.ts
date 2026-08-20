import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createAgentRunProviderAuthority } from "@mrclrchtr/supi-agent-runtime/api";
import { StatusSpinner } from "@mrclrchtr/supi-core/status-spinner";
import type { LocalReviewAuditStore } from "../audit/local-review-audit-store.ts";
import { loadReviewConfig } from "../config.ts";
import {
  CURRENT_SESSION_REVIEW_MODEL,
  resolveAgentReviewModel,
  resolveRecoveryReviewModel,
} from "../model.ts";
import type { ReviewArtifactStore } from "../session/review-artifact-store.ts";
import { renderRunCall, renderRunResult } from "../tui/run.ts";
import { parseRunReviewToolInput } from "./agent-review-schemas.ts";
import { createReviewOutput, MAX_PAGE_CHARACTERS, MAX_PAGE_LINES } from "./output-page.ts";
import { withPostReviewInstruction } from "./post-review-policy.ts";
import { formatReviewBatch } from "./review-format.ts";
import { runReview } from "./review-workflow.ts";
import { REVIEW_TOOL_SPECS } from "./tool-specs.ts";

const POST_REVIEW_POLICY_CHARACTER_RESERVE = 4_000;
const POST_REVIEW_POLICY_LINE_RESERVE = 32;

export { formatReviewBatch } from "./review-format.ts";

function resolveReviewerModel(
  ctx: Parameters<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>[4],
) {
  const config = loadReviewConfig(ctx.cwd);
  const reviewer = resolveAgentReviewModel(ctx, config.agentModel);
  if (!reviewer)
    throw new Error(`Configured reviewer model "${config.agentModel}" is unavailable.`);
  return reviewer;
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
): {
  statusSpinner?: StatusSpinner;
  wrappedUpdate: (result: {
    content: Array<{ type: "text"; text: string }>;
    details: Record<string, unknown>;
  }) => void;
} {
  const statusSpinner = ctx.hasUI ? new StatusSpinner(ctx, "supi-review") : undefined;
  statusSpinner?.start("Reviewing…");

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
    statusSpinner?.update(label);
    onUpdate?.(result);
  };
  return { statusSpinner, wrappedUpdate };
}

function initialReviewProgress(input: ReturnType<typeof parseRunReviewToolInput>) {
  const { review, scope } = input;
  return {
    completedCount: 0,
    totalCount: review.tasks.length,
    ...(review.sharedContext ? { sharedContext: review.sharedContext } : {}),
    ...(scope.paths?.length ? { scope } : {}),
    tasks: review.tasks,
    taskIds: review.tasks.map((task) => task.id),
  };
}

/** Factory for the review_run execute function with animated status-bar spinner. */
function makeRunReviewExecute(
  artifactStore: ReviewArtifactStore,
  localAuditStore?: LocalReviewAuditStore,
): NonNullable<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]> {
  // biome-ignore lint/complexity/useMaxParams: Pi ToolDefinition execute signature
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: tool execution keeps spinner and bounded output cleanup in one closure.
  return async (_id, params, signal, onUpdate, ctx) => {
    const input = parseRunReviewToolInput(params);
    const config = loadReviewConfig(ctx.cwd);
    const auditStore = config.auditEnabled ? localAuditStore : undefined;
    const { statusSpinner, wrappedUpdate } = wireSpinnerToProgress(ctx, onUpdate);

    wrappedUpdate({
      content: [{ type: "text", text: "Starting review…" }],
      details: initialReviewProgress(input),
    });

    try {
      const recoveryModel = resolveRecoveryReviewModel(ctx, config.recoveryModel);
      const outcome = await runReview({
        cwd: ctx.cwd,
        providerAuthority: createAgentRunProviderAuthority(ctx.modelRegistry),
        target: input.target,
        review: input.review,
        scope: input.scope,
        reviewerModel: resolveReviewerModel(ctx),
        ...(recoveryModel ? { recoveryModel } : {}),
        ...(config.recoveryModel !== "disabled" &&
        config.recoveryModel !== CURRENT_SESSION_REVIEW_MODEL &&
        !recoveryModel
          ? { recoveryModelId: config.recoveryModel }
          : {}),
        bootstrapCommand: config.bootstrapCommand,
        projectTrusted: ctx.isProjectTrusted(),
        ...(auditStore ? { auditStore } : {}),
        signal,
        onUpdate: wrappedUpdate,
      });
      if (outcome.kind !== "completed") throw new Error(outcome.reason);
      const hasFindings = outcome.details.results.some(
        (result) => result.status === "completed" && result.findings.length > 0,
      );
      const output = createReviewOutput(
        artifactStore,
        formatReviewBatch(outcome.details),
        hasFindings
          ? {
              firstPageCharacters: MAX_PAGE_CHARACTERS - POST_REVIEW_POLICY_CHARACTER_RESERVE,
              firstPageLines: MAX_PAGE_LINES - POST_REVIEW_POLICY_LINE_RESERVE,
            }
          : {},
      );
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
      statusSpinner?.stop();
    }
  };
}

/** Register caller-defined Review execution for agents. */
export function registerAgentReviewTools(
  pi: ExtensionAPI,
  artifactStore: ReviewArtifactStore,
  localAuditStore?: LocalReviewAuditStore,
): void {
  pi.registerTool({
    ...REVIEW_TOOL_SPECS.run,
    promptGuidelines: [...REVIEW_TOOL_SPECS.run.promptGuidelines],
    renderCall: renderRunCall,
    renderResult: renderRunResult,
    execute: makeRunReviewExecute(artifactStore, localAuditStore),
  });
}
