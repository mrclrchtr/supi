/** Low-level suggestion model client. */

import type { Api, Context, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { completeSimpleModelRequest } from "@mrclrchtr/supi-core/llm";
import {
  classifySuggestionFailure,
  createSuggestionFailure,
  type SuggestionFailure,
} from "./failure.ts";

// ── Constants ──────────────────────────────────────────────────────────────

export const GENERATION_TIMEOUT_MS = 20_000;

/**
 * System prompt instructs the model to predict the user's next message,
 * preferably an imperative command to the assistant, or return the
 * NO_SUGGESTION sentinel when none is useful.
 *
 * The model receives no PI, SuPi, project, or conversation context —
 * only the last assistant message text is sent.
 */
const SYSTEM_PROMPT = `You predict the next message a developer types to their coding assistant.
You receive the assistant's last message. Write the single line the USER would send next.

Rules:
- Write as the user talking to the assistant. Never write in the assistant's voice and never ask the user anything (no "Should I…?", "Do you want…?", "Shall we…?").
- Prefer a short imperative command that moves the work forward: "Push the branch.", "Run the tests.", "Fix the lint errors."
- If the assistant asks a question or offers options, answer it as a command that picks the most sensible option, e.g. "Yes, push it to origin." or "Use option 2."
- Name concrete targets from the message (branch, file, command, option) when they make the command unambiguous.
- Ask a question only when the user clearly needs information before deciding.
- No greetings, thanks, politeness, explanations, quotes, or prefixes like "Suggestion:".
- Keep it under 120 characters.
- If no useful next message exists, respond with exactly NO_SUGGESTION.

Examples (assistant message → your output):
"Committed as abc123. Not pushed: the branch is 3 commits ahead of origin." → Push the branch to origin.
"Should I also update the README, or keep the change code-only?" → Update the README too.
"Two options: A) add a cache, B) batch the requests. Which do you prefer?" → Go with B and batch the requests.

Output only the message text.`;

// ── Prompt building ────────────────────────────────────────────────────────

/** Format the tail text as a completion prompt. */
export function buildPrompt(tail: string): string {
  return `<assistant_message>\n${tail}\n</assistant_message>\n\nUser's next message:`;
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface SuggestionClientResult {
  ok: true;
  text: string;
}

/** Classified request failure without provider response text. */
export type SuggestionClientFailure = SuggestionFailure;

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
 * authentication, endpoint, headers, provider environment, and simple output limits.
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
    const response = await completeSimpleModelRequest(opts.ctx, opts.model, context, {
      affinityScope: "prompt-suggestions",
      signal: opts.signal,
    });

    if (response.stopReason === "aborted") {
      return failureResult(createSuggestionFailure("timeout"));
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

function failureResult(failure: SuggestionFailure): SuggestionClientError {
  return { ok: false, failure };
}
