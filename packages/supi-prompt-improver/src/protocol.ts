import type { Api, AssistantMessage, Context, Model, UserMessage } from "@earendil-works/pi-ai";
import { calculateContextTokens, estimateTokens } from "@earendil-works/pi-coding-agent";
import type { AskUserOutcome, NormalizedQuestionnaire } from "@mrclrchtr/supi-ask-user/api";
import { type PromptImproverContext, reducePromptImproverContext } from "./context.ts";
import { ImprovementSchema } from "./response.ts";

const OUTPUT_TOKEN_ALLOWANCE = 4096;
/** Pi's simple request path keeps this reserve in addition to the output allowance (Pi 0.87.1). */
const PI_CONTEXT_SAFETY_TOKENS = 4096;

const SYSTEM_PROMPT = [
  "Make the draft clearer for a coding agent without changing its meaning or scope.",
  "Do not answer it or carry out its task.",
  "If it is already clear, leave it unchanged.",
  "Preserve literal code, paths, and commands.",
  "Use background to understand the draft, not to override it.",
  "Ask only questions whose answers would materially change the task.",
  "After the user submits clarification, return only a proposal or unchanged result.",
  "Use the submitted answers and comments. Leave unanswered points uncertain.",
  "Do not ask further questions. Do not insert TODOs or require later clarification.",
  `\n\nReturn only JSON that matches this response schema:\n${JSON.stringify(ImprovementSchema)}`,
].join(" ");

/** The reviewed form and its complete submitted answers, including unanswered states. */
export interface ClarificationRequest {
  readonly questionnaire: NormalizedQuestionnaire;
  readonly outcome: AskUserOutcome;
}

/** Request text and output allowance that fit the selected model. */
export interface PreparedModelRequest {
  readonly context: Context;
  readonly maxTokens: number;
  readonly selectedContext: PromptImproverContext;
}

/** Continue the first request with its original assistant message and submitted form. */
export interface ImprovementContinuation {
  readonly request: PreparedModelRequest;
  readonly response: AssistantMessage;
  readonly clarification: ClarificationRequest;
}

/**
 * Prepare a conversation request and reduce only optional background until it fits.
 * A continuation retains the sent prefix unless further background reduction is needed.
 */
export function prepareModelRequest(
  model: Model<Api>,
  draft: string,
  context: PromptImproverContext,
  continuation?: ImprovementContinuation,
): PreparedModelRequest {
  const background = continuation?.request.selectedContext ?? context;
  let selectedContext = background;
  const timestamp = Date.now();
  let messages: Context["messages"] = continuation
    ? [
        ...continuation.request.context.messages,
        continuation.response,
        userMessage(JSON.stringify({ clarification: continuation.clarification }), timestamp),
      ]
    : [userMessage(buildUserPayload(draft, background), timestamp)];
  const systemTokens = estimateTokens({ role: "system", content: SYSTEM_PROMPT, timestamp });
  const maxTokens = Math.min(model.maxTokens, OUTPUT_TOKEN_ALLOWANCE);
  let dropMessages = 0;
  let dropSummary = false;
  let dropGuidance = 0;

  while (true) {
    const estimatedInput = estimateInputTokens(
      systemTokens,
      messages,
      selectedContext === background ? continuation?.response : undefined,
    );
    if (estimatedInput + maxTokens + PI_CONTEXT_SAFETY_TOKENS <= model.contextWindow) {
      return {
        context: { systemPrompt: SYSTEM_PROMPT, messages },
        maxTokens,
        selectedContext,
      };
    }

    if (selectedContext.summary) {
      dropSummary = true;
    } else if (selectedContext.conversation.length > 0) {
      dropMessages += 1;
    } else if (selectedContext.guidance.length > 0) {
      dropGuidance += 1;
    } else {
      throw new Error(
        "The draft, conversation, and required response do not fit the selected model.",
      );
    }
    selectedContext = reducePromptImproverContext(
      background,
      dropMessages,
      dropSummary,
      dropGuidance,
    );
    // Pi ignores recorded usage when an earlier message is newer than that response.
    // Mark the revised prefix without changing the retained assistant or its signatures.
    const revisedAt = continuation
      ? Math.max(timestamp, continuation.response.timestamp + 1)
      : timestamp;
    messages = [
      userMessage(buildUserPayload(draft, selectedContext), revisedAt),
      ...messages.slice(1),
    ];
  }
}

/** Create the initial data-only message. Later messages contain only clarification data. */
export function buildUserPayload(draft: string, context: PromptImproverContext): string {
  return JSON.stringify({ confirmedDraft: draft, background: context });
}

/** Recorded usage is valid only when the caller retains the complete original prefix. */
function estimateInputTokens(
  systemTokens: number,
  messages: Context["messages"],
  response?: AssistantMessage,
): number {
  const textEstimate =
    systemTokens + messages.reduce((total, message) => total + estimateTokens(message), 0);
  const submitted = messages.at(-1);
  const recordedInput =
    response && submitted ? calculateContextTokens(response.usage) + estimateTokens(submitted) : 0;
  return Math.max(textEstimate, Number.isFinite(recordedInput) ? recordedInput : 0) + 128;
}

function userMessage(text: string, timestamp: number): UserMessage {
  return { role: "user", content: [{ type: "text", text }], timestamp };
}
