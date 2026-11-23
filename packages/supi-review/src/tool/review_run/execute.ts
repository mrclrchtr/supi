import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  type AgentRunRegistry,
  createAgentRunProviderAuthority,
} from "@mrclrchtr/supi-agent-runtime/api";
import { StatusSpinner } from "@mrclrchtr/supi-core/status-spinner";
import type { LocalReviewAuditStore } from "../../audit/local-review-audit-store.ts";
import { type ReviewBatchHandle, startReviewBatch } from "../../background/handle.ts";
import type { ReviewBatchOwner } from "../../background/owner.ts";
import { buildBackgroundStartResult } from "../../background/result.ts";
import { loadReviewConfig, type PostReviewPolicy } from "../../config.ts";
import {
  CURRENT_SESSION_REVIEW_MODEL,
  resolveAgentReviewModel,
  resolveRecoveryReviewModel,
} from "../../model.ts";
import type { ReviewArtifactStore } from "../../session/review-artifact-store.ts";
import { resolveReviewThinkingLevel } from "../../thinking.ts";
import { captureReviewerWebTools } from "../../web-access.ts";
import { parseRunReviewToolInput } from "./input-schema.ts";
import { buildRunResult } from "./result.ts";
import { prepareReview, type RunReviewInput, runReview } from "./workflow.ts";

function resolveReviewerModel(
  ctx: Parameters<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>[4],
  configuredModelId: string,
) {
  const reviewer = resolveAgentReviewModel(ctx, configuredModelId);
  if (!reviewer)
    throw new Error(`Configured reviewer model "${configuredModelId}" is unavailable.`);
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

/** Collaborators of the review_run execute function. */
export interface RunReviewExecuteOptions {
  localAuditStore?: LocalReviewAuditStore;
  registry?: AgentRunRegistry;
  /** Current Background Review owner; absent outside a session or without background support. */
  batchOwner?: () => ReviewBatchOwner | undefined;
  events?: Pick<ExtensionAPI["events"], "on" | "emit">;
}

type ToolExecute = NonNullable<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>;
type ToolContext = Parameters<ToolExecute>[4];

/** Inputs of one Background Review start. */
interface BackgroundReviewStart {
  readonly callId: string;
  readonly owner: ReviewBatchOwner | undefined;
  readonly request: RunReviewInput;
  readonly postReviewPolicy: PostReviewPolicy;
  readonly ctx: ToolContext;
}

/**
 * Start a Background Review: run the start boundary in the call, then hand the Reviewer Sessions
 * to the session as one Run Batch and return its handle. Setup failures fail the call and leave
 * no batch and no Review Workspace.
 */
async function startBackgroundReview(start: BackgroundReviewStart) {
  const { callId, owner, ctx } = start;
  if (ctx.mode !== "tui" && ctx.mode !== "rpc")
    throw new Error("Background Review requires TUI or RPC mode.");
  if (!owner?.open(ctx)) throw new Error("The Review session is closed.");
  const launchId = owner.findLaunch(callId, ctx);
  if (!launchId) throw new Error("The background launch is not on the active branch.");
  const prepared = await prepareReview(start.request);
  if (prepared.kind !== "prepared") throw new Error(prepared.reason);
  let handle: ReviewBatchHandle | undefined;
  try {
    await owner.start({
      callId,
      mode: "background",
      launchId,
      data: { postReviewPolicy: start.postReviewPolicy },
      begin: (control) => {
        handle = startReviewBatch(prepared.review, {
          signal: control.signal,
          onTaskResult: (batchId) => control.taskSettled(batchId),
        });
        return { result: Promise.resolve(handle) };
      },
    });
  } catch (error) {
    if (handle) await handle.stop();
    else await prepared.review.workspace.cleanup();
    throw error;
  }
  if (!handle) throw new Error("The Background Review did not start.");
  return buildBackgroundStartResult(handle, prepared.review);
}

/** Resolve configuration and models into one Review request for either mode. */
function buildReviewRequest(
  ctx: ToolContext,
  input: ReturnType<typeof parseRunReviewToolInput>,
  config: ReturnType<typeof loadReviewConfig>,
  options: RunReviewExecuteOptions & { signal?: AbortSignal },
): RunReviewInput {
  const { localAuditStore, registry, signal } = options;
  const events = options.events ?? { on: () => () => {}, emit: () => {} };
  const reviewerThinkingLevel = resolveReviewThinkingLevel(
    config.reviewerThinkingLevel,
    "Reviewer",
  );
  const reviewerModel = resolveReviewerModel(ctx, config.agentModel);
  const auditStore = config.auditEnabled ? localAuditStore : undefined;
  const recoveryModel = resolveRecoveryReviewModel(ctx, config.recoveryModel);
  return {
    cwd: ctx.cwd,
    providerAuthority: createAgentRunProviderAuthority(ctx.modelRegistry),
    target: input.target,
    review: input.review,
    scope: input.scope,
    reviewerModel,
    reviewerThinkingLevel,
    reviewerCodemodeEnabled: config.reviewerCodemodeEnabled,
    reviewerWebTools: captureReviewerWebTools(config.reviewerWebEnabled, events, ctx.cwd),
    ...(recoveryModel ? { recoveryModel } : {}),
    ...(config.recoveryModel !== "disabled" &&
    config.recoveryModel !== CURRENT_SESSION_REVIEW_MODEL &&
    !recoveryModel
      ? { recoveryModelId: config.recoveryModel }
      : {}),
    bootstrapCommand: config.bootstrapCommand,
    projectTrusted: ctx.isProjectTrusted(),
    ...(auditStore ? { auditStore } : {}),
    ...(registry ? { registry } : {}),
    ...(signal ? { signal } : {}),
  };
}

/** Factory for the review_run execute function with animated status-bar spinner. */
export function makeRunReviewExecute(
  artifactStore: ReviewArtifactStore,
  options: RunReviewExecuteOptions = {},
): ToolExecute {
  // biome-ignore lint/complexity/useMaxParams: Pi ToolDefinition execute signature
  return async (callId, params, signal, onUpdate, ctx) => {
    const input = parseRunReviewToolInput(params);
    const config = loadReviewConfig(ctx.cwd);
    const request = buildReviewRequest(ctx, input, config, { ...options, signal });
    if (input.mode === "background") {
      return startBackgroundReview({
        callId,
        owner: options.batchOwner?.(),
        request,
        postReviewPolicy: config.postReviewPolicy,
        ctx,
      });
    }
    const { statusSpinner, wrappedUpdate } = wireSpinnerToProgress(ctx, onUpdate);
    wrappedUpdate({
      content: [{ type: "text", text: "Starting review…" }],
      details: initialReviewProgress(input),
    });
    try {
      const outcome = await runReview({ ...request, onUpdate: wrappedUpdate });
      if (outcome.kind !== "completed") throw new Error(outcome.reason);
      return buildRunResult(artifactStore, outcome, config.postReviewPolicy);
    } finally {
      statusSpinner?.stop();
    }
  };
}
