import {
  type AgentSession,
  type AgentSessionEvent,
  defineTool,
} from "@earendil-works/pi-coding-agent";
import type {
  RawReviewResult,
  ReviewInvocation,
  ReviewOutputEvent,
  ReviewProgress,
} from "../types.ts";
import {
  buildFailureDebug,
  extractLastAssistantDebug,
  pushRecentEvent,
  summarizeSessionEvent,
} from "./review-debug.ts";
import { buildProgressTokens } from "./runner-helpers.ts";
import { reviewOutputSchema } from "./schemas.ts";

const STEER_SUBMIT_MESSAGE =
  "You stopped without calling submit_review. Call submit_review now with your findings.";
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Runner-specific context combining lifecycle-managed fields with
// runner-private mutable state.
// ---------------------------------------------------------------------------
export interface RunnerContext {
  progress: ReviewProgress;
  session: AgentSession;
  resolve: (result: RawReviewResult) => void;
  cleanup: (result: RawReviewResult) => RawReviewResult;
  state: { settled: boolean; aborting: boolean };
  resultHolder: { value: ReviewOutputEvent | undefined };
  invocation: ReviewInvocation;
  submitSteered: boolean;
  timeoutSteered: boolean;
  graceTurnsRemaining: number | undefined;
  debug: { recentEvents: string[] };
}

// ---------------------------------------------------------------------------
// Tool and progress helpers
// ---------------------------------------------------------------------------

/** Maps tool names to human-readable activity descriptions. */
function toolNameToActivity(name: string, phase: "start" | "end"): string {
  if (phase === "end") return "";
  const map: Record<string, string> = {
    read: "reading",
    grep: "searching",
    find: "finding files",
    ls: "listing files",
    submit_review: "submitting review",
    read_snapshot_diff: "reading diff",
    read_snapshot_file: "reading file",
  };
  return map[name] ?? name;
}

export function createSubmitReviewTool(resultHolder: {
  value: ReviewOutputEvent | undefined;
}): ReturnType<typeof defineTool> {
  return defineTool({
    name: "submit_review",
    label: "Submit Review",
    description:
      "Submit the final structured review result after you finish investigating the changes.",
    parameters: reviewOutputSchema,
    execute: async (_toolCallId, args) => {
      resultHolder.value = args as ReviewOutputEvent;
      return {
        content: [{ type: "text" as const, text: "Review submitted successfully." }],
        details: args,
        terminate: true,
      };
    },
  });
}

export function emitProgress(ctx: RunnerContext): void {
  ctx.progress.tokens = buildProgressTokens(() => ctx.session.getSessionStats());
  ctx.invocation.onProgress?.({ ...ctx.progress, activities: [...ctx.progress.activities] });
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

export function handleTurnEnd(ctx: RunnerContext): void {
  ctx.progress.turns++;
  ctx.progress.activities = [];

  if (!ctx.state.settled && ctx.timeoutSteered && ctx.graceTurnsRemaining !== undefined) {
    ctx.graceTurnsRemaining--;
    if (ctx.graceTurnsRemaining <= 0) {
      ctx.state.aborting = true;
      doFinalAbort(ctx);
    }
  }

  emitProgress(ctx);
}

export function handleToolStart(
  event: Extract<AgentSessionEvent, { type: "tool_execution_start" }>,
  ctx: RunnerContext,
): void {
  ctx.progress.toolUses++;
  const activity = toolNameToActivity(event.toolName, "start");
  if (activity) ctx.progress.activities.push(activity);
  ctx.invocation.onToolActivity?.({ toolName: event.toolName, phase: "start" });
  emitProgress(ctx);
}

export function handleToolEnd(
  event: Extract<AgentSessionEvent, { type: "tool_execution_end" }>,
  ctx: RunnerContext,
): void {
  const activity = toolNameToActivity(event.toolName, "start");
  if (activity) {
    const index = ctx.progress.activities.indexOf(activity);
    if (index !== -1) ctx.progress.activities.splice(index, 1);
  }
  ctx.invocation.onToolActivity?.({ toolName: event.toolName, phase: "end" });
  emitProgress(ctx);
}

export function handleMessageEnd(
  event: Extract<AgentSessionEvent, { type: "message_end" }>,
  ctx: RunnerContext,
): void {
  if (ctx.state.settled || ctx.submitSteered || ctx.resultHolder.value) return;

  const msg = event.message as { role?: string; stopReason?: string };
  if (msg.role !== "assistant" || msg.stopReason !== "stop") return;

  ctx.submitSteered = true;
  ctx.session.steer(STEER_SUBMIT_MESSAGE).catch(() => {});
}

export function handleAgentEnd(
  event: Extract<AgentSessionEvent, { type: "agent_end" }>,
  ctx: RunnerContext,
): void {
  if (ctx.state.settled || ctx.state.aborting) return;
  const retryAwareEvent = event as typeof event & { willRetry?: boolean };
  if (retryAwareEvent.willRetry) return;

  if (ctx.resultHolder.value) {
    ctx.resolve(
      ctx.cleanup({
        kind: "success",
        output: ctx.resultHolder.value,
        snapshot: ctx.invocation.snapshot,
        brief: ctx.invocation.brief,
        modelId: ctx.invocation.model.canonicalId,
      }),
    );
    return;
  }

  const lastText = extractLastAssistantDebug(ctx.session)?.text;
  ctx.resolve(
    ctx.cleanup({
      kind: "failed",
      reason: lastText
        ? `Reviewer did not call submit_review. Assistant said: ${truncateText(lastText, 400)}`
        : "Reviewer did not produce any output.",
      snapshot: ctx.invocation.snapshot,
      brief: ctx.invocation.brief,
      modelId: ctx.invocation.model.canonicalId,
      debug: buildFailureDebug({
        progress: ctx.progress,
        session: ctx.session,
        recentEvents: ctx.debug.recentEvents,
      }),
    }),
  );
}

export function handleSessionEvent(event: AgentSessionEvent, ctx: RunnerContext): void {
  pushRecentEvent(ctx.debug.recentEvents, summarizeSessionEvent(event));

  switch (event.type) {
    case "turn_end":
      handleTurnEnd(ctx);
      break;
    case "tool_execution_start":
      handleToolStart(event, ctx);
      break;
    case "tool_execution_end":
      handleToolEnd(event, ctx);
      break;
    case "message_end": {
      handleMessageEnd(event, ctx);
      break;
    }
    case "agent_end":
      handleAgentEnd(event, ctx);
      break;
    default:
      break;
  }
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}... (${text.length - maxLen} more chars)`;
}

// ---------------------------------------------------------------------------
// Hard-abort helper (called from handleTurnEnd when grace turns expire)
// ---------------------------------------------------------------------------

function doFinalAbort(ctx: RunnerContext): void {
  emitProgress(ctx);
  void ctx.session
    .abort()
    .catch(() => {})
    .finally(() => {
      const partialText = extractLastAssistantDebug(ctx.session)?.text;
      ctx.resolve(
        ctx.cleanup({
          kind: "timeout" as const,
          snapshot: ctx.invocation.snapshot,
          timeoutMs: ctx.invocation.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          partialOutput: partialText,
          brief: ctx.invocation.brief,
          modelId: ctx.invocation.model.canonicalId,
          debug: buildFailureDebug({
            progress: ctx.progress,
            session: ctx.session,
            recentEvents: ctx.debug.recentEvents,
          }),
        }),
      );
    });
}
