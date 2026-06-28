/**
 * Low-level suggestion model client.
 *
 * Pure functions for calling the suggestion model — no module-level state,
 * no orchestration, no debug logging.
 *
 * @module
 */

import { completeSimple } from "@earendil-works/pi-ai";

// ── Constants ──────────────────────────────────────────────────────────

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
  "Do NOT include greetings, thank-yous, politeness, or conversational filler. " +
  "If there is no useful follow-up, respond with exactly the word NO_SUGGESTION and nothing else. " +
  "Keep suggestions under 240 characters.";

// ── Prompt building ────────────────────────────────────────────────────

/**
 * Format the tail text as a completion prompt with clear instructions.
 *
 * Uses explicit instructions so the model produces a follow-up user
 * message (question, answer, or directive) without pleasantries.
 */
export function buildPrompt(tail: string): string {
  return (
    "Based on the assistant's last message below, write a follow-up user message. " +
    "It must be a direct question, answer, or directive — no greetings, thank-yous, or filler. " +
    'If no useful follow-up exists, respond with exactly "NO_SUGGESTION".\n\n' +
    `<assistant_message>\n${tail}\n</assistant_message>\n\n` +
    "Suggestion:"
  );
}

// ── Types ──────────────────────────────────────────────────────────────

export interface SuggestionClientResult {
  ok: true;
  text: string;
}

export interface SuggestionClientError {
  ok: false;
  message: string;
}

export type SuggestionClientOutput = SuggestionClientResult | SuggestionClientError;

export interface SuggestionClientOptions {
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is pi's canonical type
  model: any;
  auth: { apiKey: string; headers?: Record<string, string> };
  tail: string;
  signal: AbortSignal;
}

// ── API call ───────────────────────────────────────────────────────────

/**
 * Call the suggestion model with a simple completion prompt.
 *
 * Pure function — all side effects (HTTP, abort) are scoped to the call.
 * Returns a structured result; does not log or interact with the extension
 * context.
 */
export async function callSuggestionModel(
  opts: SuggestionClientOptions,
): Promise<SuggestionClientOutput> {
  const { model, auth, tail, signal } = opts;

  const response = await completeSimple(
    model,
    {
      systemPrompt: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: buildPrompt(tail) }],
          timestamp: Date.now(),
        },
      ],
    },
    {
      apiKey: auth.apiKey,
      headers: auth.headers,
      signal,
    },
  );

  if (!response?.content) {
    const message = `Suggestion model returned no content (stopReason: ${response?.stopReason ?? "undefined"})`;
    return { ok: false, message };
  }

  if (response.stopReason === "error") {
    const message = `Suggestion model failed: ${response.errorMessage ?? response.stopReason}`;
    return { ok: false, message };
  }

  // Prefer text blocks; fall back to thinking blocks for reasoning-only models.
  const textContent = response.content
    .filter((c: { type: string }) => c.type === "text")
    .map((c: { type: string; text?: string }) => c.text)
    .join("");

  if (!textContent) {
    const contentTypes = response.content.map((c: { type: string }) => c.type);
    const message = `Suggestion model returned no text (content types: [${contentTypes.join(", ")}])`;
    return { ok: false, message };
  }

  return { ok: true, text: textContent };
}
