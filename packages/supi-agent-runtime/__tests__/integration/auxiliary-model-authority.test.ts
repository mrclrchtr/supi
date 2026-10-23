import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AnyModel,
  type AssistantMessage,
  type ClassifierModel,
  createAssistantMessageEventStream,
  type ImageModel,
  InMemoryCredentialStore,
  InMemoryModelsStore,
  type Model,
  type Provider,
  type SimpleStreamOptions,
  type Usage,
} from "@earendil-works/pi-ai";
import {
  createCodemodeExtension,
  DefaultResourceLoader,
  ModelRegistry,
  ModelRuntime,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureAgentRunAuxiliaryModels,
  createAgentRunProviderAuthority,
  startAgentRun,
} from "../../src/api.ts";

const roots: string[] = [];

const chatModel: Model<"openai-completions"> = {
  id: "chat-model",
  name: "Chat Model",
  provider: "codemode-test-provider",
  api: "openai-completions",
  baseUrl: "https://chat.example/v1",
  reasoning: false,
  input: ["text"],
  headers: { "x-model-auth": "chat-only-header" },
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 10_000,
  maxTokens: 1_000,
};

const classifierModel: ClassifierModel<"typesafe-system-one"> = {
  id: "approved-classifier",
  name: "Approved Classifier",
  provider: chatModel.provider,
  api: "typesafe-system-one",
  type: "classifier",
  baseUrl: "https://classifier.example/v1",
  input: ["text"],
  headers: { "x-model-auth": "classifier-only-header", "x-secret": "catalog-secret" },
  cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 20_000,
};

const hiddenClassifierModel: ClassifierModel<"typesafe-system-one"> = {
  ...classifierModel,
  id: "unavailable-classifier",
  name: "Unavailable Classifier",
};

const lateClassifierModel: ClassifierModel<"typesafe-system-one"> = {
  ...classifierModel,
  id: "added-after-snapshot",
  name: "Late Classifier",
};

const imageModel: ImageModel<"openrouter-images"> = {
  id: "approved-image-model",
  name: "Approved Image Model",
  provider: chatModel.provider,
  api: "openrouter-images",
  type: "image",
  baseUrl: "https://image.example/v1",
  input: ["text"],
  output: ["image"],
  cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
};

const classifierUsage: Usage = {
  input: 2,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 3,
  cost: { input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0, total: 0.03 },
};

const imageUsage: Usage = {
  input: 3,
  output: 2,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 5,
  cost: { input: 0.04, output: 0.05, cacheRead: 0, cacheWrite: 0, total: 0.09 },
};

