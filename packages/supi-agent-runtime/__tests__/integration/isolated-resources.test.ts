import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AssistantMessage,
  type Context,
  createAssistantMessageEventStream,
  getCurrentSystemPrompt,
  InMemoryCredentialStore,
  InMemoryModelsStore,
  type Model,
  type Provider,
} from "@earendil-works/pi-ai";
import { type ExtensionAPI, ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAgentRunProviderAuthority,
  createIsolatedAgentResources,
  type IsolatedAgentResourceOptions,
  startAgentRun,
} from "../../src/api.ts";

const roots: string[] = [];
const chatModel: Model<"openai-completions"> = {
  id: "isolated-resources-test",
  name: "Isolated Resources Test",
  provider: "supi-isolated-resources-test",
  api: "openai-completions",
  baseUrl: "https://isolated-resources-test.example/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 10_000,
  maxTokens: 1_000,
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function probeTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "probe_tool",
    label: "Probe",
    description: "Probe tool.",
    promptGuidelines: ["Use probe_tool before guessing."],
    parameters: Type.Object({}),
    execute: async () => ({ content: [{ type: "text", text: "ok" }], details: {} }),
  });
}

/** Run one child turn and return the system prompt its provider received. */
async function childSystemPrompt(
  options: Omit<IsolatedAgentResourceOptions, "cwd" | "agentDir" | "projectTrusted">,
  setup?: (root: string) => Promise<void>,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "supi-isolated-resources-"));
  roots.push(root);
  await setup?.(root);
  let seen: Context | undefined;
  const provider: Provider = {
    id: chatModel.provider,
    name: "Isolated Resources Test Provider",
    auth: { apiKey: { name: "Test Key", resolve: async () => ({ auth: { apiKey: "test-key" } }) } },
    getModels: () => [chatModel],
    getAllModels: () => [chatModel],
    stream: () => createAssistantMessageEventStream(),
    streamSimple: (_model, context) => {
      seen = context;
      const message: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: "done" }],
        api: chatModel.api,
        provider: chatModel.provider,
        model: chatModel.id,
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
      };
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => stream.push({ type: "done", reason: "stop", message }));
      return stream;
    },
  };
  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsStore: new InMemoryModelsStore(),
    modelsPath: null,
    allowModelNetwork: false,
  });
  runtime.registerNativeProvider(provider);
  const { resourceLoader, settingsManager, agentDir } = createIsolatedAgentResources({
    cwd: root,
    agentDir: root,
    projectTrusted: true,
    ...options,
  });
  const run = startAgentRun({
    inputs: {
      cwd: root,
      agentDir,
      model: chatModel,
      providerAuthority: createAgentRunProviderAuthority(new ModelRegistry(runtime)),
      thinkingLevel: "off",
      tools: ["read", "probe_tool"],
      resourceLoader,
      settingsManager,
    },
    prompt: "Report.",
    completionResolver: (session) => session.getLastAssistantText(),
  });
  try {
    await run.result;
  } finally {
    await run.stop();
  }
  if (!seen) throw new Error("The provider received no request.");
  return getCurrentSystemPrompt(seen.messages) ?? "";
}

describe("isolated Agent Run resources", () => {
  it("keeps active tool rules under a caller-owned prompt", async () => {
    const prompt = await childSystemPrompt({
      systemPrompt: "OWNED PROTOCOL",
      extensions: [{ name: "probe", factory: probeTool }],
    });

    expect(prompt.startsWith("OWNED PROTOCOL")).toBe(true);
    expect(prompt).toContain("- Use probe_tool before guessing.");
  }, 20_000);

  it("loads only the supplied instruction files and no ambient system prompt files", async () => {
    const prompt = await childSystemPrompt(
      {
        systemPrompt: undefined,
        instructionFiles: [{ path: "/selected/CLAUDE.md", content: "SELECTED_INSTRUCTIONS" }],
      },
      async (root) => {
        await writeFile(join(root, "CLAUDE.md"), "AMBIENT_PROJECT", "utf8");
        await writeFile(join(root, "SYSTEM.md"), "AMBIENT_SYSTEM", "utf8");
        await mkdir(join(root, ".pi"), { recursive: true });
        await writeFile(join(root, ".pi", "APPEND_SYSTEM.md"), "AMBIENT_APPEND", "utf8");
      },
    );

    expect(prompt).toContain("SELECTED_INSTRUCTIONS");
    for (const ambient of ["AMBIENT_PROJECT", "AMBIENT_SYSTEM", "AMBIENT_APPEND"]) {
      expect(prompt).not.toContain(ambient);
    }
  }, 20_000);
});
