import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  type ModelRegistry,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import type { ReviewerInvocation, ReviewProgress } from "./runner-types.ts";
import type { ReviewOutputEvent, ReviewResult, ReviewTarget } from "./types.ts";
export type { ReviewerInvocation } from "./runner-types.ts";
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1_000;
const GRACE_TURNS = 3;
const STEER_MESSAGE = "Time limit reached. Wrap up and submit your review now.";
/** Maps tool names to human-readable activity descriptions. */
function toolNameToActivity(name: string, phase: "start" | "end"): string {
  if (phase === "end") return "";
  const map: Record<string, string> = {
    read: "reading",
    grep: "searching",
    find: "finding files",
    ls: "listing files",
    submit_review: "submitting review",
  };
  return map[name] ?? name;
}
function createSubmitReviewTool(resultHolder: {
  value: ReviewOutputEvent | undefined;
}): ReturnType<typeof defineTool> {
  return defineTool({
    name: "submit_review",
    label: "Submit Review",
    description: [
      "Submit the final structured review result.",
      "Call this tool when you have completed your review and are ready to submit the findings.",
    ].join(" "),
    parameters: Type.Object({
      findings: Type.Array(
        Type.Object({
          title: Type.String(),
          body: Type.String(),
          confidence_score: Type.Number(),
          priority: Type.Number(),
          code_location: Type.Object({
            absolute_file_path: Type.String(),
            line_range: Type.Object({
              start: Type.Number(),
              end: Type.Number(),
            }),
          }),
        }),
      ),
      overall_correctness: Type.String(),
      overall_explanation: Type.String(),
      overall_confidence_score: Type.Number(),
    }),
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
function buildReviewerSystemPrompt(): string {
  return [
    "You are a code reviewer. Review the provided code changes carefully and report any issues you find.",
    "You have read-only tools only. Do NOT attempt to edit files or run commands that modify the working tree.",
    "Focus on actionable, specific findings. If the patch is correct, say so clearly.",
    "",
    "Field details: confidence_score (0.0-1.0), priority (0=info 1=minor 2=major 3=critical), line_range (1-based inclusive), overall_correctness ('patch is correct'|'mostly correct'|'patch is incorrect').",
    "Do NOT output JSON directly — use the submit_review tool to submit the result.",
  ].join("\n");
}
async function createReviewerSession(
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is pi's canonical type
  model: import("@mariozechner/pi-ai").Model<any> | undefined,
  cwd: string,
  submitReviewTool: ReturnType<typeof defineTool>,
  modelRegistry?: ModelRegistry,
): Promise<AgentSession> {
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: process.env.PI_CODING_AGENT_DIR || "",
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    appendSystemPrompt: [buildReviewerSystemPrompt()],
  });
  await resourceLoader.reload();
  const { session } = await createAgentSession({
    cwd,
    model,
    modelRegistry,
    tools: ["read", "grep", "find", "ls", "submit_review"],
    customTools: [submitReviewTool],
    resourceLoader,
    sessionManager: SessionManager.inMemory(cwd),
  });
  return session;
}
function extractLastAssistantText(session: AgentSession): string | undefined {
  const messages = session.messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;
    const text = extractAssistantTextContent(msg);
    if (text) return text;
    const errorMsg = extractAssistantErrorMessage(msg);
    if (errorMsg) return errorMsg;
  }
  return undefined;
}
/** Extract non-empty text content from an assistant message (or undefined). */
function extractAssistantTextContent(msg: {
  role: string;
  content: string | Array<{ type: string; text?: string }>;
}): string | undefined {
  if (typeof msg.content === "string") return msg.content || undefined;
  if (!Array.isArray(msg.content)) return undefined;
  const texts = msg.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text);
  if (texts.length > 0 && texts.some((t) => t.length > 0)) return texts.join("\n");
  return undefined;
}
/** Extract errorMessage or stopReason description from a failed assistant message. */
function extractAssistantErrorMessage(msg: unknown): string | undefined {
  const errMsg = (msg as Record<string, unknown>).errorMessage;
  if (typeof errMsg === "string" && errMsg.length > 0) return errMsg;
  const stopReason = (msg as Record<string, unknown>).stopReason;
  if (stopReason === "error") return "Reviewer model returned an error";
  if (stopReason === "aborted") return "Reviewer was aborted";
  return undefined;
}
/** Format token count for display. */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}
interface RunnerContext {
  progress: ReviewProgress;
  session: AgentSession;
  target: ReviewTarget;
  timeoutMs: number;
  onToolActivity: ReviewerInvocation["onToolActivity"];
  onProgress: ReviewerInvocation["onProgress"];
  resolve: (result: ReviewResult) => void;
  cleanup: (result: ReviewResult) => ReviewResult;
  resultHolder: { value: ReviewOutputEvent | undefined };
  signal?: AbortSignal;
  /** Whether the review has already settled (resolved + disposed). */
  state: { settled: boolean };
  timeout: { steered: boolean; graceTurnsRemaining: number | undefined; aborting?: boolean };
}
function emitProgress(ctx: RunnerContext): void {
  try {
    const stats = ctx.session.getSessionStats();
    ctx.progress.tokens = stats?.tokens
      ? {
          input: stats.tokens.input ?? 0,
          output: stats.tokens.output ?? 0,
          total: stats.tokens.total ?? 0,
        }
      : undefined;
  } catch {
    /* Session may not have stats yet */
  }
  ctx.onProgress?.({ ...ctx.progress, activities: [...ctx.progress.activities] });
}
function handleTurnEnd(ctx: RunnerContext): number | undefined {
  ctx.progress.turns++;
  ctx.progress.activities = [];
  if (!ctx.state.settled && ctx.timeout.steered && ctx.timeout.graceTurnsRemaining !== undefined) {
    ctx.timeout.graceTurnsRemaining--;
    if (ctx.timeout.graceTurnsRemaining <= 0) {
      ctx.timeout.aborting = true;
      void ctx.session
        .abort()
        .catch(() => {})
        .finally(() => {
          const partialText = extractLastAssistantText(ctx.session);
          ctx.resolve(
            ctx.cleanup({
              kind: "timeout",
              target: ctx.target,
              timeoutMs: ctx.timeoutMs,
              partialOutput: partialText,
            }),
          );
        });
    }
  }
  emitProgress(ctx);
  return ctx.timeout.graceTurnsRemaining;
}
function handleToolStart(
  event: Extract<AgentSessionEvent, { type: "tool_execution_start" }>,
  ctx: RunnerContext,
): void {
  ctx.progress.toolUses++;
  const activity = toolNameToActivity(event.toolName, "start");
  if (activity) ctx.progress.activities.push(activity);
  ctx.onToolActivity?.({ toolName: event.toolName, phase: "start" });
  ctx.onProgress?.({ ...ctx.progress, activities: [...ctx.progress.activities] });
}
function handleToolEnd(
  event: Extract<AgentSessionEvent, { type: "tool_execution_end" }>,
  ctx: RunnerContext,
): void {
  const startActivity = toolNameToActivity(event.toolName, "start");
  if (startActivity) {
    const idx = ctx.progress.activities.indexOf(startActivity);
    if (idx !== -1) ctx.progress.activities.splice(idx, 1);
  }
  ctx.onToolActivity?.({ toolName: event.toolName, phase: "end" });
  ctx.onProgress?.({ ...ctx.progress, activities: [...ctx.progress.activities] });
}
function handleAgentEnd(ctx: RunnerContext): void {
  if (ctx.state.settled || ctx.signal?.aborted || ctx.timeout.aborting) return;
  if (ctx.resultHolder.value) {
    ctx.resolve(
      ctx.cleanup({ kind: "success", output: ctx.resultHolder.value, target: ctx.target }),
    );
  } else {
    const lastText = extractLastAssistantText(ctx.session);
    ctx.resolve(
      ctx.cleanup({
        kind: "failed",
        reason: lastText
          ? `Reviewer did not call submit_review. Assistant said: ${truncateText(lastText, 400)}`
          : "Reviewer did not produce any output.",
        target: ctx.target,
      }),
    );
  }
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}... (${text.length - maxLen} more chars)`;
}
function handleSessionEvent(event: AgentSessionEvent, ctx: RunnerContext): void {
  switch (event.type) {
    case "turn_end":
      ctx.timeout.graceTurnsRemaining = handleTurnEnd(ctx);
      break;
    case "tool_execution_start":
      handleToolStart(event, ctx);
      break;
    case "tool_execution_end":
      handleToolEnd(event, ctx);
      break;
    case "agent_end":
      handleAgentEnd(ctx);
      break;
    // Ignore other events (queue_update, compaction, auto_retry, etc.)
    default:
      break;
  }
}
export async function runReviewer(inv: ReviewerInvocation): Promise<ReviewResult> {
  const {
    prompt,
    model,
    modelRegistry,
    cwd,
    signal,
    target,
    onToolActivity,
    onProgress,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = inv;
  if (signal?.aborted) {
    return { kind: "canceled", target };
  }
  // Holder for the submit_review tool result
  const resultHolder: { value: ReviewOutputEvent | undefined } = { value: undefined };
  const submitReviewTool = createSubmitReviewTool(resultHolder);
  let session: AgentSession;
  try {
    session = await createReviewerSession(model, cwd, submitReviewTool, modelRegistry);
  } catch (err) {
    const reason = `Failed to create reviewer session: ${err instanceof Error ? err.message : String(err)}`;
    return { kind: "failed" as const, reason, target };
  }
  const progress: ReviewProgress = { turns: 0, toolUses: 0, activities: [], tokens: undefined };
  const state = { settled: false };
  let cancelTeardown: (() => void) | undefined;
  const cleanup = (result: ReviewResult): ReviewResult => {
    if (state.settled) return result;
    state.settled = true;
    cancelTeardown?.();
    session.dispose();
    return result;
  };
  return new Promise<ReviewResult>((resolve) => {
    const timeoutRef = {
      steered: false,
      graceTurnsRemaining: undefined as number | undefined,
      hardAbortTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    };
    const clearHardAbort = () => {
      if (timeoutRef.hardAbortTimer) {
        clearTimeout(timeoutRef.hardAbortTimer);
        timeoutRef.hardAbortTimer = undefined;
      }
    };
    const ctx: RunnerContext = {
      progress,
      session,
      target,
      timeoutMs,
      onToolActivity,
      onProgress,
      resolve,
      cleanup,
      resultHolder,
      signal,
      state,
      timeout: timeoutRef,
    };
    session.subscribe((event: AgentSessionEvent) => handleSessionEvent(event, ctx));
    // --- abort ---
    const onAbort = () => {
      if (state.settled) return;
      clearHardAbort();
      void session
        .abort()
        .catch(() => {})
        .finally(() => {
          resolve(cleanup({ kind: "canceled", target }));
        });
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    // --- timeout ---
    const HARD_ABORT_GRACE_MS = 120_000;
    const hardAbort = () => {
      if (state.settled) return;
      emitProgress(ctx);
      void session
        .abort()
        .catch(() => {})
        .finally(() => {
          const partialText = extractLastAssistantText(session);
          resolve(cleanup({ kind: "timeout", target, timeoutMs, partialOutput: partialText }));
        });
    };
    const onTimeout = () => {
      if (state.settled) return;
      timeoutRef.steered = true;
      timeoutRef.graceTurnsRemaining = GRACE_TURNS;
      timeoutRef.hardAbortTimer = setTimeout(hardAbort, HARD_ABORT_GRACE_MS);
      timeoutRef.hardAbortTimer.unref?.();
      session
        .steer(STEER_MESSAGE)
        .then(() => {
          // Steer succeeded; grace turns tracked via events
        })
        .catch(() => {
          clearHardAbort();
          hardAbort();
        });
    };
    const timeoutId = setTimeout(onTimeout, timeoutMs);
    timeoutId.unref?.();
    cancelTeardown = () => {
      signal?.removeEventListener("abort", onAbort);
      clearTimeout(timeoutId);
      clearHardAbort();
    };
    let cancelledDuringSetup = false;
    if (signal?.aborted) {
      signal.removeEventListener("abort", onAbort);
      cancelledDuringSetup = true;
      onAbort();
    }
    if (!cancelledDuringSetup) {
      session.prompt(prompt).catch((err: unknown) => {
        if (!state.settled) {
          resolve(
            cleanup({
              kind: "failed",
              reason: `Reviewer session error: ${err instanceof Error ? err.message : String(err)}`,
              target,
            }),
          );
        }
      });
    }
  });
}
