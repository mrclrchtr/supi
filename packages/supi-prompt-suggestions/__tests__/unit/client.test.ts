import type { Api, AssistantMessage, Context, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPrompt, callSuggestionModel } from "../../src/generation/client.ts";

// biome-ignore lint/security/noSecrets: This is a provider error type, not a credential.
const GO_USAGE_LIMIT_ERROR = "GoUsageLimitError";

const MODEL: Model<Api> = {
  id: "suggestion-model",
  name: "Suggestion model",
  api: "openai-completions",
  provider: "test-provider",
  baseUrl: "https://provider.example/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 256,
};

function makeResponse(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: "next" }],
    api: MODEL.api,
    provider: MODEL.provider,
    model: MODEL.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeClientContext(response: AssistantMessage | Promise<AssistantMessage>) {
  const complete = vi.fn().mockReturnValue(response);
  const ctx = makeCtx({
    modelRegistry: { complete },
    sessionManager: { getSessionId: () => "pi-session" },
  }) as unknown as ExtensionContext;
  return { ctx, complete };
}

describe("buildPrompt", () => {
  it("includes the tail text inside assistant_message tags", () => {
    const prompt = buildPrompt("some assistant text");
    expect(prompt).toContain("<assistant_message>\nsome assistant text\n</assistant_message>");
  });

  it("ends with the Suggestion: trigger", () => {
    const prompt = buildPrompt("text");
    expect(prompt).toMatch(/Suggestion:\s*$/);
  });

  it("formats the assistant message only, no inline instructions", () => {
    const prompt = buildPrompt("do X");
    expect(prompt).toBe("<assistant_message>\ndo X\n</assistant_message>\n\nSuggestion:");
  });
});

