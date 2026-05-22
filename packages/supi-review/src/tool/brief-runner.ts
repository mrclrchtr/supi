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
import type {
  BriefSynthesisInvocation,
  BriefSynthesisRunResult,
  ReviewProgress,
} from "./runner-types.ts";
import { reviewBriefSchema } from "./schemas.ts";

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
        ...(args as Omit<SynthesizedReviewBrief, "evidenceCount" | "note">),
        evidenceCount: 0,
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
    "Infer the likely intent, constraints, focus areas, risky files, and unresolved questions.",
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
    return content.length > 0 ? content : undefined;
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
    .filter((value) => value.length > 0);

  return texts.length > 0 ? texts.join("\n") : undefined;
}

function emitProgress(session: AgentSession, progress: ReviewProgress): ReviewProgress {
  try {
    const stats = session.getSessionStats();
    progress.tokens = stats?.tokens
      ? {
          input: stats.tokens.input ?? 0,
          output: stats.tokens.output ?? 0,
          total: stats.tokens.total ?? 0,
        }
      : undefined;
  } catch {
    // ignore missing stats
  }
  return { ...progress, activities: [...progress.activities] };
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
  const lastText = extractLastAssistantText(session);
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

  const progress: ReviewProgress = { turns: 0, toolUses: 0, activities: [], tokens: undefined };
  const state = { settled: false, aborting: false };
  let cancelTeardown: (() => void) | undefined;

  const cleanup = (result: BriefSynthesisRunResult): BriefSynthesisRunResult => {
    if (state.settled) return result;
    state.settled = true;
    cancelTeardown?.();
    session.dispose();
    return result;
  };

  const handleEvent = (
    event: AgentSessionEvent,
    resolve: (result: BriefSynthesisRunResult) => void,
  ) => {
    switch (event.type) {
      case "turn_end":
        progress.turns++;
        invocation.onProgress?.(emitProgress(session, progress));
        break;
      case "tool_execution_start":
        progress.toolUses++;
        progress.activities = [
          event.toolName === "submit_review_brief" ? "submitting brief" : event.toolName,
        ];
        invocation.onProgress?.(emitProgress(session, progress));
        break;
      case "tool_execution_end":
        progress.activities = [];
        invocation.onProgress?.(emitProgress(session, progress));
        break;
      case "agent_end": {
        const result = handleAgentEnd({
          event,
          session,
          brief: resultHolder.value,
          state,
          cleanup,
        });
        if (result) {
          resolve(result);
        }
        break;
      }
      default:
        break;
    }
  };

  return new Promise<BriefSynthesisRunResult>((resolve) => {
    session.subscribe((event: AgentSessionEvent) => handleEvent(event, resolve));

    const onAbort = () => {
      if (state.settled) return;
      state.aborting = true;
      void session
        .abort()
        .catch(() => {})
        .finally(() => {
          resolve(cleanup({ kind: "canceled" }));
        });
    };
    invocation.signal?.addEventListener("abort", onAbort, { once: true });

    const timeoutId = setTimeout(() => {
      if (state.settled) return;
      state.aborting = true;
      void session
        .abort()
        .catch(() => {})
        .finally(() => {
          resolve(
            cleanup({ kind: "timeout", timeoutMs: invocation.timeoutMs ?? DEFAULT_TIMEOUT_MS }),
          );
        });
    }, invocation.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    timeoutId.unref?.();

    cancelTeardown = () => {
      invocation.signal?.removeEventListener("abort", onAbort);
      clearTimeout(timeoutId);
    };

    session.prompt(invocation.prompt).catch((error: unknown) => {
      if (!state.settled) {
        resolve(
          cleanup({
            kind: "failed",
            reason: `Brief synthesis session error: ${error instanceof Error ? error.message : String(error)}`,
          }),
        );
      }
    });
  });
}
