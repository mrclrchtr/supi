import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAssistantMessageEventStream,
  type Model,
  type Provider,
} from "@earendil-works/pi-ai";
import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startAgentRun } from "../../src/api.ts";
import { createAgentRunModelRuntime } from "../../src/provider-authority.ts";

const temporaryDirectories: string[] = [];

const model: Model<"openai-completions"> = {
  id: "borrowed-model",
  name: "Borrowed Model",
  provider: "borrowed-provider",
  api: "openai-completions",
  baseUrl: "https://child.example/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 10_000,
  maxTokens: 1_000,
};

const parentCatalogModel: Model<"openai-completions"> = {
  ...model,
  name: "Parent Catalog Model",
  baseUrl: "https://catalog.example/v1",
};

const resolvedBaseUrl = "https://resolved.example/v1";

const usage = {
  input: 2,
  output: 3,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 5,
  cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, total: 3 },
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Agent Run Provider Authority contract", () => {
  it("uses the parent provider and live request auth in a real PI session", async () => {
    const root = await mkdtemp(join(tmpdir(), "supi-agent-authority-"));
    temporaryDirectories.push(root);
    const streamSimple = vi.fn((parentModel, _context, options) => {
      expect(parentModel).toMatchObject({
        name: parentCatalogModel.name,
        baseUrl: resolvedBaseUrl,
      });
      expect(options).toMatchObject({
        apiKey: "parent-runtime-key",
        headers: { "x-model": "yes" },
        env: { PARENT_REGION: "test" },
      });
      const stream = createAssistantMessageEventStream();
      const message = {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "borrowed response" }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage,
        stopReason: "stop" as const,
        timestamp: Date.now(),
      };
      queueMicrotask(() => stream.push({ type: "done", reason: "stop", message }));
      return stream;
    });
    const provider: Provider = {
      id: model.provider,
      name: "Borrowed Provider",
      auth: {
        apiKey: {
          name: "Parent runtime key",
          resolve: async () => ({ auth: { apiKey: "parent-runtime-key" } }),
        },
      },
      getModels: () => [parentCatalogModel],
      stream: (_model, _context, options) => streamSimple(_model, _context, options),
      streamSimple,
    };
    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: false },
    });
    const resourceLoader = new DefaultResourceLoader({
      cwd: root,
      agentDir: root,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: "",
    });
    const run = startAgentRun({
      inputs: {
        cwd: root,
        model,
        providerAuthority: {
          getProvider: () => provider,
          getProviderAuth: async () => ({
            auth: { apiKey: "parent-runtime-key", baseUrl: resolvedBaseUrl },
          }),
          getApiKeyAndHeaders: async () => ({
            ok: true as const,
            apiKey: "parent-runtime-key",
            headers: { "x-model": "yes" },
            env: { PARENT_REGION: "test" },
          }),
        },
        thinkingLevel: "off",
        tools: [],
        resourceLoader,
        settingsManager,
        agentDir: root,
      },
      prompt: "return the borrowed response",
      completionResolver: (session) => session.getLastAssistantText(),
    });

    await expect(run.result).resolves.toMatchObject({
      kind: "success",
      value: "borrowed response",
      usage,
    });
    expect(streamSimple).toHaveBeenCalledTimes(1);
  });

  it("preserves the effective endpoint for both borrowed stream methods", async () => {
    const delegatedModel = (requestModel: Model<"openai-completions">) => {
      const stream = createAssistantMessageEventStream();
      const message = {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "delegated response" }],
        api: requestModel.api,
        provider: requestModel.provider,
        model: requestModel.id,
        usage,
        stopReason: "stop" as const,
        timestamp: Date.now(),
      };
      queueMicrotask(() => stream.push({ type: "done", reason: "stop", message }));
      return stream;
    };
    const stream = vi.fn(delegatedModel);
    const streamSimple = vi.fn(delegatedModel);
    const provider: Provider<"openai-completions"> = {
      id: model.provider,
      name: "Borrowed Provider",
      auth: {
        apiKey: {
          name: "Parent runtime key",
          resolve: async () => ({ auth: { apiKey: "parent-runtime-key" } }),
        },
      },
      getModels: () => [parentCatalogModel],
      stream,
      streamSimple,
    };
    const created = await createAgentRunModelRuntime(
      {
        getProvider: () => provider,
        getProviderAuth: async () => ({
          auth: { apiKey: "parent-runtime-key", baseUrl: resolvedBaseUrl },
        }),
      },
      [model],
    );
    const childModel = created.runtime.getModel(model.provider, model.id);
    if (!childModel) throw new Error("The controlled child model was not registered");

    await created.runtime.stream(childModel, { messages: [] }).result();
    await created.runtime.streamSimple(childModel, { messages: [] }).result();

    expect(stream).toHaveBeenCalledTimes(1);
    expect(streamSimple).toHaveBeenCalledTimes(1);
    expect(stream.mock.calls[0]?.[0]).toMatchObject({
      name: parentCatalogModel.name,
      baseUrl: resolvedBaseUrl,
    });
    expect(streamSimple.mock.calls[0]?.[0]).toMatchObject({
      name: parentCatalogModel.name,
      baseUrl: resolvedBaseUrl,
    });
  });

  it("keeps PI child session IDs stable within a run and separate across sibling runs", async () => {
    const root = await mkdtemp(join(tmpdir(), "supi-agent-session-id-"));
    temporaryDirectories.push(root);
    const sessionIds: string[] = [];
    const respond = (
      requestModel: Model<"openai-completions">,
      options: { sessionId?: string } | undefined,
    ) => {
      const sessionId = options?.sessionId;
      if (!sessionId) throw new Error("The controlled request has no session ID");
      sessionIds.push(sessionId);
      const stream = createAssistantMessageEventStream();
      const message = {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "session response" }],
        api: requestModel.api,
        provider: requestModel.provider,
        model: requestModel.id,
        usage,
        stopReason: "stop" as const,
        timestamp: Date.now(),
      };
      queueMicrotask(() => stream.push({ type: "done", reason: "stop", message }));
      return stream;
    };
    const provider: Provider<"openai-completions"> = {
      id: model.provider,
      name: "Borrowed Provider",
      auth: {
        apiKey: {
          name: "Parent runtime key",
          resolve: async () => ({ auth: { apiKey: "parent-runtime-key" } }),
        },
      },
      getModels: () => [parentCatalogModel],
      stream: (requestModel, _context, options) => respond(requestModel, options),
      streamSimple: vi.fn((requestModel, _context, options) => respond(requestModel, options)),
    };
    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: false },
    });
    const resourceLoader = new DefaultResourceLoader({
      cwd: root,
      agentDir: root,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: "",
    });
    const providerAuthority = {
      getProvider: () => provider,
      getProviderAuth: async () => ({ auth: { apiKey: "parent-runtime-key" } }),
    };
    const createRun = () => {
      let completionCalls = 0;
      return startAgentRun({
        inputs: {
          cwd: root,
          model,
          providerAuthority,
          thinkingLevel: "off",
          tools: [],
          resourceLoader,
          settingsManager,
          agentDir: root,
        },
        prompt: "return the session response",
        completionResolver: () => {
          completionCalls++;
          return completionCalls === 1 ? undefined : "done";
        },
        continuation: {
          maxTurns: 1,
          resolveNext: () => ({ prompt: "continue", activeTools: [], thinkingLevel: "off" }),
        },
      });
    };

    const firstRun = createRun();
    await expect(firstRun.result).resolves.toMatchObject({ kind: "success", value: "done" });
    const firstSessionIds = sessionIds.splice(0);
    const secondRun = createRun();
    await expect(secondRun.result).resolves.toMatchObject({ kind: "success", value: "done" });
    const secondSessionIds = sessionIds.splice(0);

    expect(firstSessionIds).toHaveLength(2);
    expect(secondSessionIds).toHaveLength(2);
    const firstSessionId = firstSessionIds[0];
    const secondSessionId = secondSessionIds[0];
    expect(firstSessionId).toEqual(expect.any(String));
    expect(secondSessionId).toEqual(expect.any(String));
    expect(firstSessionIds).toEqual([firstSessionId, firstSessionId]);
    expect(secondSessionIds).toEqual([secondSessionId, secondSessionId]);
    expect(firstSessionId).not.toBe(secondSessionId);
  });
});
