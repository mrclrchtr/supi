import { clampThinkingLevel } from "@earendil-works/pi-ai";
import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { SynthesizedReviewBrief } from "../types.ts";
import { buildProgressTokens, extractLastAssistantText } from "./runner-helpers.ts";
import type { BriefSynthesisInvocation, BriefSynthesisRunResult } from "./runner-types.ts";
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
    modelRegistry: invocation.modelRegistry,
    thinkingLevel: clampThinkingLevel(invocation.model, "xhigh"),
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
  invocation.onProgress?.({ ...ctx.progress, activities: [...ctx.progress.activities] });
}

function handleAgentEnd(options: {
  event: Extract<AgentSessionEvent, { type: "agent_end" }>;
  session: AgentSession;
  brief: SynthesizedReviewBrief | undefined;
  state: { settled: boolean; aborting: boolean };
  cleanup: (result: BriefSynthesisRunResult) => BriefSynthesisRunResult;
}): BriefSynthesisRunResult | undefined {
  const { event, session, brief, state, cleanup } = options;
  const retryAwareEvent = event as typeof event & { willRetry?: boolean };
  if (retryAwareEvent.willRetry || state.settled || state.aborting) {
    return undefined;
  }
  if (brief) {
    return cleanup({ kind: "success", brief });
  }
  const lastText = extractLastAssistantText(session.messages);
  return cleanup({
    kind: "failed",
    reason: lastText
      ? `Brief synthesizer did not call submit_review_brief. Assistant said: ${lastText}`
      : "Brief synthesizer did not produce any output.",
  });
}

/** Run the brief-synthesis child session. */
export async function runBriefSynthesis(
  invocation: BriefSynthesisInvocation,
): Promise<BriefSynthesisRunResult> {
  if (invocation.signal?.aborted) {
    return { kind: "canceled" };
  }

  const resultHolder: { value: SynthesizedReviewBrief | undefined } = { value: undefined };
  const submitBriefTool = createSubmitBriefTool(resultHolder);

  let session: AgentSession;
  try {
    session = await createBriefSession(invocation, submitBriefTool);
  } catch (error) {
    return {
      kind: "failed",
      reason: `Failed to create brief synthesis session: ${error instanceof Error ? error.message : String(error)}`,
    };
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
          ctx.progress.activities = [
            event.toolName === "submit_review_brief" ? "submitting brief" : event.toolName,
          ];
          emitBriefProgress(ctx, invocation);
          break;
        case "tool_execution_end":
          ctx.progress.activities = [];
          emitBriefProgress(ctx, invocation);
          break;
        case "agent_end": {
          const result = handleAgentEnd({
            event,
            session,
            brief: resultHolder.value,
            state: ctx.state,
            cleanup: ctx.cleanup,
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
    canceledResult: () => ({ kind: "canceled" as const }),
    failedResult: (reason) => ({
      kind: "failed" as const,
      reason,
    }),
    timeoutResult: (ms) => ({ kind: "timeout" as const, timeoutMs: ms }),
  });
}
