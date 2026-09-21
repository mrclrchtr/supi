import {
  type Api,
  type AssistantMessage,
  type Context,
  createAssistantMessageEventStream,
  createProvider,
  InMemoryCredentialStore,
  type Model,
  type ModelsApiStreamOptions,
  type ProviderHeaders,
  Type,
} from "@earendil-works/pi-ai";
import {
  type ExtensionContext,
  ModelRegistry,
  ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type CompleteModelRequestOptions,
  callWithJsonResponse,
  completeModelRequest,
  completeSimpleModelRequest,
} from "../../src/llm.ts";

const makeModel = (overrides: Partial<Model<Api>> = {}): Model<Api> => ({
  id: "test-model",
  name: "Test model",
  api: "openai-completions",
  provider: "test-provider",
  baseUrl: "https://example.test/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 4096,
  ...overrides,
});

const makeResponse = (): AssistantMessage => ({
  role: "assistant",
  content: [{ type: "text", text: "ok" }],
  api: "openai-completions",
  provider: "test-provider",
  model: "test-model",
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
});

const makeContext = (text = "prompt"): Context => ({
  messages: [
    {
      role: "user",
      content: [{ type: "text", text }],
      timestamp: 1,
    },
  ],
});

function createRegistry() {
  return { complete: vi.fn().mockResolvedValue(makeResponse()) };
}

type RegistryMock = ReturnType<typeof createRegistry>;

function makeExtensionContext(
  registry: RegistryMock | ExtensionContext["modelRegistry"],
  sessionId = "pi-session",
  signal?: AbortSignal,
): ExtensionContext {
  return makeCtx({
    modelRegistry: registry,
    sessionManager: { getSessionId: () => sessionId },
    signal,
  }) as unknown as ExtensionContext;
}

function getRequestOptions(registry: RegistryMock, index = 0): ModelsApiStreamOptions<Api> {
  const call = registry.complete.mock.calls[index];
  if (!call) throw new Error(`Missing complete() call at index ${index}`);
  return call[2] as ModelsApiStreamOptions<Api>;
}

async function getTransformedHeaders(
  registry: RegistryMock,
  input: ProviderHeaders,
  index = 0,
): Promise<ProviderHeaders> {
  const transformHeaders = getRequestOptions(registry, index).transformHeaders;
  if (!transformHeaders) throw new Error("Missing transformHeaders option");
  return transformHeaders(input);
}

