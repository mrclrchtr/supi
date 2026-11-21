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
 * System prompt instructs the model to write the user's next message:
 * a direct answer to an assistant question, or the obvious next
 * instruction, or the NO_SUGGESTION sentinel when none is plausible.
 *
 * Kept short on purpose: small suggestion models followed a long rule list
 * less reliably and echoed yes/no questions back ("Darf ich …?").
 *
 * The model receives no PI, SuPi, project, or conversation context —
 * only the last assistant message text is sent.
 */
const SYSTEM_PROMPT = `You write the next message the user sends to their coding assistant, given the assistant's last message.

- Write as the user, always in the language of the assistant's message. Never ask the assistant anything, never repeat its question back, and never announce what you will do yourself.
- If the assistant asks a question, answer it directly and decisively: "Ja, mach.", "Nein, committe direkt.", "Option 2."
- If the assistant asks the user to run or check something, delegate it back: "Führ das selbst aus.", "Run it yourself."
- Otherwise give the obvious next instruction: "Push.", "Commit.", "Tests laufen lassen."
- Terse like a real developer: 1–8 words. No lead-ins, quotes, markdown, politeness, explanations, or copied commands.
- Only reference options from the assistant's message.
- Output NO_SUGGESTION if there is no plausible reply.

Output only the message.`;

// ── Prompt building ────────────────────────────────────────────────────────

/**
 * Zero-width space placed before each `@` in the assistant text.
 *
 * CLI-backed providers such as `claude-code` read `@name` in a user message as
 * a file mention and append "The user @-mentioned name… read them with your
 * file tools" to the request. The suggestion model then answers that note
 * ("I'll read the file first…") instead of predicting the user's reply.
 */
const MENTION_GUARD = "\u200B";

/** Format the tail text as a completion prompt. */
export function buildPrompt(tail: string): string {
  const guarded = tail.replaceAll("@", `${MENTION_GUARD}@`);
  return `<assistant_message>\n${guarded}\n</assistant_message>\n\nUser's next message:`;
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
