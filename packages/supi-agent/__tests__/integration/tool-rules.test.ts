import { mkdtemp, rm } from "node:fs/promises";
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
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createAgentRunProviderAuthority, startAgentRun } from "@mrclrchtr/supi-agent-runtime/api";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAgentSessionInputs,
  discoverProfileCatalogue,
  resolveProfileDefinition,
} from "../../src/api.ts";

const roots: string[] = [];
const chatModel: Model<"openai-completions"> = {
  id: "child-tool-rules-test",
  name: "Child Tool Rules Test",
  provider: "supi-agent-tool-rules-test",
  api: "openai-completions",
  baseUrl: "https://agent-tool-rules-test.example/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 10_000,
  maxTokens: 1_000,
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** Run one child turn for a bundled profile and return the system prompt its provider received. */
async function childSystemPrompt(profileId: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "supi-agent-tool-rules-"));
  roots.push(root);
  const catalogue = await discoverProfileCatalogue({
    cwd: root,
    agentDir: root,
    projectTrusted: false,
  });
  const entry = catalogue.profiles.find((candidate) => candidate.id === profileId);
  if (!entry) throw new Error(`Missing bundled profile: ${profileId}`);
  const profile = resolveProfileDefinition(entry);
  if (!("manifest" in profile)) throw new Error(profile.message);

  let seen: Context | undefined;
  const provider: Provider = {
    id: chatModel.provider,
    name: "Tool Rules Test Provider",
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
  const run = startAgentRun({
    inputs: createAgentSessionInputs({
      cwd: root,
      agentDir: root,
      projectTrusted: false,
      providerAuthority: createAgentRunProviderAuthority(new ModelRegistry(runtime)),
      model: chatModel,
      thinkingLevel: "off",
      profile,
    }),
    prompt: "Report the repository state.",
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

describe("child tool rules", () => {
  it("adds the active tools' usage rules to a package-owned child prompt", async () => {
    const explore = await childSystemPrompt("explore");
    const rules = explore.slice(explore.indexOf("<tool_rules>"), explore.indexOf("</tool_rules>"));

    expect(explore.startsWith("You are an exploration Agent Run.")).toBe(true);
    expect(rules).toContain("- Narrow git output with paths after --");
    expect(rules).toContain("- Use code_orientation before broad source reading");
    // Rules follow the profile's tools: explore cannot edit.
    expect(rules).not.toContain("Use edit for targeted changes");
  }, 20_000);

  it("selects rules per profile", async () => {
    const general = await childSystemPrompt("general");
    const rules = general.slice(general.indexOf("<tool_rules>"), general.indexOf("</tool_rules>"));

    expect(rules).toContain("- Use edit for targeted changes");
    expect(rules).not.toContain("Narrow git output");
  }, 20_000);
});
