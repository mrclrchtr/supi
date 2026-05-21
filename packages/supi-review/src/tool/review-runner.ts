// biome-ignore lint/nursery/noExcessiveLinesPerFile: runner wires session lifecycle, timeout handling, and tool submission
import { clampThinkingLevel } from "@earendil-works/pi-ai";
import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { ReviewOutputEvent, ReviewResult } from "../types.ts";
import type { ReviewInvocation, ReviewProgress } from "./runner-types.ts";
import { reviewOutputSchema } from "./schemas.ts";

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

/** Build the reviewer system prompt used by the read-only child session. */
export function buildReviewerSystemPrompt(): string {
  return [
    "You are a rigorous code reviewer.",
    "The review task already includes session-derived intent and a concrete code snapshot.",
    "Use the prompt packet as the primary brief, then inspect files with the available read-only tools before drawing conclusions.",
    "",
    "--- Guardrails ---",
    "- You have read-only tools only. Do NOT modify files or propose running write/edit/bash commands.",
    "- Verify any suspected issue against the diff and surrounding code before reporting it.",
    "- If the patch is fully correct, set overall_correctness to 'patch is correct' with high confidence.",
    "",
    "--- Finding quality ---",
    "- Title: concise and specific.",
    "- Body: explain the issue, why it matters, and a concrete fix direction.",
    "- code_location: 1-based inclusive line range.",
    "- confidence_score: 0.0-1.0.",
    "- priority: 0=info, 1=minor, 2=major, 3=critical.",
    "- overall_correctness: 'patch is correct' | 'mostly correct' | 'patch is incorrect'.",
    "",
    "--- Tool strategy ---",
    "- Use read to inspect full files when the inline diff lacks context.",
    "- Use grep to verify patterns across the codebase.",
    "- Use find to locate related files quickly.",
    "- Use ls when you need a quick directory overview.",
    "",
    "Do NOT output JSON directly — call submit_review with the structured result.",
  ].join("\n");
}

async function createReviewerSession(
  invocation: ReviewInvocation,
  submitReviewTool: ReturnType<typeof defineTool>,
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
    tools: ["read", "grep", "find", "ls", "submit_review"],
    customTools: [submitReviewTool],
    resourceLoader,
    sessionManager: SessionManager.inMemory(invocation.cwd),
  });

  return session;
}

function extractLastAssistantText(session: AgentSession): string | undefined {
  const messages = session.messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;
    const text = extractAssistantText(message.content);
    if (text) return text;
  }
  return undefined;
}

function extractAssistantText(content: unknown): string | undefined {
  if (typeof content === "string") {
    return content || undefined;
  }

  if (!Array.isArray(content)) {
    return undefined;
  }

  const texts = content
    .map((part) => {
      if (typeof part !== "object" || !part) return "";
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .filter((text) => text.length > 0);

  return texts.length > 0 ? texts.join("\n") : undefined;
}

interface RunnerContext {
  progress: ReviewProgress;
  session: AgentSession;
  invocation: ReviewInvocation;
  resolve: (result: ReviewResult) => void;
  cleanup: (result: ReviewResult) => ReviewResult;
  resultHolder: { value: ReviewOutputEvent | undefined };
  signal?: AbortSignal;
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
    // Session stats are optional early in the run.
  }

  ctx.invocation.onProgress?.({ ...ctx.progress, activities: [...ctx.progress.activities] });
}

function handleTurnEnd(ctx: RunnerContext): void {
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
              snapshot: ctx.invocation.snapshot,
              timeoutMs: ctx.invocation.timeoutMs ?? DEFAULT_TIMEOUT_MS,
              partialOutput: partialText,
              brief: ctx.invocation.brief,
              modelId: ctx.invocation.model.canonicalId,
            }),
          );
        });
    }
  }

  emitProgress(ctx);
}

function handleToolStart(
  event: Extract<AgentSessionEvent, { type: "tool_execution_start" }>,
  ctx: RunnerContext,
): void {
  ctx.progress.toolUses++;
  const activity = toolNameToActivity(event.toolName, "start");
  if (activity) ctx.progress.activities.push(activity);
  ctx.invocation.onToolActivity?.({ toolName: event.toolName, phase: "start" });
  emitProgress(ctx);
}

