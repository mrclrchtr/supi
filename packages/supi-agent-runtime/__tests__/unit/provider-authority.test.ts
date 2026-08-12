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

import { createAgentRunProviderAuthority, startAgentRun } from "../../src/api.ts";
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

  it("resolves request auth for the selected same-provider model before header hooks", async () => {
    const recoveryModel = { ...model, id: "recovery-model", name: "Recovery Model" };
    const getApiKeyAndHeaders = vi.fn(async (selected: typeof model) => ({
      ok: true as const,
      apiKey: `${selected.id}-key`,
      headers: { "x-model": selected.id },
    }));
    const authority = createAgentRunProviderAuthority({
      getProvider: () => ({ ...parentProvider, getModels: () => [model, recoveryModel] }),
      getProviderAuth: async () => ({ auth: { apiKey: "provider-key" } }),
      getApiKeyAndHeaders,
    });
    const { createAgentRunModelRuntime } = await import("../../src/provider-authority.ts");
    const created = await createAgentRunModelRuntime(authority, [
      model as never,
      recoveryModel as never,
    ]);

    expect(created.selectModel(recoveryModel as never)).toBe(true);
    await expect(created.runtime.getAuth(recoveryModel as never)).resolves.toMatchObject({
      auth: { apiKey: "recovery-model-key", headers: { "x-model": "recovery-model" } },
    });
    expect(getApiKeyAndHeaders).toHaveBeenLastCalledWith(recoveryModel);
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
      auth: { apiKey: "runtime-key", headers: { "x-parent": null } },
    });
    expect(harness.runtime.dispose).toHaveBeenCalledTimes(1);
  });
});
