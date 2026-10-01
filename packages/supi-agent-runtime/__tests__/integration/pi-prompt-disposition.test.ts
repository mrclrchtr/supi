import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAssistantMessageEventStream,
  InMemoryCredentialStore,
  InMemoryModelsStore,
  type Model,
  type Provider,
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  type ExtensionFactory,
  ModelRuntime,
  type PromptOptions,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vitest";

const roots: string[] = [];
const model: Model<"openai-completions"> = {
  id: "prompt-contract-model",
  name: "Prompt Contract Model",
  provider: "prompt-contract-provider",
  api: "openai-completions",
  baseUrl: "https://unused.example/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 10_000,
  maxTokens: 1_000,
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("reports handled input and does not start a provider request", async () => {
  const harness = await createPromptSession({ handleInput: true });
  try {
    const dispositions: string[] = [];
    await harness.session.prompt("handled input", {
      preflightResult: (disposition) => dispositions.push(disposition),
    });

    expect(dispositions).toEqual(["handled"]);
    expect(harness.providerRequest).not.toHaveBeenCalled();
  } finally {
    harness.session.dispose();
  }
});

it("rejects a prompt without calling the disposition hook", async () => {
  const harness = await createPromptSession({ authenticated: false });
  try {
    const preflightResult = vi.fn();
    await expect(
      harness.session.prompt("input without auth", { preflightResult }),
    ).rejects.toThrow();

    expect(preflightResult).not.toHaveBeenCalled();
    expect(harness.providerRequest).not.toHaveBeenCalled();
  } finally {
    harness.session.dispose();
  }
});

it("does not start the provider when the started callback throws", async () => {
  const harness = await createPromptSession();
  try {
    const preflightResult = vi.fn<NonNullable<PromptOptions["preflightResult"]>>((disposition) => {
      if (disposition === "started") throw new Error("stop at the start boundary");
    });
    await expect(
      harness.session.prompt("input stopped at start", { preflightResult }),
    ).rejects.toThrow("stop at the start boundary");

    expect(preflightResult).toHaveBeenCalledWith("started");
    expect(harness.providerRequest).not.toHaveBeenCalled();
  } finally {
    harness.session.dispose();
  }
});

async function createPromptSession(
  options: { authenticated?: boolean; handleInput?: boolean } = {},
) {
  const cwd = await mkdtemp(join(tmpdir(), "supi-prompt-disposition-"));
  roots.push(cwd);
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
  });
  const providerRequest = vi.fn(() => createAssistantMessageEventStream());
  const provider: Provider = {
    id: model.provider,
    name: "Prompt Contract Provider",
    auth: {
      apiKey: {
        name: "Prompt Contract Key",
        resolve: async () =>
          options.authenticated === false ? undefined : { auth: { apiKey: "unused-test-key" } },
      },
    },
    getModels: () => [model],
    stream: () => providerRequest(),
    streamSimple: () => providerRequest(),
  };
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsStore: new InMemoryModelsStore(),
    modelsPath: null,
    allowModelNetwork: false,
  });
  modelRuntime.registerNativeProvider(provider);
  const extensionFactory: ExtensionFactory = (pi) => {
    pi.on("input", (event) =>
      options.handleInput && event.text === "handled input"
        ? { action: "handled" }
        : { action: "continue" },
    );
  };
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: cwd,
    settingsManager,
    extensionFactories: [extensionFactory],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "",
  });
  await resourceLoader.reload();
  const { session } = await createAgentSession({
    cwd,
    agentDir: cwd,
    model,
    modelRuntime,
    tools: [],
    resourceLoader,
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager,
  });
  await session.bindExtensions({ mode: "print" });
  return { session, providerRequest };
}