const noChatUsage: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Agent Run auxiliary model authority", () => {
  it("limits real codemode discovery and dispatch to the captured catalogue and preserves storage and Usage", async () => {
    const harness = await createHarness();
    harness.catalog.push(lateClassifierModel);
    const run = startAgentRun({
      inputs: {
        cwd: harness.root,
        model: chatModel,
        providerAuthority: harness.providerAuthority,
        authorizedAuxiliaryModels: harness.authorizedAuxiliaryModels,
        thinkingLevel: "off",
        tools: ["codemode"],
        resourceLoader: harness.resourceLoader,
        settingsManager: harness.settingsManager,
        agentDir: harness.root,
      },
      prompt: "Use codemode to classify and generate an image.",
      completionResolver: (session) => session.getLastAssistantText(),
    });

    const outcome = await run.result;
    expect(outcome).toMatchObject({
      kind: "success",
      value: "codemode complete",
      usage: {
        input: 5,
        output: 3,
        totalTokens: 8,
        cost: { total: 0.12 },
      },
    });
    expect(harness.chatRequests).toBe(3);
    expect(harness.auxiliaryRequests.map((request) => request.model.id)).toEqual([
      classifierModel.id,
      imageModel.id,
    ]);
    expect(harness.auxiliaryRequests[0]).toMatchObject({
      model: { baseUrl: classifierModel.baseUrl },
      headers: { "x-model-auth": "classifier-only-header" },
    });
    expect(harness.auxiliaryRequests[1]).toMatchObject({
      model: { baseUrl: imageModel.baseUrl },
    });
    expect(harness.codemodeResults[0]).toContain(
      `${classifierModel.id}|${imageModel.id}|true|true|true|stop|stop`,
    );
    expect(harness.codemodeResults[1]).toContain("persisted");
  });

  it("restores committed storage on a new run but not writes from a failed script", async () => {
    const harness = await createHarness({
      firstScript: 'store("branch-value", "committed"); return "stored";',
      secondScript: 'store("branch-value", "uncommitted"); throw new Error("discard this write");',
    });
    const first = startAgentRun({
      inputs: codemodeInputs(harness),
      prompt: "Store a value, then fail after overwriting it.",
      completionResolver: (session) => session.getLastAssistantText(),
      captureContext: true,
    });
    const outcome = await first.result;
    expect(outcome.kind).toBe("success");
    expect(harness.codemodeResults[1]).toContain("discard this write");
    if (!outcome.context) throw new Error("Expected a saved context");

    const followUp = await createHarness({ firstScript: storageScript });
    const resumed = startAgentRun({
      inputs: { ...codemodeInputs(followUp), context: outcome.context },
      prompt: "Read the stored value without replaying the previous scripts.",
      completionResolver: (session) => session.getLastAssistantText(),
    });
    await expect(resumed.result).resolves.toMatchObject({ kind: "success" });
    expect(followUp.codemodeResults.slice(-2)).toEqual([
      expect.stringContaining("committed"),
      expect.stringContaining("committed"),
    ]);
    expect(followUp.codemodeResults.slice(-2).join("\n")).not.toContain("uncommitted");
    expect(followUp.chatRequests).toBe(3);
  });

  it("leaves auxiliary access empty by default without disabling codemode scripts", async () => {
    const harness = await createHarness({
      firstScript: `const available = await models.getAvailableOfType("classifier");
if (available.length !== 0) throw new Error("Auxiliary models were enabled by default");
return "no auxiliary models";`,
    });
    const run = startAgentRun({
      inputs: {
        cwd: harness.root,
        model: chatModel,
        providerAuthority: harness.providerAuthority,
        thinkingLevel: "off",
        tools: ["codemode"],
        resourceLoader: harness.resourceLoader,
        settingsManager: harness.settingsManager,
        agentDir: harness.root,
      },
      prompt: "Use codemode without auxiliary models.",
      completionResolver: (session) => session.getLastAssistantText(),
    });

    await expect(run.result).resolves.toMatchObject({
      kind: "success",
      value: "codemode complete",
    });
    expect(harness.auxiliaryRequests).toEqual([]);
    expect(harness.codemodeResults[0]).toContain("no auxiliary models");
  });

  it("cancels active and worker-queued scripts without committing interrupted storage", async () => {
    vi.stubEnv("PI_CODEMODE_MAX_WORKERS", "1");
    let classifierStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      classifierStarted = resolve;
    });
    let requestSignal: AbortSignal | undefined;
    const harness = await createHarness({
      classify: (_model, _context, options) =>
        new Promise((resolve) => {
          requestSignal = options?.signal;
          classifierStarted();
          options?.signal?.addEventListener(
            "abort",
            () =>
              resolve({
                api: "typesafe-system-one",
                provider: chatModel.provider,
                model: classifierModel.id,
                answers: {},
                stopReason: "aborted",
                timestamp: Date.now(),
              }),
            { once: true },
          );
        }),
      firstScript: `store("canceled-value", "must not persist");
const model = await models.getModelOfType("classifier", "${chatModel.provider}", "${classifierModel.id}");
await models.classify(model, { state: {}, questions: { ok: { type: "bool", instructions: "Is this valid?", criteria: { true: "Yes", false: "No" } } } });
return "finished";`,
    });
    const run = startAgentRun({
      inputs: {
        cwd: harness.root,
        model: chatModel,
        providerAuthority: harness.providerAuthority,
        authorizedAuxiliaryModels: harness.authorizedAuxiliaryModels,
        thinkingLevel: "off",
        tools: ["codemode"],
        resourceLoader: harness.resourceLoader,
        settingsManager: harness.settingsManager,
        agentDir: harness.root,
      },
      prompt: "Run the classifier and stop when requested.",
      completionResolver: (session) => session.getLastAssistantText(),
      captureContext: true,
    });

    await started;
    expect(requestSignal?.aborted).toBe(false);
    const queuedHarness = await createHarness();
    let queuedToolStarted!: () => void;
    const queuedStart = new Promise<void>((resolve) => {
      queuedToolStarted = resolve;
    });
    const queued = startAgentRun({
      inputs: codemodeInputs(queuedHarness),
      prompt: "Wait for a worker slot.",
      completionResolver: (session) => session.getLastAssistantText(),
      observer: (session) =>
        session.subscribe((event) => {
          if (event.type === "tool_execution_start" && event.toolName === "codemode")
            queuedToolStarted();
        }),
    });
    try {
      await queuedStart;
      await queued.stop();
      await expect(queued.result).resolves.toMatchObject({ kind: "canceled" });
      expect(queuedHarness.auxiliaryRequests).toEqual([]);
    } finally {
      await queued.stop();
      await run.stop();
    }
    const outcome = await run.result;
    expect(outcome.kind).toBe("canceled");
    expect(requestSignal?.aborted).toBe(true);
    if (!outcome.context) throw new Error("Expected canceled run context");
    const followUp = await createHarness({
      firstScript: 'return load("canceled-value") === undefined ? "not committed" : "unexpected";',
    });
    const resumed = startAgentRun({
      inputs: { ...codemodeInputs(followUp), context: outcome.context },
      prompt: "Check that the canceled script did not commit storage.",
      completionResolver: (session) => session.getLastAssistantText(),
    });
    await expect(resumed.result).resolves.toMatchObject({ kind: "success" });
    expect(followUp.codemodeResults.slice(-2)[0]).toContain("not committed");
    expect(queuedHarness.auxiliaryRequests).toEqual([]);
  });
});

