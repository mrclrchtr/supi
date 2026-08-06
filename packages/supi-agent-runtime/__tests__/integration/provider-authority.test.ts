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

const temporaryDirectories: string[] = [];

const model: Model<"openai-completions"> = {
  id: "borrowed-model",
  name: "Borrowed Model",
  provider: "borrowed-provider",
  api: "openai-completions",
  baseUrl: "https://parent.example/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 10_000,
  maxTokens: 1_000,
};

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
    const streamSimple = vi.fn((_parentModel, _context, options) => {
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
      getModels: () => [model],
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
          getProviderAuth: async () => ({ auth: { apiKey: "parent-runtime-key" } }),
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
});
