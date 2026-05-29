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
import type { RawReviewResult, ReviewOutputEvent } from "../types.ts";
import type { ReviewInvocation, ReviewProgress } from "./runner-types.ts";
import { reviewOutputSchema } from "./schemas.ts";
import { createSnapshotDiffTool, createSnapshotFileTool } from "./snapshot-tools.ts";

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
    read_snapshot_diff: "reading diff",
    read_snapshot_file: "reading file",
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
    "You are a rigorous code reviewer. Your task already includes session-derived intent",
    "and a concrete list of changed files. Use the prompt packet as the primary brief,",
    "then inspect code with the available read-only tools before drawing conclusions.",
    "",
    "--- Guardrails ---",
    "- You have read-only tools only. Do NOT modify files or propose running write/edit/bash commands.",
    "",
    "--- Depth ---",
    "- Read the full changed file, not just the diff. The diff shows what changed;",
    "  surrounding code shows whether it still makes sense.",
    "- For high-risk files, also read immediate callers and callees (use grep / find / read",
    "  to trace references). Without surrounding context you miss broken call sites,",
    "  stale comments, and silent convention violations.",
    "",
    "--- Convention awareness ---",
    "- Before flagging a style or convention issue, read CLAUDE.md, AGENTS.md, and",
    "  sibling files in the same directory.",
    '- "This doesn\'t match the codebase style" only counts when you can point to',
    "  the real convention in the codebase.",
    "",
    "--- Audit hints from the prompt packet ---",
    "- The prompt packet may include audit hints for this review.",
    "- Treat any supplied audit hints as mandatory checks for this run.",
    "- If an audit hint applies, explicitly sweep that class of issues before submitting.",
    "",
    "--- What counts as a finding ---",
    "Report only issues that meet ALL of these criteria:",
    "1. It meaningfully impacts correctness, security, performance, or maintainability.",
    "2. It was introduced by this change — pre-existing issues are out of scope",
    "   unless the change makes them worse.",
    "3. It is discrete and actionable — the author can fix it in one focused pass.",
    "4. It does not require assuming unstated intent or speculative downstream effects.",
    "5. It does not demand a level of rigor not present in the rest of the codebase.",
    "6. The author would likely fix it if they were made aware of it.",
    "7. It is not clearly an intentional change by the original author.",
    "",
    "--- Do not flag ---",
    "- Trivial style issues unless they obscure meaning or violate documented standards.",
    "- Pre-existing bugs unrelated to this change.",
    '- Things that "might" break without an identified concrete code path.',
    "- Hypothetical issues without a concrete scenario.",
    "- Speculative downstream effects — identify the specific affected code.",
    "",
    "--- Review checklist ---",
    "Check for:",
    "- Logic bugs — wrong condition, off-by-one, missing null/undefined check, race condition.",
    "- Security — injection, authz bypass, secret exposure.",
    "- Convention violations — only when you can cite the convention.",
    "- Missing or weak tests — new behavior without test coverage.",
    "- Dead or unreachable code introduced by this change.",
    "- Breaking changes — removed exports, changed signatures, config format changes.",
    "",
    "--- Review item calibration ---",
    "recommended_action:",
    "  must-fix: blocks merge or should be fixed before the change is accepted",
    "  should-fix: worthwhile follow-up that meaningfully improves the patch",
    "  consider: optional cleanup, docs, tests, or maintainer-oriented improvement worth surfacing",
    "impact:",
    "  high: leaving it unfixed has a clear meaningful downside",
    "  medium: real downside, but not release-blocking on its own",
    "  low: narrow or limited downside",
    "effort:",
    "  low: focused fix in one small pass",
    "  medium: non-trivial but still well-bounded",
    "  high: invasive or multi-part follow-up",
    "Confidence:",
    "  0.8-1.0: you verified the item by reading surrounding code or grepping the codebase",
    "  0.5-0.8: plausible and supported by the patch, but not fully verified",
    "  <0.5: do not report — either verify further or drop it",
    "Categories:",
    "  correctness, security, performance, api, test-gap, docs, cleanup, maintainer",
    "",
    "--- Overall assessment ---",
    "Explain the overall review assessment in overall_explanation.",
    "The host derives the final PATCH IS CORRECT / PATCH HAS ISSUES verdict from your submitted items.",
    "",
    "--- Review item format ---",
    '- Title: concise and specific imperative (e.g. "Guard null token path").',
    "- Body: what's wrong, why it matters, and the evidence. One paragraph.",
    "- category / impact / effort / recommended_action: choose the closest structured values.",
    "- suggested_fix: concrete repair direction the author can apply next.",
    "- verification_hint: how to confirm the fix worked.",
    "- code_location: 1-based inclusive line range when a concrete location exists.",
    "",
    "--- Tool strategy ---",
    "- Start by fetching the diff for each changed file using read_snapshot_diff.",
    "- Use read_snapshot_file <file> before|after to inspect file contents on either side of the change.",
    "- Use read to inspect full files when the inline diff lacks context.",
    "- Use grep to verify patterns across the codebase.",
    "- Use find to locate related files quickly.",
    "- Use ls when you need a quick directory overview.",
    "",
    "--- Large diffs ---",
    "- If the diff spans many files, prioritize high-risk files (core logic, auth, data handling).",
    "- Note in overall_explanation which files you reviewed deeply vs. skimmed.",
    "",
    "--- Skipped files ---",
    "- Skip reviewing: lockfiles, generated/bundled code (dist/, .next/, __generated__/),",
    "  vendored dependencies, changelogs, snapshot files, minified bundles, and binary files.",
    "- Focus on application source and test code.",
    "",
    "--- Output ---",
    "Do NOT output JSON directly — call submit_review with the structured result.",
  ].join("\n");
}

async function createReviewerSession(
  invocation: ReviewInvocation,
  submitReviewTool: ReturnType<typeof defineTool>,
  snapshotDiffTool: ReturnType<typeof defineTool>,
  snapshotFileTool: ReturnType<typeof defineTool>,
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
  resolve: (result: RawReviewResult) => void;
  cleanup: (result: RawReviewResult) => RawReviewResult;
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

  const progress: ReviewProgress = { turns: 0, toolUses: 0, activities: [], tokens: undefined };
  const state = { settled: false };
  let cancelTeardown: (() => void) | undefined;

  const cleanup = (result: RawReviewResult): RawReviewResult => {
    if (state.settled) return result;
    state.settled = true;
    cancelTeardown?.();
    session.dispose();
    return result;
  };

  return new Promise<RawReviewResult>((resolve) => {
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