describe("callSuggestionModel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the PI registry request path with the fixed prompt and context clamp", async () => {
    const signal = new AbortController().signal;
    const { ctx, complete } = makeClientContext(Promise.resolve(makeResponse()));

    const result = await callSuggestionModel({ ctx, model: MODEL, tail: "assistant text", signal });

    expect(result).toEqual({ ok: true, text: "next" });
    expect(complete).toHaveBeenCalledOnce();
    const [model, context, options] = complete.mock.calls[0] as [
      Model<Api>,
      Context,
      Record<string, unknown>,
    ];
    expect(model).toBe(MODEL);
    expect(context.messages[0]).toMatchObject({
      content: [{ type: "text", text: buildPrompt("assistant text") }],
    });
    expect(options).toMatchObject({ signal });
    expect(options.sessionId).toMatch(/^supi-/u);
    expect(options.maxTokens).toBe(256);
    expect(options).not.toHaveProperty("apiKey");
    expect(options).not.toHaveProperty("env");
  });

  it("treats a valid empty response as a successful empty suggestion", async () => {
    const { ctx } = makeClientContext(Promise.resolve(makeResponse({ content: [] })));

    await expect(
      callSuggestionModel({
        ctx,
        model: MODEL,
        tail: "assistant text",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ ok: true, text: "" });
  });

  it.each([
    {
      errorMessage: "401 invalid api key sk-live-provider-secret",
      failure: { kind: "authentication", httpStatus: 401, summary: "authentication failed" },
    },
    {
      errorMessage: "Provider is not configured: test-provider sk-live-provider-secret",
      failure: { kind: "authentication", summary: "authentication failed" },
    },
  ])(
    "classifies runtime authentication failure: $errorMessage",
    async ({ errorMessage, failure }) => {
      const { ctx } = makeClientContext(
        Promise.resolve(
          makeResponse({
            content: [],
            stopReason: "error",
            errorMessage,
          }),
        ),
      );

      const result = await callSuggestionModel({
        ctx,
        model: MODEL,
        tail: "assistant text",
        signal: new AbortController().signal,
      });

      expect(result).toEqual({ ok: false, failure });
      expect(JSON.stringify(result)).not.toContain("sk-live-provider-secret");
    },
  );

  it.each([
    {
      name: "billing 401",
      errorMessage: '401 {"error":{"type":"BillingError","message":"account access denied"}}',
      failure: { kind: "billing", httpStatus: 401, summary: "billing failed" },
    },
    {
      name: "billing 429",
      errorMessage: '429 {"error":{"code":"billing_required","message":"account access denied"}}',
      failure: { kind: "billing", httpStatus: 429, summary: "billing failed" },
    },
    {
      name: "quota code",
      errorMessage: '{"error":{"code":"insufficient_quota","message":"request rejected"}}',
      failure: { kind: "quota", summary: "quota exceeded" },
    },
    {
      name: "quota code with a billing wrapper",
      errorMessage: '429 {"error":{"type":"BillingError","code":"insufficient_quota"}}',
      failure: { kind: "quota", httpStatus: 429, summary: "quota exceeded" },
    },
    {
      name: "quota text with a billing wrapper",
      errorMessage: '429 {"error":{"message":"BillingError: insufficient_quota"}}',
      failure: { kind: "quota", httpStatus: 429, summary: "quota exceeded" },
    },
    {
      name: "HTTP status line",
      errorMessage: "HTTP/1.1 401 Unauthorized",
      failure: { kind: "authentication", httpStatus: 401, summary: "authentication failed" },
    },
    {
      name: "quota usage limit",
      errorMessage: `429 {"error":{"type":"${GO_USAGE_LIMIT_ERROR}","message":"available balance"}}`,
      failure: { kind: "quota", httpStatus: 429, summary: "quota exceeded" },
    },
    {
      name: "generic 429",
      errorMessage: '429 {"error":{"message":"too many requests"}}',
      failure: { kind: "rate-limit", httpStatus: 429, summary: "rate limit exceeded" },
    },
    {
      name: "plain 401 auth",
      errorMessage: '401 {"error":{"message":"invalid api key"}}',
      failure: { kind: "authentication", httpStatus: 401, summary: "authentication failed" },
    },
    {
      name: "plain 403 auth",
      errorMessage: '403 {"error":{"message":"forbidden"}}',
      failure: { kind: "authentication", httpStatus: 403, summary: "authentication failed" },
    },
  ])("classifies $name before HTTP fallbacks", async ({ errorMessage, failure }) => {
    const { ctx } = makeClientContext(
      Promise.resolve(makeResponse({ content: [], stopReason: "error", errorMessage })),
    );

    await expect(
      callSuggestionModel({
        ctx,
        model: MODEL,
        tail: "assistant text",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ ok: false, failure });
  });

  it.each([
    {
      name: "billing code before auth status",
      error: { status: 401, code: "billing_required", message: "access denied" },
      failure: { kind: "billing", httpStatus: 401, summary: "billing failed" },
    },
    {
      name: "quota code before rate status",
      error: { status: 429, code: "insufficient_quota", message: "request rejected" },
      failure: { kind: "quota", httpStatus: 429, summary: "quota exceeded" },
    },
    {
      name: "direct error_type",
      error: { status: 401, error_type: "billing_required", message: "access denied" },
      failure: { kind: "billing", httpStatus: 401, summary: "billing failed" },
    },
    {
      name: "status",
      error: Object.assign(new Error("gateway rejected"), { status: 418 }),
      failure: { kind: "request", httpStatus: 418, summary: "provider request failed" },
    },
    {
      name: "statusCode",
      error: { statusCode: 503, message: "gateway rejected" },
      failure: { kind: "request", httpStatus: 503, summary: "provider request failed" },
    },
    {
      name: "non-HTTP numeric code",
      error: { code: "422", message: "gateway rejected" },
      failure: { kind: "request", summary: "provider request failed" },
    },
  ])("keeps a validated status from a rejected request: $name", async ({ error, failure }) => {
    const { ctx } = makeClientContext(Promise.reject(error));

    await expect(
      callSuggestionModel({
        ctx,
        model: MODEL,
        tail: "assistant text",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ ok: false, failure });
  });

  it.each([
    "provider request failed",
    "600 provider request failed",
    "401_foo request id",
    "request id req-401 at https://provider.example/models/429/status:429",
    "process exit code 500",
    '{"code":500,"message":"internal failure"}',
    "request failed at https://provider.example/HTTP/1.1 401",
  ])("does not retain an absent or invalid status: %s", async (errorMessage) => {
    const { ctx } = makeClientContext(
      Promise.resolve(makeResponse({ content: [], stopReason: "error", errorMessage })),
    );

    await expect(
      callSuggestionModel({
        ctx,
        model: MODEL,
        tail: "assistant text",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      ok: false,
      failure: { kind: "request", summary: "provider request failed" },
    });
  });

  it("does not retain provider bodies, URLs, or credentials", async () => {
    const secret = "sk-live-provider-secret";
    const { ctx } = makeClientContext(
      Promise.resolve(
        makeResponse({
          content: [],
          stopReason: "error",
          errorMessage: `401 {"error":{"code":"billing_required","message":"${secret}","url":"https://provider.example/billing"}}`,
        }),
      ),
    );

    const result = await callSuggestionModel({
      ctx,
      model: MODEL,
      tail: "assistant text",
      signal: new AbortController().signal,
    });

    expect(result).toEqual({
      ok: false,
      failure: { kind: "billing", httpStatus: 401, summary: "billing failed" },
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("provider.example");
  });

  it.each([
    { contextWindow: 128_000, expected: 8192 },
    { contextWindow: 4096, expected: 1 },
  ])(
    "keeps model limits within context window $contextWindow",
    async ({ contextWindow, expected }) => {
      const { ctx, complete } = makeClientContext(makeResponse());
      await callSuggestionModel({
        ctx,
        model: { ...MODEL, maxTokens: 8192, contextWindow },
        tail: "assistant text",
        signal: new AbortController().signal,
      });
      expect(complete.mock.calls[0]?.[2]).toMatchObject({ maxTokens: expected });
    },
  );

  it("classifies an aborted provider response as a timeout", async () => {
    const { ctx } = makeClientContext(
      Promise.resolve(makeResponse({ content: [], stopReason: "aborted" })),
    );

    await expect(
      callSuggestionModel({
        ctx,
        model: MODEL,
        tail: "assistant text",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      ok: false,
      failure: { kind: "timeout", summary: "request timed out" },
    });
  });
});
