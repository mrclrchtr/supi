import {
  type Api,
  type ClassifierApi,
  type ClassifierModel,
  type ClassifierResult,
  createAssistantMessageEventStream,
  type Model,
  type Provider,
  type SimpleStreamOptions,
  type TranscriptContext,
  type Usage,
} from "@earendil-works/pi-ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAgentSession: vi.fn(),
  createAgentSessionRuntime: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", async (original) => ({
  ...(await original()),
  createAgentSession: mocks.createAgentSession,
  createAgentSessionRuntime: mocks.createAgentSessionRuntime,
}));

import {
  type AgentRunProviderAuthority,
  captureAgentRunAuxiliaryModels,
  createAgentRunProviderAuthority,
  startAgentRun,
} from "../../src/api.ts";
import { createAgentRunModelRuntime } from "../../src/provider-authority.ts";
import { createHarness, inputs } from "../helpers/agent-run-harness.ts";

const model = {
  provider: "parent-provider",
  id: "parent-model",
  name: "Parent Model",
  api: "openai-completions" as const,
  baseUrl: "https://parent.example",
  reasoning: false,
  input: ["text"] as ("text" | "image")[],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 10_000,
  maxTokens: 1_000,
};

const parentProvider = {
  id: model.provider,
  name: "Parent Provider",
  baseUrl: "https://parent.example",
  headers: { "x-parent": "yes" },
  auth: {
    apiKey: {
      name: "Parent key",
      resolve: async () => ({ auth: { apiKey: "unused" } }),
    },
  },
  getModels: () => [model],
  stream: vi.fn(),
  streamSimple: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createAgentRunProviderAuthority", () => {
  it("binds the public registry methods without retaining the registry as a context", async () => {
    const registry = {
      getProvider: vi.fn(() => parentProvider),
      getProviderAuth: vi.fn(async () => ({ auth: { apiKey: "runtime-key" } })),
      getApiKeyAndHeaders: vi.fn(async () => ({ ok: true as const, apiKey: "runtime-key" })),
    };
    const authority = createAgentRunProviderAuthority(registry);

    expect(authority.getProvider("parent-provider")).toBe(parentProvider);
    await expect(authority.getProviderAuth("parent-provider")).resolves.toEqual({
      auth: { apiKey: "runtime-key" },
    });
    expect(registry.getProvider).toHaveBeenCalledWith("parent-provider");
    expect(registry.getProviderAuth).toHaveBeenCalledWith("parent-provider");
  });

  it("fails closed to an empty frozen auxiliary snapshot when catalogue lookup fails", async () => {
    const snapshot = await captureAgentRunAuxiliaryModels({
      getProvider: () => undefined,
      getProviderAuth: async () => undefined,
      getAvailableAuxiliaryModels: async () => {
        throw new Error("catalogue unavailable");
      },
    });

    expect(snapshot).toEqual({ classifiers: [], images: [] });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.classifiers)).toBe(true);
    expect(Object.isFrozen(snapshot.images)).toBe(true);
  });

  it("uses request auth for the exact selected chat model", async () => {
    const recoveryModel = { ...model, id: "recovery-model", name: "Recovery Model" };
    const getApiKeyAndHeaders = vi.fn(async (selected: typeof model) => ({
      ok: true as const,
      apiKey: `${selected.id}-key`,
      headers: { "x-model": selected.id },
    }));
    const streamSimple = vi.fn(
      (requestModel: Model<Api>, _context: TranscriptContext, _options?: SimpleStreamOptions) => {
        const stream = createAssistantMessageEventStream();
        const message = {
          role: "assistant" as const,
          content: [{ type: "text" as const, text: "chat response" }],
          api: requestModel.api,
          provider: requestModel.provider,
          model: requestModel.id,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: "stop" as const,
          timestamp: Date.now(),
        };
        queueMicrotask(() => stream.push({ type: "done", reason: "stop", message }));
        return stream;
      },
    );
    const provider: Provider = {
      ...parentProvider,
      getModels: () => [model, recoveryModel],
      streamSimple,
    };
    const authority = createAgentRunProviderAuthority({
      getProvider: () => provider,
      getProviderAuth: async () => ({ auth: { apiKey: "provider-key" } }),
      getApiKeyAndHeaders,
    });
    const { createAgentRunModelRuntime } = await import("../../src/provider-authority.ts");
    const created = await createAgentRunModelRuntime(authority, [
      model as never,
      recoveryModel as never,
    ]);

    expect(created.selectModel(recoveryModel as never)).toBe(true);
    const childModel = created.runtime.getModel(recoveryModel.provider, recoveryModel.id);
    if (!childModel) throw new Error("Expected the authorized recovery model");
    await created.runtime.streamSimple(childModel, { messages: [] }).result();

    expect(getApiKeyAndHeaders).toHaveBeenLastCalledWith(recoveryModel);
    expect(streamSimple.mock.calls[0]?.[0]).toMatchObject({ id: recoveryModel.id });
    expect(streamSimple.mock.calls[0]?.[2]).toMatchObject({
      apiKey: "recovery-model-key",
      headers: { "x-model": "recovery-model" },
    });
  });

  it("does not forward active chat auth to a concurrent auxiliary request", async () => {
    const classifier: ClassifierModel<"typesafe-system-one"> = {
      id: "classifier-model",
      name: "Classifier Model",
      provider: model.provider,
      api: "typesafe-system-one",
      type: "classifier",
      baseUrl: "https://classifier.example/v1",
      input: ["text"],
      headers: { "x-model": "classifier" },
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 10_000,
    };
    const usage: Usage = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
    const chatOptions: SimpleStreamOptions[] = [];
    const getChatRequestAuth = vi.fn(async () => ({
      ok: true as const,
      apiKey: "chat-only-key",
      headers: { "x-chat-only": "chat-only-header" },
      baseUrl: "https://chat-auth.example/v1",
    }));
    const auxiliaryRequests: {
      model: ClassifierModel<ClassifierApi>;
      options?: { signal?: AbortSignal };
    }[] = [];
    const provider: Provider = {
      ...parentProvider,
      streamSimple: (_model, _context, options) => {
        if (options) chatOptions.push(options);
        const stream = createAssistantMessageEventStream();
        const message = {
          role: "assistant" as const,
          content: [{ type: "text" as const, text: "chat response" }],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage,
          stopReason: "stop" as const,
          timestamp: Date.now(),
        };
        queueMicrotask(() => stream.push({ type: "done", reason: "stop", message }));
        return stream;
      },
    };
    const authority: AgentRunProviderAuthority = {
      getProvider: () => provider,
      getProviderAuth: async () => ({ auth: { apiKey: "provider-key" } }),
      getApiKeyAndHeaders: getChatRequestAuth,
      classify: async (requested, _context, options) => {
        auxiliaryRequests.push({ model: requested, options });
        const result: ClassifierResult = {
          api: requested.api,
          provider: requested.provider,
          model: requested.id,
          answers: {},
          stopReason: "stop",
          timestamp: Date.now(),
        };
        return result;
      },
    };
    const created = await createAgentRunModelRuntime(
      authority,
      [model as Model<"openai-completions">],
      {
        classifiers: [classifier],
        images: [],
      },
    );
    const childChatModel = created.runtime.getModel(model.provider, model.id);
    const childClassifier = created.runtime.getModelOfType(
      "classifier",
      classifier.provider,
      classifier.id,
    );
    if (!childChatModel || !childClassifier) throw new Error("Expected authorized child models");
    const controller = new AbortController();
    const classifierContext = {
      state: {},
      questions: {
        approved: {
          type: "bool" as const,
          instructions: "Is it approved?",
          criteria: { true: "Yes", false: "No" },
        },
      },
    };

    await Promise.all([
      created.runtime.streamSimple(childChatModel, { messages: [] }).result(),
      created.runtime.classify(childClassifier, classifierContext, { signal: controller.signal }),
    ]);

    expect(chatOptions[0]).toMatchObject({
      apiKey: "chat-only-key",
      headers: { "x-chat-only": "chat-only-header" },
    });
    expect(getChatRequestAuth).toHaveBeenCalledTimes(1);
    expect(auxiliaryRequests).toEqual([
      { model: classifier, options: { signal: controller.signal } },
    ]);
    expect(JSON.stringify(auxiliaryRequests)).not.toContain("chat-only-key");

    const excluded = await created.runtime.classify(
      { ...childClassifier, id: "not-in-snapshot" },
      classifierContext,
    );
    expect(excluded).toMatchObject({
      stopReason: "error",
      errorMessage: expect.stringContaining("not authorized"),
    });
    expect(auxiliaryRequests).toHaveLength(1);
  });

  it("passes the borrowed provider runtime to the child session", async () => {
    const harness = createHarness(mocks);
    const registry = {
      getProvider: vi.fn(() => parentProvider),
      getProviderAuth: vi.fn(async () => ({ auth: { apiKey: "runtime-key" } })),
      getApiKeyAndHeaders: vi.fn(async () => ({
        ok: true as const,
        apiKey: "runtime-key",
        headers: { "x-parent": null },
      })),
    };
    const run = startAgentRun({
      inputs: inputs(undefined, {
        model,
        providerAuthority: createAgentRunProviderAuthority(registry),
      }),
      prompt: "borrow authority",
      completionResolver: () => "done",
    });

    await expect(run.result).resolves.toMatchObject({ kind: "success", value: "done" });
    const createOptions = mocks.createAgentSession.mock.calls[0]?.[0] as {
      modelRuntime?: {
        getAuth: (selectedModel: typeof model) => Promise<unknown>;
        getProvider: (provider: string) => unknown;
      };
    };
    expect(createOptions.modelRuntime).toBeDefined();
    expect(createOptions.modelRuntime?.getProvider(model.provider)).toMatchObject({
      id: model.provider,
      name: parentProvider.name,
    });
    await expect(createOptions.modelRuntime?.getAuth(model)).resolves.toMatchObject({
      auth: { apiKey: "runtime-key" },
    });
    expect(registry.getApiKeyAndHeaders).not.toHaveBeenCalled();
    expect(harness.runtime.dispose).toHaveBeenCalledTimes(1);
  });
});