function handleToolEnd(
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

function handleAgentEnd(
  event: Extract<AgentSessionEvent, { type: "agent_end" }>,
  ctx: RunnerContext,
): void {
  if (ctx.state.settled || ctx.signal?.aborted || ctx.timeout.aborting) return;
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

  const lastText = extractLastAssistantText(ctx.session);
  ctx.resolve(
    ctx.cleanup({
      kind: "failed",
      reason: lastText
        ? `Reviewer did not call submit_review. Assistant said: ${truncateText(lastText, 400)}`
        : "Reviewer did not produce any output.",
      snapshot: ctx.invocation.snapshot,
      brief: ctx.invocation.brief,
      modelId: ctx.invocation.model.canonicalId,
    }),
  );
}

function handleSessionEvent(event: AgentSessionEvent, ctx: RunnerContext): void {
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

/** Run the read-only reviewer child session. */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: lifecycle + timeout wiring belongs together here
export async function runReviewer(invocation: ReviewInvocation): Promise<ReviewResult> {
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

  let session: AgentSession;
  try {
    session = await createReviewerSession(invocation, submitReviewTool);
  } catch (error) {
    return {
      kind: "failed",
      reason: `Failed to create reviewer session: ${error instanceof Error ? error.message : String(error)}`,
      snapshot: invocation.snapshot,
      brief: invocation.brief,
      modelId: invocation.model.canonicalId,
    };
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
      invocation,
      resolve,
      cleanup,
      resultHolder,
      signal: invocation.signal,
      state,
      timeout: timeoutRef,
    };

    session.subscribe((event: AgentSessionEvent) => handleSessionEvent(event, ctx));

    const onAbort = () => {
      if (state.settled) return;
      clearHardAbort();
      void session
        .abort()
        .catch(() => {})
        .finally(() => {
          resolve(
            cleanup({
              kind: "canceled",
              snapshot: invocation.snapshot,
              brief: invocation.brief,
              modelId: invocation.model.canonicalId,
            }),
          );
        });
    };
    invocation.signal?.addEventListener("abort", onAbort, { once: true });

    const hardAbort = () => {
      if (state.settled) return;
      emitProgress(ctx);
      void session
        .abort()
        .catch(() => {})
        .finally(() => {
          const partialText = extractLastAssistantText(session);
          resolve(
            cleanup({
              kind: "timeout",
              snapshot: invocation.snapshot,
              timeoutMs: invocation.timeoutMs ?? DEFAULT_TIMEOUT_MS,
              partialOutput: partialText,
              brief: invocation.brief,
              modelId: invocation.model.canonicalId,
            }),
          );
        });
    };

    const HARD_ABORT_GRACE_MS = 120_000;
    const onTimeout = () => {
      if (state.settled) return;
      timeoutRef.steered = true;
      timeoutRef.graceTurnsRemaining = GRACE_TURNS;
      timeoutRef.hardAbortTimer = setTimeout(hardAbort, HARD_ABORT_GRACE_MS);
      timeoutRef.hardAbortTimer.unref?.();
      session.steer(STEER_MESSAGE).catch(() => {
        clearHardAbort();
        hardAbort();
      });
    };

    const timeoutId = setTimeout(onTimeout, invocation.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    timeoutId.unref?.();

    cancelTeardown = () => {
      invocation.signal?.removeEventListener("abort", onAbort);
      clearTimeout(timeoutId);
      clearHardAbort();
    };

    if (invocation.signal?.aborted) {
      onAbort();
      return;
    }

    session.prompt(invocation.prompt).catch((error: unknown) => {
      if (!state.settled) {
        resolve(
          cleanup({
            kind: "failed",
            reason: `Reviewer session error: ${error instanceof Error ? error.message : String(error)}`,
            snapshot: invocation.snapshot,
            brief: invocation.brief,
            modelId: invocation.model.canonicalId,
          }),
        );
      }
    });
  });
}
