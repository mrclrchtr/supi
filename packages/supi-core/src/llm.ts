import { createHash } from "node:crypto";
import type {
  Api,
  AssistantMessage,
  Context,
  Model,
  ModelsApiStreamOptions,
  ProviderHeaders,
} from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";

// Shared LLM utilities for SuPi extensions.
//
// Provides PI-owned model requests, retry logic, structured LLM call helpers,
// and other common patterns for extensions that interact with AI models.

const MODEL_REQUEST_NAMESPACE = "supi-direct-model-request-v1";

/**
 * Options for {@link completeModelRequest}.
 *
 * Authentication, provider environment, and session identity stay under PI
 * control. The feature supplies a stable scope for its prompt stream.
 */
export type CompleteModelRequestOptions<TApi extends Api = Api> = Omit<
  ModelsApiStreamOptions<TApi>,
  "apiKey" | "env" | "sessionId"
> & {
  /** Stable feature scope. Do not include prompt, turn, or retry data. */
  affinityScope: string;
  /** PI owns these fields, including for APIs with open-ended option types. */
  apiKey?: never;
  env?: never;
  sessionId?: never;
};

function createModelRequestAffinityId(
  sessionId: string,
  affinityScope: string,
  model: Model<Api>,
): string {
  const material = JSON.stringify([
    MODEL_REQUEST_NAMESPACE,
    sessionId,
    affinityScope,
    model.provider,
    model.id,
  ]);
  const digest = createHash("sha256").update(material, "utf8").digest("hex");
  return `supi-${digest.slice(0, 56)}`;
}

function isOpenCodeModel(model: Model<Api>): boolean {
  if (model.provider === "opencode" || model.provider === "opencode-go") return true;

  try {
    return new URL(model.baseUrl).hostname === "opencode.ai";
  } catch {
    return false;
  }
}

function hasHeader(headers: ProviderHeaders, name: string): boolean {
  const lowerName = name.toLowerCase();
  return Object.keys(headers).some((headerName) => headerName.toLowerCase() === lowerName);
}

function addOpenCodeDefaultHeaders(
  model: Model<Api>,
  affinityId: string,
  headers: ProviderHeaders,
): ProviderHeaders {
  if (!isOpenCodeModel(model)) return headers;

  const result = { ...headers };
  if (!hasHeader(result, "x-opencode-session")) {
    result["x-opencode-session"] = affinityId;
  }
  if (!hasHeader(result, "x-opencode-client")) {
    result["x-opencode-client"] = "pi";
  }
  return result;
}

/**
 * Complete a direct request through PI's model registry.
 *
 * PI resolves authentication, provider headers, environment, and the
 * effective endpoint. This helper adds one stable opaque session identity for
 * the feature prompt stream and applies the OpenCode compatibility defaults.
 * It does not retry, validate output, or present errors.
 *
 * When `maxTokens` is omitted, the underlying registry receives no explicit
 * output cap. A caller that needs the selected model's declared cap can pass
 * `maxTokens: model.maxTokens` without importing PI internals.
 */
export async function completeModelRequest<TApi extends Api>(
  ctx: ExtensionContext,
  model: Model<TApi>,
  context: Context,
  options: CompleteModelRequestOptions<TApi>,
): Promise<AssistantMessage> {
  const { affinityScope, transformHeaders: callerTransformHeaders, ...requestOptions } = options;
  const safeRequestOptions = { ...requestOptions };
  delete safeRequestOptions.apiKey;
  delete safeRequestOptions.env;
  delete safeRequestOptions.sessionId;

  const affinityId = createModelRequestAffinityId(
    ctx.sessionManager.getSessionId(),
    affinityScope,
    model,
  );
  const transformHeaders = async (headers: ProviderHeaders): Promise<ProviderHeaders> => {
    const transformed = callerTransformHeaders ? await callerTransformHeaders(headers) : headers;
    return addOpenCodeDefaultHeaders(model, affinityId, transformed);
  };

  // Restore PI's conditional provider-option type after removing owned fields.
  return ctx.modelRegistry.complete(model, context, {
    ...safeRequestOptions,
    signal: safeRequestOptions.signal ?? ctx.signal,
    sessionId: affinityId,
    transformHeaders,
  } as unknown as ModelsApiStreamOptions<TApi>);
}

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
  /** Stable feature scope for request affinity. Do not include prompt or retry data. */
  affinityScope: string;
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
 * Handles model resolution, retry via `withRetry`, text extraction, JSON
 * matching, and TypeBox validation. The request itself stays under PI
 * registry authority through {@link completeModelRequest}.
 *
 * Returns `null` when:
 * - No model is available
 * - All retries fail
 * - Response contains no valid JSON
 * - JSON doesn't match the schema
 * - The request is aborted
 *
 * @param ctx - The extension context for model selection and PI registry access.
 * @param options - Call options including prompt, schema, and retry config.
 * @param schema - TypeBox schema to validate the JSON response against.
 * @returns The parsed and validated result, or `null`.
 */
export async function callWithJsonResponse<T extends TSchema>(
  ctx: ExtensionContext,
  options: CallWithJsonResponseOptions,
  schema: T,
): Promise<{ parsed: import("typebox").Static<T> } | null> {
  const {
    prompt,
    affinityScope,
    dataContext,
    maxTokens = 4096,
    systemPrompt = "",
    retries = 2,
  } = options;

  const model = ctx.model ?? ctx.modelRegistry.getAvailable()[0] ?? null;
  if (!model) return null;

  const fullPrompt = dataContext
    ? `${prompt}

DATA:
${dataContext}`
    : prompt;

  const response = await withRetry(
    async () =>
      completeModelRequest(
        ctx,
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
          affinityScope,
          signal: ctx.signal,
          maxTokens,
        },
      ),
    { retries, baseDelayMs: 1000, signal: ctx.signal },
  );

  if (!response) return null;

  return extractJsonFromResponse(response.content, schema);
}