async function createHarness(
  options: { classify?: Provider["classify"]; firstScript?: string; secondScript?: string } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "supi-agent-aux-models-"));
  roots.push(root);
  const catalog: AnyModel[] = [chatModel, classifierModel, hiddenClassifierModel, imageModel];
  const auxiliaryRequests: { model: AnyModel; headers?: Record<string, string | null> }[] = [];
  const codemodeResults: string[] = [];
  const observedToolResults = new Set<string>();
  let chatRequests = 0;
  const provider: Provider = {
    id: chatModel.provider,
    name: "Codemode Test Provider",
    auth: {
      apiKey: {
        name: "Codemode Test Key",
        resolve: async () => ({ auth: { apiKey: "provider-test-key" } }),
      },
    },
    getModels: () =>
      catalog.filter(
        (candidate): candidate is Model<"openai-completions"> => candidate.type === undefined,
      ),
    getAllModels: () => [...catalog],
    filterAllModels: (models) =>
      models.filter((candidate) => candidate.id !== hiddenClassifierModel.id),
    stream: () => createAssistantMessageEventStream(),
    streamSimple: (_model, context, _options?: SimpleStreamOptions) => {
      for (const message of context.messages) {
        if (
          message.role === "toolResult" &&
          message.toolName === "codemode" &&
          !observedToolResults.has(message.toolCallId)
        ) {
          observedToolResults.add(message.toolCallId);
          codemodeResults.push(
            message.content
              .filter((item) => item.type === "text")
              .map((item) => item.text)
              .join("\n"),
          );
        }
      }
      const request = chatRequests++;
      const stream = createAssistantMessageEventStream();
      const response =
        request < 2
          ? makeToolCall(
              request === 0
                ? (options.firstScript ?? initialCodemodeScript())
                : (options.secondScript ?? storageScript),
            )
          : makeTextMessage("codemode complete");
      queueMicrotask(() => stream.push({ type: "done", ...response }));
      return stream;
    },
    classify:
      options.classify ??
      (async (model, _context, requestOptions) => {
        auxiliaryRequests.push({ model, headers: requestOptions?.headers });
        return {
          api: model.api,
          provider: model.provider,
          model: model.id,
          answers: { ok: { type: "bool", probability: 1 } },
          usage: classifierUsage,
          stopReason: "stop",
          timestamp: Date.now(),
        };
      }),
    generateImages: async (model, _context, requestOptions) => {
      auxiliaryRequests.push({ model, headers: requestOptions?.headers });
      return {
        api: model.api,
        provider: model.provider,
        model: model.id,
        output: [],
        usage: imageUsage,
        stopReason: "stop",
        timestamp: Date.now(),
      };
    },
  };
  const parentRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsStore: new InMemoryModelsStore(),
    modelsPath: null,
    allowModelNetwork: false,
  });
  parentRuntime.registerNativeProvider(provider);
  const registry = new ModelRegistry(parentRuntime);
  const providerAuthority = createAgentRunProviderAuthority({
    getProvider: (providerId) => registry.getProvider(providerId),
    getProviderAuth: (providerId) => registry.getProviderAuth(providerId),
    getApiKeyAndHeaders: (model) => registry.getApiKeyAndHeaders(model),
    getAvailableOfType: (type) => registry.getAvailableOfType(type, chatModel.provider),
    classify: (model, context, requestOptions) => registry.classify(model, context, requestOptions),
    generateImages: (model, context, requestOptions) =>
      registry.generateImages(model, context, requestOptions),
  });
  const authorizedAuxiliaryModels = await captureAgentRunAuxiliaryModels(providerAuthority);
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
    defaultTools: ["+codemode"],
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd: root,
    agentDir: root,
    settingsManager,
    extensionFactories: [createCodemodeExtension({ mode: "on" })],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "",
  });
  return {
    root,
    catalog,
    providerAuthority,
    authorizedAuxiliaryModels,
    settingsManager,
    resourceLoader,
    auxiliaryRequests,
    codemodeResults,
    get chatRequests() {
      return chatRequests;
    },
  };
}

