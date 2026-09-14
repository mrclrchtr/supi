import type { Api, AssistantMessage, Context, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPrompt, callSuggestionModel } from "../../src/generation/client.ts";

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

  it.each(["401 invalid api key", "Provider is not configured: test-provider"])(
    "classifies runtime authentication failure: %s",
    async (errorMessage) => {
      const secret = "sk-live-provider-secret";
      const { ctx } = makeClientContext(
        Promise.resolve(
          makeResponse({
            content: [],
            stopReason: "error",
            errorMessage: `${errorMessage} ${secret}`,
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
        failure: { kind: "authentication", summary: "authentication is not configured" },
      });
      expect(JSON.stringify(result)).not.toContain(secret);
    },
  );

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
