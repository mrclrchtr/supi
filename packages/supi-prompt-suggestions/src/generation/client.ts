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
- Write in the language of the assistant's message.
- Start directly with the message itself. Never add a lead-in or framing in any language, such as "Suggestion:", "I'd say:", "Ich würde sagen:", or "Next:".
- Prefer a short imperative command that moves the work forward: "Push the branch.", "Run the tests.", "Fix the lint errors."
- If the assistant asks a question or offers options, answer it as a command that picks the most sensible option, e.g. "Yes, push it to origin." or "Use option 2."
- If the assistant tells the user to run or check something, the user usually delegates it: "Run the test yourself."
- Never announce or narrate what the user is about to do ("I'll check…", "Let me try…", "Ich schau mal…"). If the user must check something first, write the reply they send afterwards, assuming it worked: "Works.", "Passt."
- Only reference steps, commands, and options that appear in the assistant's message. Never invent extra steps.
- Refer to commands briefly by name or purpose; do not copy long commands, paths, or code. The assistant already knows them.
- No greetings, thanks, politeness, explanations, quotes, or markdown.
- Be terse like a real developer: usually 2–8 words, never more than 80 characters.
- Almost always suggest something. If the assistant only reports status or asks for feedback, suggest the most likely short reply, such as "Looks good, commit it." or "Try it again."
- Respond with exactly NO_SUGGESTION only when the message gives no hint at all about what the user might say next.

Examples (assistant message → your output):
"Committed as abc123. Not pushed: the branch is 3 commits ahead of origin." → Push the branch.
"Should I also update the README, or keep the change code-only?" → Update the README too.
"Two options: A) add a cache, B) batch the requests. Which do you prefer?" → Go with B.
"To verify, run \`npm ci && npm test -- --coverage\` and check the report." → Run the tests yourself.
"Fertig. Zum Prüfen: \`brew uninstall foo && chezmoi apply\` ausführen." → Führ den Test selbst aus.

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