function codemodeInputs(harness: Awaited<ReturnType<typeof createHarness>>) {
  return {
    cwd: harness.root,
    model: chatModel,
    providerAuthority: harness.providerAuthority,
    authorizedAuxiliaryModels: harness.authorizedAuxiliaryModels,
    thinkingLevel: "off" as const,
    tools: ["codemode"],
    resourceLoader: harness.resourceLoader,
    settingsManager: harness.settingsManager,
    agentDir: harness.root,
  };
}

function initialCodemodeScript(): string {
  return `const classifiers = await models.getAvailableOfType("classifier");
const images = await models.getAvailableOfType("image");
const unavailable = await models.getModelOfType("classifier", "${chatModel.provider}", "${hiddenClassifierModel.id}") === undefined;
const late = await models.getModelOfType("classifier", "${chatModel.provider}", "${lateClassifierModel.id}") === undefined;
const noSecret = !JSON.stringify(classifiers).includes("catalog-secret");
const classifier = await models.getModelOfType("classifier", "${chatModel.provider}", "${classifierModel.id}");
const imageModel = await models.getModelOfType("image", "${chatModel.provider}", "${imageModel.id}");
if (!unavailable || !late || !noSecret || classifiers.length !== 1 || images.length !== 1) throw new Error("Auxiliary catalogue escaped the invocation snapshot");
const classified = await models.classify(classifier, { state: { answer: 42 }, questions: { ok: { type: "bool", instructions: "Is this valid?", criteria: { true: "Yes", false: "No" } } } });
const generated = await models.generateImages(imageModel, { input: [{ type: "text", text: "A test image" }] });
store("branch-value", "persisted");
return [classifiers.map((model) => model.id).join(","), images.map((model) => model.id).join(","), unavailable, late, noSecret, classified.stopReason, generated.stopReason].join("|");`;
}

const storageScript = `return load("branch-value");`;

function makeToolCall(code: string): { reason: "toolUse"; message: AssistantMessage } {
  return {
    reason: "toolUse",
    message: {
      role: "assistant",
      content: [
        { type: "toolCall", id: `codemode-${Date.now()}`, name: "codemode", arguments: { code } },
      ],
      api: chatModel.api,
      provider: chatModel.provider,
      model: chatModel.id,
      usage: noChatUsage,
      stopReason: "toolUse",
      timestamp: Date.now(),
    },
  };
}

function makeTextMessage(text: string): { reason: "stop"; message: AssistantMessage } {
  return {
    reason: "stop",
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
      api: chatModel.api,
      provider: chatModel.provider,
      model: chatModel.id,
      usage: noChatUsage,
      stopReason: "stop",
      timestamp: Date.now(),
    },
  };
}
