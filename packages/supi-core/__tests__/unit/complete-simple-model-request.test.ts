import type {
  Api,
  AssistantMessage,
  Context,
  Model,
  ModelsSimpleStreamOptions,
} from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
import {
  type CompleteSimpleModelRequestOptions,
  completeModelRequest,
  completeSimpleModelRequest,
} from "../../src/llm.ts";

const MODEL: Model<Api> = {
  id: "test-model",
  name: "Test model",
  api: "openai-completions",
  provider: "opencode",
  baseUrl: "https://opencode.ai/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 4096,
};
const CONTEXT: Context = { messages: [{ role: "user", content: "test", timestamp: 1 }] };

function makeFixture(signal?: AbortSignal) {
  const result = vi.fn<() => Promise<AssistantMessage>>();
  const streamSimple = vi.fn((_model, _context, _options: ModelsSimpleStreamOptions) => ({
    result,
  }));
  const complete = vi.fn();
  const ctx = makeCtx({
    modelRegistry: { complete, streamSimple },
    sessionManager: { getSessionId: () => "pi-session" },
    signal,
  }) as unknown as ExtensionContext;
  return { ctx, result, complete, streamSimple };
}

describe("completeSimpleModelRequest", () => {
  it("uses only registry streamSimple and awaits its result", async () => {
    const { ctx, streamSimple, complete, result } = makeFixture();
    const response = {
      stopReason: "error",
      errorMessage: "controlled failure",
    } as AssistantMessage;
    result.mockResolvedValue(response);

    await expect(
      completeSimpleModelRequest(ctx, MODEL, CONTEXT, { affinityScope: "test" }),
    ).resolves.toBe(response);
    expect(streamSimple).toHaveBeenCalledOnce();
    expect(streamSimple.mock.calls[0]?.slice(0, 2)).toEqual([MODEL, CONTEXT]);
    expect(streamSimple.mock.calls[0]?.[2]).not.toHaveProperty("maxTokens");
    expect(complete).not.toHaveBeenCalled();
    expect(result).toHaveBeenCalledOnce();
  });

  it("keeps identity stable across prompts and completion paths", async () => {
    const { ctx, streamSimple, complete } = makeFixture();
    const options = { affinityScope: "prompt-suggestions" };
    await completeSimpleModelRequest(ctx, MODEL, CONTEXT, options);
    await completeSimpleModelRequest(ctx, MODEL, { messages: [] }, options);
    await completeModelRequest(ctx, MODEL, CONTEXT, options);
    await completeSimpleModelRequest(ctx, MODEL, CONTEXT, { affinityScope: "other" });

    const ids = streamSimple.mock.calls.map((call) => call[2].sessionId);
    expect(ids[0]).toMatch(/^supi-/u);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).toBe(complete.mock.calls[0]?.[2].sessionId);
    expect(ids[0]).not.toBe(ids[2]);
  });

  it("owns auth and identity while preserving simple options and explicit cancellation", async () => {
    const fallbackSignal = new AbortController().signal;
    const signal = new AbortController().signal;
    const { ctx, streamSimple } = makeFixture(fallbackSignal);
    const options = {
      affinityScope: "test",
      apiKey: "caller-key",
      env: { REGION: "caller-region" },
      sessionId: "caller-session",
      maxTokens: 123,
      reasoning: "low",
      signal,
    } as unknown as CompleteSimpleModelRequestOptions;
    await completeSimpleModelRequest(ctx, MODEL, CONTEXT, options);

    const request = streamSimple.mock.calls[0]?.[2];
    expect(request).toMatchObject({ maxTokens: 123, reasoning: "low", signal });
    expect(request).not.toHaveProperty("apiKey");
    expect(request).not.toHaveProperty("env");
    expect(request?.sessionId).not.toBe("caller-session");
    expect(request).not.toHaveProperty("affinityScope");
  });

  it("uses the context signal and preserves rejected results", async () => {
    const controller = new AbortController();
    controller.abort();
    const { ctx, streamSimple, result } = makeFixture(controller.signal);
    const error = new DOMException("Aborted", "AbortError");
    result.mockRejectedValue(error);

    await expect(
      completeSimpleModelRequest(ctx, MODEL, CONTEXT, { affinityScope: "test" }),
    ).rejects.toBe(error);
    expect(streamSimple.mock.calls[0]?.[2].signal).toBe(controller.signal);
  });

  it("preserves registry setup failures", async () => {
    const { ctx, streamSimple } = makeFixture();
    const error = new Error("controlled setup failure");
    streamSimple.mockImplementation(() => {
      throw error;
    });
    await expect(
      completeSimpleModelRequest(ctx, MODEL, CONTEXT, { affinityScope: "test" }),
    ).rejects.toBe(error);
  });

  it("applies the caller header transform before OpenCode defaults", async () => {
    const { ctx, streamSimple } = makeFixture();
    const transformHeaders = vi.fn(async (headers) => ({
      ...headers,
      "X-OpenCode-Session": "configured",
      "X-OPENCODE-CLIENT": null,
    }));
    await completeSimpleModelRequest(ctx, MODEL, CONTEXT, {
      affinityScope: "test",
      transformHeaders,
    });
    const transform = streamSimple.mock.calls[0]?.[2].transformHeaders;
    expect(transform).toBeDefined();
    await expect(transform?.({ "X-Auth": "resolved" })).resolves.toEqual({
      "X-Auth": "resolved",
      "X-OpenCode-Session": "configured",
      "X-OPENCODE-CLIENT": null,
    });
    expect(transformHeaders).toHaveBeenCalledOnce();
  });
});
