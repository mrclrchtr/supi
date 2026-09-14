/** Low-level suggestion model client. */

import type { Api, Context, Model } from "@earendil-works/pi-ai";
import { clampMaxTokensToContext } from "@earendil-works/pi-ai/api/simple-options";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { completeModelRequest } from "@mrclrchtr/supi-core/llm";
import {
  classifySuggestionFailure,
  type RuntimeSuggestionFailureKind,
  suggestionFailureSummary,
} from "./failure.ts";

// ── Constants ──────────────────────────────────────────────────────────────

export const GENERATION_TIMEOUT_MS = 20_000;

/**
 * System prompt instructs the model to suggest a follow-up user message
 * (question, answer, or directive) or return the NO_SUGGESTION sentinel
 * when none is useful.
 *
 * The model receives no PI, SuPi, project, or conversation context —
 * only the last assistant message text is sent.
 */
const SYSTEM_PROMPT =
  "You suggest follow-up messages for a coding assistant conversation. " +
  "Given the assistant's last message, write a single line the user would type next. " +
  "It must be a direct question, answer, or directive — nothing else. " +
  "If the assistant asks for a decision, suggest a concise, specific answer to that decision, not the action that would follow from it. " +
  "When answering yes/no, include the relevant constraint or option text when present. " +
  "Do NOT include greetings, thank-yous, politeness, or conversational filler. " +
  "If there is no useful follow-up, respond with exactly the word NO_SUGGESTION and nothing else. " +
  "Keep suggestions under 240 characters.";

// ── Prompt building ────────────────────────────────────────────────────────

/** Format the tail text as a completion prompt. */
export function buildPrompt(tail: string): string {
  return `<assistant_message>\n${tail}\n</assistant_message>\n\nSuggestion:`;
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface SuggestionClientResult {
  ok: true;
  text: string;
}

/** Classified request failure without provider response text. */
export interface SuggestionClientFailure {
  kind: RuntimeSuggestionFailureKind;
  summary: string;
}

export interface SuggestionClientError {
  ok: false;
  failure: SuggestionClientFailure;
}

export type SuggestionClientOutput = SuggestionClientResult | SuggestionClientError;

export interface SuggestionClientOptions {
  ctx: ExtensionContext;
  model: Model<Api>;
  tail: string;
  signal: AbortSignal;
}

// ── API call ────────────────────────────────────────────────────────────────

/**
 * Call the suggestion model through PI's model registry.
 *
 * The request keeps the fixed prompt and bounded assistant tail. PI resolves
 * authentication, endpoint, headers, and provider environment.
 */
export async function callSuggestionModel(
  opts: SuggestionClientOptions,
): Promise<SuggestionClientOutput> {
  const context: Context = {
    systemPrompt: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: buildPrompt(opts.tail) }],
        timestamp: Date.now(),
      },
    ],
  };

  try {
    const response = await completeModelRequest(opts.ctx, opts.model, context, {
      affinityScope: "prompt-suggestions",
      signal: opts.signal,
      maxTokens: clampMaxTokensToContext(opts.model, context, opts.model.maxTokens),
    });

    if (response.stopReason === "aborted") {
      return failureResult("timeout");
    }
    if (response.stopReason === "error") {
      return failureResult(classifySuggestionFailure(response.errorMessage));
    }

    // An empty successful response is a valid no-suggestion result. Thinking or
    // other non-text blocks are also harmless when no user-visible text exists.
    const textContent = Array.isArray(response.content)
      ? response.content
          .filter((content): content is { type: "text"; text: string } => content.type === "text")
          .map((content) => content.text)
          .join("")
      : "";

    return { ok: true, text: textContent };
  } catch (error) {
    return failureResult(classifySuggestionFailure(error));
  }
}

function failureResult(kind: RuntimeSuggestionFailureKind): SuggestionClientError {
  return {
    ok: false,
    failure: { kind, summary: suggestionFailureSummary(kind) },
  };
}
