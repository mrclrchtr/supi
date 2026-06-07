import { clampThinkingLevel } from "@earendil-works/pi-ai";
import {
  type AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { RawReviewResult, ReviewOutputEvent } from "../types.ts";
import { buildFailureDebug, extractLastAssistantText } from "./review-debug.ts";
import {
  createSubmitReviewTool,
  handleSessionEvent,
  type RunnerContext,
} from "./review-handlers.ts";
import { buildReviewerSystemPrompt } from "./review-system-prompt.ts";
import type { ReviewInvocation } from "./runner-types.ts";
import { type LifecycleCtx, runWithLifecycle } from "./session-lifecycle.ts";
import { createSnapshotDiffTool, createSnapshotFileTool } from "./snapshot-tools.ts";

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1_000;
const GRACE_TURNS = 3;
const STEER_MESSAGE = "Time limit reached. Wrap up and submit your review now.";
const HARD_ABORT_GRACE_MS = 120_000;

async function createReviewerSession(
  invocation: ReviewInvocation,
  submitReviewTool: ReturnType<typeof createSubmitReviewTool>,
  snapshotDiffTool: ReturnType<typeof createSnapshotDiffTool>,
  snapshotFileTool: ReturnType<typeof createSnapshotFileTool>,
): Promise<AgentSession> {
  const resourceLoader = new DefaultResourceLoader({
    cwd: invocation.cwd,
    agentDir: process.env.PI_CODING_AGENT_DIR || "",
    noExtensions: false,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: false,
    appendSystemPrompt: [buildReviewerSystemPrompt()],
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: invocation.cwd,
    model: invocation.model.model,
    modelRegistry: invocation.modelRegistry,
    thinkingLevel: clampThinkingLevel(invocation.model.model, "xhigh"),
    tools: [
      "read",
      "grep",
      "find",
      "ls",
      "submit_review",
      "read_snapshot_diff",
      "read_snapshot_file",
    ],
    customTools: [submitReviewTool, snapshotDiffTool, snapshotFileTool],
    resourceLoader,
    sessionManager: SessionManager.inMemory(invocation.cwd),
  });

  return session;
}

// ---------------------------------------------------------------------------
// Result factories (need RunnerContext built at abort/timeout time)
// ---------------------------------------------------------------------------

function buildTimeoutResult(
  lcCtx: LifecycleCtx<RawReviewResult>,
  runner: ReviewerRunnerState,
): RawReviewResult {
  return {
    kind: "timeout" as const,
    snapshot: runner.invocation.snapshot,
    timeoutMs: runner.invocation.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    brief: runner.invocation.brief,
    modelId: runner.invocation.model.canonicalId,
    debug: buildFailureDebug({
      progress: lcCtx.progress,
      session: lcCtx.session,
      recentEvents: runner.debug.recentEvents,
    }),
  };
}

function buildCanceledResult(
  lcCtx: LifecycleCtx<RawReviewResult>,
  runner: ReviewerRunnerState,
): RawReviewResult {
  return {
    kind: "canceled" as const,
    snapshot: runner.invocation.snapshot,
    brief: runner.invocation.brief,
    modelId: runner.invocation.model.canonicalId,
    debug: buildFailureDebug({
      progress: lcCtx.progress,
      session: lcCtx.session,
      recentEvents: runner.debug.recentEvents,
    }),
  };
}

function buildFailedResult(
  reason: string,
  lcCtx: LifecycleCtx<RawReviewResult>,
  runner: ReviewerRunnerState,
): RawReviewResult {
  return {
    kind: "failed" as const,
    reason,
    snapshot: runner.invocation.snapshot,
    brief: runner.invocation.brief,
    modelId: runner.invocation.model.canonicalId,
    debug: buildFailureDebug({
      progress: lcCtx.progress,
      session: lcCtx.session,
      recentEvents: runner.debug.recentEvents,
    }),
  };
}

interface ReviewerRunnerState {
  resultHolder: { value: ReviewOutputEvent | undefined };
  invocation: ReviewInvocation;
  submitSteered: boolean;
  timeoutSteered: boolean;
  graceTurnsRemaining: number | undefined;
  debug: { recentEvents: string[] };
}

// ---------------------------------------------------------------------------
// Steer / abort helpers
// ---------------------------------------------------------------------------

/** Abort the session and resolve with a timeout result (from lifecycle context). */
function doFinalAbortFromLifecycle(
  lcCtx: LifecycleCtx<RawReviewResult>,
  runner: ReviewerRunnerState,
): void {
  lcCtx.state.aborting = true;
  void lcCtx.session
    .abort()
    .catch(() => {})
    .finally(() => {
      const partialText = extractLastAssistantText(lcCtx.session);
      lcCtx.resolve(
        lcCtx.cleanup({
          kind: "timeout" as const,
          snapshot: runner.invocation.snapshot,
          timeoutMs: runner.invocation.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          partialOutput: partialText,
          brief: runner.invocation.brief,
          modelId: runner.invocation.model.canonicalId,
          debug: buildFailureDebug({
            progress: lcCtx.progress,
            session: lcCtx.session,
            recentEvents: runner.debug.recentEvents,
          }),
        }),
      );
    });
}

/**
 * Build the custom `onTimeout` handler for the review runner.
 *
 * When the soft timeout fires, the handler:
 * 1. Steers the reviewer session to wrap up
 * 2. Starts a grace timer (hard abort after GRACE_TURNS or HARD_ABORT_GRACE_MS)
 * 3. If steer fails, immediately hard-aborts
 */
function buildReviewTimeoutHandler(
  runner: ReviewerRunnerState,
  lcCtx: LifecycleCtx<RawReviewResult>,
): void {
  runner.timeoutSteered = true;
  runner.graceTurnsRemaining = GRACE_TURNS;

  const hardAbortTimer = setTimeout(() => {
    if (lcCtx.state.settled) return;
    doFinalAbortFromLifecycle(lcCtx, runner);
  }, HARD_ABORT_GRACE_MS);
  hardAbortTimer.unref?.();
  lcCtx.addTeardown(() => clearTimeout(hardAbortTimer));

  lcCtx.session.steer(STEER_MESSAGE).catch(() => {
    clearTimeout(hardAbortTimer);
    doFinalAbortFromLifecycle(lcCtx, runner);
  });
}

// ---------------------------------------------------------------------------
// Context sync helpers
// ---------------------------------------------------------------------------

function buildRunnerCtx(runner: ReviewerRunnerState): RunnerContext {
  const ctx = {} as RunnerContext;
  ctx.resultHolder = runner.resultHolder;
  ctx.invocation = runner.invocation;
  ctx.submitSteered = runner.submitSteered;
  ctx.timeoutSteered = runner.timeoutSteered;
  ctx.graceTurnsRemaining = runner.graceTurnsRemaining;
  ctx.debug = runner.debug;
  return ctx;
}

function syncCtxFromLifecycle(
  ctx: RunnerContext,
  lcCtx: LifecycleCtx<RawReviewResult>,
  runner: ReviewerRunnerState,
): void {
  ctx.progress = lcCtx.progress;
  ctx.session = lcCtx.session;
  ctx.resolve = lcCtx.resolve;
  ctx.cleanup = lcCtx.cleanup;
  ctx.state = lcCtx.state;
  ctx.submitSteered = runner.submitSteered;
  ctx.timeoutSteered = runner.timeoutSteered;
  ctx.graceTurnsRemaining = runner.graceTurnsRemaining;
}

function syncRunnerFromCtx(ctx: RunnerContext, runner: ReviewerRunnerState): void {
  runner.submitSteered = ctx.submitSteered;
  runner.timeoutSteered = ctx.timeoutSteered;
  runner.graceTurnsRemaining = ctx.graceTurnsRemaining;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Run the read-only reviewer child session. */
export async function runReviewer(invocation: ReviewInvocation): Promise<RawReviewResult> {
  if (invocation.signal?.aborted) {
    return {
      kind: "canceled",
      snapshot: invocation.snapshot,
      brief: invocation.brief,
      modelId: invocation.model.canonicalId,
    };
  }

  const resultHolder: { value: ReviewOutputEvent | undefined } = { value: undefined };
  const submitReviewTool = createSubmitReviewTool(resultHolder);
  const snapshotDiffTool = createSnapshotDiffTool(invocation.cwd, invocation.snapshot);
  const snapshotFileTool = createSnapshotFileTool(invocation.cwd, invocation.snapshot);

  let session: AgentSession;
  try {
    session = await createReviewerSession(
      invocation,
      submitReviewTool,
      snapshotDiffTool,
      snapshotFileTool,
    );
  } catch (error) {
    return {
      kind: "failed",
      reason: `Failed to create reviewer session: ${error instanceof Error ? error.message : String(error)}`,
      snapshot: invocation.snapshot,
      brief: invocation.brief,
      modelId: invocation.model.canonicalId,
    };
  }

  const runner: ReviewerRunnerState = {
    resultHolder,
    invocation,
    submitSteered: false,
    timeoutSteered: false,
    graceTurnsRemaining: undefined,
    debug: { recentEvents: [] },
  };

  const ctx = buildRunnerCtx(runner);

  return runWithLifecycle<RawReviewResult>({
    session,
    prompt: invocation.prompt,
    signal: invocation.signal,
    timeoutMs: invocation.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    onEvent: (event, lcCtx) => {
      syncCtxFromLifecycle(ctx, lcCtx, runner);
      handleSessionEvent(event, ctx);
      syncRunnerFromCtx(ctx, runner);
    },
    onTimeout: (lcCtx) => buildReviewTimeoutHandler(runner, lcCtx),
    canceledResult: (lcCtx) => buildCanceledResult(lcCtx, runner),
    failedResult: (reason, lcCtx) => buildFailedResult(reason, lcCtx, runner),
    timeoutResult: (_, lcCtx) => buildTimeoutResult(lcCtx, runner),
  });
}
