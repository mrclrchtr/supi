import { clampThinkingLevel } from "@earendil-works/pi-ai";
import {
  type AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type {
  BriefSynthesisInvocation,
  BriefSynthesisRunResult,
  SynthesizedReviewBrief,
} from "../types.ts";
import { createEarlyCancellationDiagnostics } from "./child-failure-diagnostics.ts";
import { buildProgressTokens } from "./runner-helpers.ts";
import { reviewBriefSchema } from "./schemas.ts";
import { type LifecycleCtx, runWithLifecycle } from "./session-lifecycle.ts";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1_000;

function createSubmitBriefTool(resultHolder: {
  value: SynthesizedReviewBrief | undefined;
}): ReturnType<typeof defineTool> {
  return defineTool({
    name: "submit_review_brief",
    label: "Submit Review Brief",
    description: "Submit the synthesized review brief once you have inferred it from the input.",
    parameters: reviewBriefSchema,
    execute: async (_toolCallId, args) => {
      resultHolder.value = {
        ...(args as Omit<SynthesizedReviewBrief, "note">),
      };
      return {
        content: [{ type: "text" as const, text: "Review brief submitted successfully." }],
        details: args,
        terminate: true,
      };
    },
  });
}

function buildBriefSystemPrompt(): string {
  return [
    "You synthesize a compact review brief from session history and snapshot metadata.",
    "Infer the likely intent, constraints, focus areas, risky files, unresolved questions, and applicable review instruction blocks.",
    "Use only the supplied input. Do not invent requirements or files.",
    "If the input is thin, produce a conservative brief instead of guessing.",
    "Call submit_review_brief with the structured result. Do not emit freeform JSON.",
  ].join("\n");
}

async function createBriefSession(
  invocation: BriefSynthesisInvocation,
  submitBriefTool: ReturnType<typeof defineTool>,
): Promise<AgentSession> {
  const resourceLoader = new DefaultResourceLoader({
    cwd: invocation.cwd,
    agentDir: process.env.PI_CODING_AGENT_DIR || "",
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    appendSystemPrompt: [buildBriefSystemPrompt()],
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: invocation.cwd,
    model: invocation.model,
    thinkingLevel: clampThinkingLevel(invocation.model, "max"),
    tools: ["submit_review_brief"],
    customTools: [submitBriefTool],
    resourceLoader,
    sessionManager: SessionManager.inMemory(invocation.cwd),
  });

  return session;
}

function emitBriefProgress(
  ctx: LifecycleCtx<BriefSynthesisRunResult>,
  invocation: BriefSynthesisInvocation,
): void {
  ctx.progress.tokens = buildProgressTokens(() => ctx.session.getSessionStats());
  ctx.progress.elapsedMs = Date.now() - ctx.startTime;
  invocation.onProgress?.(ctx.progress);
}

/** Finalize after retries and compaction recovery, never at the earlier `agent_end` boundary. */
function handleAgentSettled(options: {
  brief: SynthesizedReviewBrief | undefined;
  state: { settled: boolean; aborting: boolean };
  cleanup: (result: BriefSynthesisRunResult) => BriefSynthesisRunResult;
  getFailureDiagnostics: LifecycleCtx<BriefSynthesisRunResult>["getFailureDiagnostics"];
}): BriefSynthesisRunResult | undefined {
  const { brief, state, cleanup, getFailureDiagnostics } = options;
  if (state.settled || state.aborting) return undefined;
  if (brief) return cleanup({ kind: "success", brief });

  return cleanup({
    kind: "failed",
    failureCode: "missing-structured-output",
    diagnostics: getFailureDiagnostics(),
  });
}

/** Run the brief-synthesis child session. */
export async function runBriefSynthesis(
  invocation: BriefSynthesisInvocation,
): Promise<BriefSynthesisRunResult> {
  if (invocation.signal?.aborted) {
    return { kind: "canceled", diagnostics: createEarlyCancellationDiagnostics() };
  }

  const resultHolder: { value: SynthesizedReviewBrief | undefined } = { value: undefined };
  const submitBriefTool = createSubmitBriefTool(resultHolder);

  let session: AgentSession;
  try {
    session = await createBriefSession(invocation, submitBriefTool);
  } catch {
    return { kind: "failed", failureCode: "session-creation-failed" };
  }

  return runWithLifecycle<BriefSynthesisRunResult>({
    session,
    prompt: invocation.prompt,
    signal: invocation.signal,
    timeoutMs: invocation.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    onEvent: (event, ctx) => {
      switch (event.type) {
        case "turn_end":
          ctx.progress.turns++;
          emitBriefProgress(ctx, invocation);
          break;
        case "tool_execution_start":
          ctx.progress.toolUses++;
          ctx.progress.currentFocus = {
            label: event.toolName === "submit_review_brief" ? "Submitting brief" : event.toolName,
            detail: "",
          };
          emitBriefProgress(ctx, invocation);
          break;
        case "tool_execution_end":
          ctx.progress.currentFocus = undefined;
          emitBriefProgress(ctx, invocation);
          break;
        case "agent_settled": {
          const result = handleAgentSettled({
            brief: resultHolder.value,
            state: ctx.state,
            cleanup: ctx.cleanup,
            getFailureDiagnostics: ctx.getFailureDiagnostics,
          });
          if (result) {
            ctx.resolve(result);
          }
          break;
        }
        default:
          break;
      }
    },
    canceledResult: (ctx) => ({
      kind: "canceled" as const,
      diagnostics: ctx.getFailureDiagnostics(),
    }),
    failedResult: (failureCode, ctx) => ({
      kind: "failed" as const,
      failureCode,
      diagnostics: ctx.getFailureDiagnostics(),
    }),
    timeoutResult: (ms, ctx) => ({
      kind: "timeout" as const,
      timeoutMs: ms,
      diagnostics: ctx.getFailureDiagnostics(),
    }),
  });
}
