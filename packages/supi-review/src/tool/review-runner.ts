import { clampThinkingLevel } from "@earendil-works/pi-ai";
import {
  type AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { RawReviewResult, ReviewInvocation, ReviewOutputEvent } from "../types.ts";
import { createEarlyCancellationDiagnostics } from "./child-failure-diagnostics.ts";
import {
  createSubmitReviewTool,
  handleSessionEvent,
  type RunnerContext,
} from "./review-handlers.ts";
import { buildReviewerSystemPrompt } from "./review-system-prompt.ts";
import { type LifecycleCtx, runWithLifecycle } from "./session-lifecycle.ts";
import { createSnapshotDiffTool, createSnapshotFileTool } from "./snapshot-tools.ts";

const DEFAULT_TIMEOUT_MS = 60 * 60 * 1_000;
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
    noExtensions: true,
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
    thinkingLevel: clampThinkingLevel(invocation.model.model, "max"),
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
    kind: "timeout",
    snapshot: runner.invocation.snapshot,
    timeoutMs: runner.invocation.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    brief: runner.invocation.brief,
    modelId: runner.invocation.model.canonicalId,
    diagnostics: lcCtx.getFailureDiagnostics(),
  };
}

function buildCanceledResult(
  lcCtx: LifecycleCtx<RawReviewResult>,
  runner: ReviewerRunnerState,
): RawReviewResult {
  return {
    kind: "canceled",
    snapshot: runner.invocation.snapshot,
    brief: runner.invocation.brief,
    modelId: runner.invocation.model.canonicalId,
    diagnostics: lcCtx.getFailureDiagnostics(),
  };
}

function buildFailedResult(
  failureCode: "prompt-rejected" | "unexpected-runner-failure",
  lcCtx: LifecycleCtx<RawReviewResult>,
  runner: ReviewerRunnerState,
): RawReviewResult {
  return {
    kind: "failed",
    failureCode,
    snapshot: runner.invocation.snapshot,
    brief: runner.invocation.brief,
    modelId: runner.invocation.model.canonicalId,
    diagnostics: lcCtx.getFailureDiagnostics(),
  };
}

interface ReviewerRunnerState {
  resultHolder: { value: ReviewOutputEvent | undefined };
  invocation: ReviewInvocation;
  submitSteered: boolean;
  timeoutSteered: boolean;
  graceTurnsRemaining: number | undefined;
}

// ---------------------------------------------------------------------------
// Steer / abort helpers
// ---------------------------------------------------------------------------

/** Abort the session and resolve with a timeout result from the lifecycle context. */
function doFinalAbortFromLifecycle(
  lcCtx: LifecycleCtx<RawReviewResult>,
  runner: ReviewerRunnerState,
): void {
  if (lcCtx.state.settled || lcCtx.state.aborting) return;

  lcCtx.state.aborting = true;
  lcCtx.recordHostMarker({ type: "abort_requested", reason: "timeout" });
  void lcCtx.session
    .abort()
    .catch(() => {})
    .finally(() => {
      lcCtx.resolve(
        lcCtx.cleanup({
          kind: "timeout",
          snapshot: runner.invocation.snapshot,
          timeoutMs: runner.invocation.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          brief: runner.invocation.brief,
          modelId: runner.invocation.model.canonicalId,
          diagnostics: lcCtx.getFailureDiagnostics(),
        }),
      );
    });
}

/**
 * Build the custom soft-timeout behavior for reviewer sessions.
 *
 * The shared lifecycle runner records `timeout_expired`; this runner adds a
 * timeout steering marker and later records the hard-abort marker if needed.
 */
function buildReviewTimeoutHandler(
  runner: ReviewerRunnerState,
  lcCtx: LifecycleCtx<RawReviewResult>,
): void {
  runner.timeoutSteered = true;
  runner.graceTurnsRemaining = GRACE_TURNS;
  lcCtx.recordHostMarker({ type: "steer_requested", reason: "timeout" });

  const hardAbortTimer = setTimeout(() => {
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
  ctx.toolCounts = {};
  ctx.inspectedFiles = new Set();
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
  ctx.startTime = lcCtx.startTime;
  ctx.getFailureDiagnostics = lcCtx.getFailureDiagnostics;
  ctx.recordHostMarker = lcCtx.recordHostMarker;
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
      diagnostics: createEarlyCancellationDiagnostics(),
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
  } catch {
    return {
      kind: "failed",
      failureCode: "session-creation-failed",
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
    failedResult: (failureCode, lcCtx) => buildFailedResult(failureCode, lcCtx, runner),
    timeoutResult: (_, lcCtx) => buildTimeoutResult(lcCtx, runner),
  });
}
