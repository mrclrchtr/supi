import { complete } from "@earendil-works/pi-ai/compat";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";

// Shared LLM utilities for SuPi extensions.
//
// Provides retry logic, structured LLM call helpers, and other
// common patterns for extensions that interact with AI models.

/**
 * Options for {@link withRetry}.
 */
export interface WithRetryOptions {
  /** Maximum number of retry attempts after the initial call. Default: 2 */
  retries?: number;
  /** Base delay in milliseconds for exponential backoff. Default: 1000 */
  baseDelayMs?: number;
  /** AbortSignal to cancel retry loops. */
  signal?: AbortSignal;
  /** Called with each failed attempt's attempt index and error. */
  logger?: (attempt: number, error: unknown) => void;
  /** Called before each retry delay with attempt index and computed delay. */
  onRetry?: (attempt: number, delayMs: number) => void;
}

/**
 * Attempt an async operation with retries and exponential backoff.
 *
 * If the signal is already aborted on entry, the operation is skipped entirely.
 * If the signal aborts during a delay, the delay is cancelled immediately.
 *
 * @param fn - The async operation to retry.
 * @param options - Optional configuration for retries, backoff, signal, and callbacks.
 * @returns The result on success, or `null` if all attempts fail or the signal aborts.
 */
/**
 * Create a promise that resolves after `ms` milliseconds, or rejects if
 * the signal fires before the timeout elapses.
 */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/**
 * Attempt an async operation with retries and exponential backoff.
 *
 * If the signal is already aborted on entry, the operation is skipped entirely.
 * If the signal aborts during a delay, the delay is cancelled immediately.
 *
 * @param fn - The async operation to retry.
 * @param options - Optional configuration for retries, backoff, signal, and callbacks.
 * @returns The result on success, or `null` if all attempts fail or the signal aborts.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: WithRetryOptions,
): Promise<T | null> {
  const { retries = 2, baseDelayMs = 1000, signal, logger, onRetry } = options ?? {};

  if (signal?.aborted) return null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      logger?.(attempt, err);
      if (attempt >= retries || signal?.aborted) continue;

      const delayMs = baseDelayMs * 2 ** attempt;
      onRetry?.(attempt, delayMs);

      try {
        await delay(delayMs, signal);
      } catch {
        // delay() only rejects on abort
        return null;
      }
    }
  }

  return null;
}

/**
 * Extract and validate JSON from LLM response content blocks.
 *
 * Finds the first JSON object `{...}` in the combined text content,
 * parses it, and validates against a TypeBox schema.
 *
 * @param content - The LLM response content blocks.
 * @param schema - TypeBox schema to validate against.
 * @returns The parsed and validated result, or `null` if extraction or validation fails.
 */
export function extractJsonFromResponse<T extends TSchema>(
  content: ReadonlyArray<{ type: string; text?: string }>,
  schema: T,
): { parsed: import("typebox").Static<T> } | null {
  const text = content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (Value.Check(schema, parsed)) {
      return { parsed } as { parsed: import("typebox").Static<T> };
    }
    return null;
  } catch {
    return null;
  }
}

// ── callWithJsonResponse ───────────────────────────────────────────────────

/**
 * Options for {@link callWithJsonResponse}.
 */
export interface CallWithJsonResponseOptions {
  /** The prompt to send to the LLM. */
  prompt: string;
  /** Optional data context appended to the prompt. */
  dataContext?: string;
  /** Maximum tokens for the response. Default: 4096 */
  maxTokens?: number;
  /** System prompt for the LLM call. Default: "" */
  systemPrompt?: string;
  /** Number of retries for the LLM call. Default: 2 */
  retries?: number;
}

/**
 * Call the LLM with a prompt and validate the JSON response against a TypeBox schema.
 *
 * Handles model resolution, auth, retry via `withRetry`, text extraction,
 * JSON regex matching, and TypeBox validation.
 *
 * Returns `null` when:
 * - No model is available
 * - All retries fail
 * - Response contains no valid JSON
 * - JSON doesn't match the schema
 * - The request is aborted
 *
 * @param ctx - The extension context for model resolution and auth.
 * @param options - Call options including prompt, schema, and retry config.
 * @param schema - TypeBox schema to validate the JSON response against.
 * @returns The parsed and validated result, or `null`.
 */
export async function callWithJsonResponse<T extends TSchema>(
  ctx: ExtensionContext,
  options: CallWithJsonResponseOptions,
  schema: T,
): Promise<{ parsed: import("typebox").Static<T> } | null> {
  const { prompt, dataContext, maxTokens = 4096, systemPrompt = "", retries = 2 } = options;

  const model = ctx.model ?? ctx.modelRegistry.getAvailable()[0] ?? null;
  if (!model) return null;

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok || !auth.apiKey) return null;

  const fullPrompt = dataContext
    ? `${prompt}

DATA:
${dataContext}`
    : prompt;

  const response = await withRetry(
    async () => {
      return complete(
        model,
        {
          systemPrompt,
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: fullPrompt }],
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey: auth.apiKey,
          headers: auth.headers,
          signal: ctx.signal,
          maxTokens,
        },
      );
    },
    { retries, baseDelayMs: 1000, signal: ctx.signal },
  );

  if (!response) return null;

  return extractJsonFromResponse(response.content, schema);
}