describe("completeModelRequest", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uses stable opaque identities and separates request streams", async () => {
    const registry = createRegistry();
    const model = makeModel();
    const ctx = makeExtensionContext(registry);
    const options = {
      affinityScope: "insights:extraction",
    } satisfies CompleteModelRequestOptions<Api>;

    await completeModelRequest(ctx, model, makeContext("first prompt"), options);
    await completeModelRequest(ctx, model, makeContext("second prompt"), options);
    await completeModelRequest(
      makeExtensionContext(registry, "other-session"),
      model,
      makeContext(),
      options,
    );
    await completeModelRequest(ctx, model, makeContext(), {
      affinityScope: "insights:chunk-summary",
    });
    await completeModelRequest(
      ctx,
      makeModel({ provider: "other-provider", id: "other-model" }),
      makeContext(),
      options,
    );

    const ids = registry.complete.mock.calls.map(
      (call) => (call[2] as ModelsApiStreamOptions<Api>).sessionId,
    );
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).not.toBe(ids[2]);
    expect(ids[0]).not.toBe(ids[3]);
    expect(ids[0]).not.toBe(ids[4]);
    expect(ids[0]).toHaveLength(61);
    expect(ids[0]).not.toContain("pi-session");
    expect(ids[0]).not.toContain("insights");
  });

  it("owns session and auth request fields", async () => {
    const registry = createRegistry();
    const ctx = makeExtensionContext(registry, "session-id");
    const unsafeOptions = {
      affinityScope: "test",
      apiKey: "caller-key",
      env: { SECRET: "caller-value" },
      sessionId: "caller-session",
      maxTokens: 123,
    } as unknown as CompleteModelRequestOptions<Api>;

    await completeModelRequest(ctx, makeModel(), makeContext(), unsafeOptions);

    const request = getRequestOptions(registry);
    expect(request.sessionId).not.toBe("caller-session");
    expect(request.sessionId).toHaveLength(61);
    expect("apiKey" in request).toBe(false);
    expect("env" in request).toBe(false);
    expect(request.maxTokens).toBe(123);
  });

  it("adds OpenCode defaults for provider and exact-host aliases", async () => {
    const cases = [
      makeModel({ provider: "opencode" }),
      makeModel({ provider: "opencode-go" }),
      makeModel({ provider: "custom", baseUrl: "https://opencode.ai/v1" }),
    ];
    const registry = createRegistry();
    const ctx = makeExtensionContext(registry);

    for (const [index, model] of cases.entries()) {
      await completeModelRequest(ctx, model, makeContext(), {
        affinityScope: `test-${index}`,
      });
      const headers = await getTransformedHeaders(registry, {}, index);
      expect(headers["x-opencode-session"]).toBe(getRequestOptions(registry, index).sessionId);
      expect(headers["x-opencode-client"]).toBe("pi");
    }
  });

  it("preserves case-insensitive overrides and null deletion markers", async () => {
    const registry = createRegistry();
    const ctx = makeExtensionContext(registry);
    const model = makeModel({ provider: "opencode" });

    await completeModelRequest(ctx, model, makeContext(), {
      affinityScope: "test",
      headers: {
        "X-OpenCode-Session": "configured-session",
        "X-OPENCODE-CLIENT": null,
      },
    });

    const headers = await getTransformedHeaders(registry, {
      Authorization: "resolved-auth",
      "X-OpenCode-Session": "configured-session",
      "X-OPENCODE-CLIENT": null,
    });
    expect(headers).toEqual({
      Authorization: "resolved-auth",
      "X-OpenCode-Session": "configured-session",
      "X-OPENCODE-CLIENT": null,
    });
  });

  it("does not add OpenCode defaults to unrelated hosts", async () => {
    const registry = createRegistry();
    const ctx = makeExtensionContext(registry);

    await completeModelRequest(
      ctx,
      makeModel({ provider: "custom", baseUrl: "https://api.opencode.ai/v1" }),
      makeContext(),
      { affinityScope: "test" },
    );

    const headers = await getTransformedHeaders(registry, {
      "X-Existing": "value",
    });
    expect(headers).toEqual({ "X-Existing": "value" });
  });

  it("forwards cancellation and does not hide request errors", async () => {
    const controller = new AbortController();
    const error = new Error("controlled request failure");
    const registry = {
      complete: vi.fn().mockImplementation(async (_model, _context, options) => {
        expect(options.signal).toBe(controller.signal);
        throw error;
      }),
    };

    await expect(
      completeModelRequest(
        makeExtensionContext(registry, "session-id"),
        makeModel(),
        makeContext(),
        { affinityScope: "test", signal: controller.signal },
      ),
    ).rejects.toBe(error);
  });

  it("forwards an aborted signal without doing a preflight", async () => {
    const controller = new AbortController();
    controller.abort();
    const registry = {
      complete: vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")),
    };

    await expect(
      completeModelRequest(makeExtensionContext(registry), makeModel(), makeContext(), {
        affinityScope: "test",
        signal: controller.signal,
      }),
    ).rejects.toThrow("Aborted");
    expect(registry.complete).toHaveBeenCalledTimes(1);
    expect(getRequestOptions(registry).signal).toBe(controller.signal);
  });

  it("returns null for unconfigured auth without retry delays", async () => {
    vi.useFakeTimers();
    const runtime = await ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
      refreshOnCreate: false,
    });
    const model = makeModel();
    const resolve = vi.fn(async () => undefined);
    const stream = vi.fn(() => createAssistantMessageEventStream());
    runtime.registerNativeProvider(
      createProvider({
        id: model.provider,
        models: [model],
        auth: { apiKey: { name: "Unconfigured test provider", resolve } },
        api: { stream, streamSimple: stream },
      }),
    );
    const ctx = { ...makeExtensionContext(new ModelRegistry(runtime)), model };

    await expect(
      callWithJsonResponse(
        ctx,
        { prompt: "test", affinityScope: "test:json" },
        Type.Object({ ok: Type.Boolean() }),
      ),
    ).resolves.toBeNull();
    expect(resolve).toHaveBeenCalledOnce();
    expect(stream).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { name: "API-specific", request: completeModelRequest },
    { name: "simple", request: completeSimpleModelRequest },
  ])("uses real $name requests for endpoint, environment, and headers", async ({ request }) => {
    const runtime = await ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
      refreshOnCreate: false,
    });
    let authResolutions = 0;
    let capturedModel: Model<Api> | undefined;
    let capturedOptions: ModelsApiStreamOptions<Api> | undefined;
    const controlledModel = makeModel({
      provider: "controlled-provider",
      baseUrl: "https://opencode.ai/catalog",
    });

    const stream = (
      resolvedModel: Model<Api>,
      _context: Context,
      options?: ModelsApiStreamOptions<Api>,
    ) => {
      capturedModel = resolvedModel;
      capturedOptions = options;
      const eventStream = createAssistantMessageEventStream();
      const response = makeResponse();
      response.api = resolvedModel.api;
      response.provider = resolvedModel.provider;
      response.model = resolvedModel.id;
      eventStream.push({ type: "start", partial: response });
      eventStream.push({ type: "done", reason: "stop", message: response });
      eventStream.end();
      return eventStream;
    };

    runtime.registerNativeProvider(
      createProvider({
        id: "controlled-provider",
        models: [controlledModel],
        auth: {
          apiKey: {
            name: "Controlled provider",
            check: async () => ({ source: "controlled", type: "api_key" }),
            resolve: async ({ signal }) => {
              signal.throwIfAborted();
              authResolutions++;
              return {
                source: "controlled",
                auth: {
                  apiKey: "resolved-key",
                  baseUrl: "https://dynamic.example/v1",
                  headers: { "X-Auth": "resolved" },
                },
                env: { CONTROLLED_REGION: "test" },
              };
            },
          },
        },
        api: { stream, streamSimple: stream },
      }),
    );

    await request(
      makeExtensionContext(new ModelRegistry(runtime), "runtime-session"),
      controlledModel,
      makeContext(),
      { affinityScope: "runtime", headers: { "X-Explicit": "yes" } },
    );

    expect(authResolutions).toBe(1);
    expect(capturedModel?.baseUrl).toBe("https://dynamic.example/v1");
    expect(capturedOptions?.apiKey).toBe("resolved-key");
    expect(capturedOptions?.env).toEqual({ CONTROLLED_REGION: "test" });
    expect(capturedOptions?.headers).toMatchObject({
      "X-Auth": "resolved",
      "X-Explicit": "yes",
      "x-opencode-client": "pi",
    });
    expect(capturedOptions?.headers?.["x-opencode-session"]).toMatch(/^supi-/u);
  });
});
