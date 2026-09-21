import { createProvider, InMemoryCredentialStore, type Model } from "@earendil-works/pi-ai";
// Node tests can resolve this package export; the extension uses only the registry.
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import {
  type ExtensionContext,
  ModelRegistry,
  ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { expect, it, vi } from "vitest";
import { callSuggestionModel } from "../../src/generation/client.ts";

it.each([
  { contextWindow: 128_000, maxTokens: 8192, expected: 8192 },
  { contextWindow: 4096, maxTokens: 8192, expected: 1 },
  { contextWindow: 0, maxTokens: 8192, expected: 8192 },
  { contextWindow: 128_000, maxTokens: 256, expected: 256 },
])(
  "uses PI output limits for context $contextWindow and model cap $maxTokens",
  async ({ contextWindow, maxTokens, expected }) => {
    const model: Model<"openai-completions"> = {
      id: "suggestion-model",
      name: "Suggestion model",
      api: "openai-completions",
      provider: "controlled-suggestions",
      baseUrl: "https://provider.example/v1",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow,
      maxTokens,
      compat: { maxTokensField: "max_tokens" },
    };
    const payloads: unknown[] = [];
    const fetch = vi.fn(
      async () =>
        new Response(
          `data: ${JSON.stringify({
            id: "test-completion",
            choices: [{ index: 0, delta: { content: "next" }, finish_reason: "stop" }],
          })}\n\ndata: [DONE]\n\n`,
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
    const api = openAICompletionsApi();
    const runtime = await ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
      refreshOnCreate: false,
    });
    runtime.registerNativeProvider(
      createProvider({
        id: model.provider,
        models: [model],
        auth: {
          apiKey: { name: "Controlled", resolve: async () => ({ auth: { apiKey: "test-key" } }) },
        },
        api: {
          stream: () => {
            throw new Error("Expected the simple request path");
          },
          streamSimple: (resolvedModel, context, options) =>
            api.streamSimple(resolvedModel, context, {
              ...options,
              fetch,
              maxRetries: 0,
              onPayload: (payload) => {
                payloads.push(payload);
              },
            }),
        },
      }),
    );
    const ctx = makeCtx({
      modelRegistry: new ModelRegistry(runtime),
      sessionManager: { getSessionId: () => "pi-session" },
    }) as unknown as ExtensionContext;

    await expect(
      callSuggestionModel({
        ctx,
        model,
        tail: "x".repeat(8000),
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ ok: true, text: "next" });
    expect(fetch).toHaveBeenCalledOnce();
    expect(payloads).toEqual([expect.objectContaining({ max_tokens: expected })]);
  },
);
