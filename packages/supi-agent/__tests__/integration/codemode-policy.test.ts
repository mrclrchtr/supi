import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AssistantMessage,
  createAssistantMessageEventStream,
  InMemoryCredentialStore,
  InMemoryModelsStore,
  type Model,
  type Provider,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createAgentRunProviderAuthority, startAgentRun } from "@mrclrchtr/supi-agent-runtime/api";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentSessionInputs } from "../../src/api.ts";

const roots: string[] = [];
const chatModel: Model<"openai-completions"> = {
  id: "child-codemode-test",
  name: "Child Codemode Test",
  provider: "supi-agent-codemode-test",
  api: "openai-completions",
  baseUrl: "https://agent-codemode-test.example/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 10_000,
  maxTokens: 1_000,
};

const noUsage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Agent Profile codemode policy", () => {
  it("keeps script discovery and nested tool access within the profile allowlist", async () => {
    const root = await mkdtemp(join(tmpdir(), "supi-agent-codemode-policy-"));
    roots.push(root);
    const codemodeResults: string[] = [];
    const observed = new Set<string>();
    let requests = 0;
    const provider: Provider = {
      id: chatModel.provider,
      name: "Agent Codemode Test Provider",
      auth: {
        apiKey: {
          name: "Test Key",
          resolve: async () => ({ auth: { apiKey: "test-key" } }),
        },
      },
      getModels: () => [chatModel],
      getAllModels: () => [chatModel],
      stream: () => createAssistantMessageEventStream(),
      streamSimple: (_model, context, _options?: SimpleStreamOptions) => {
        for (const message of context.messages) {
          if (
            message.role === "toolResult" &&
            message.toolName === "codemode" &&
            !observed.has(message.toolCallId)
          ) {
            observed.add(message.toolCallId);
            codemodeResults.push(
              message.content
                .filter((item) => item.type === "text")
                .map((item) => item.text)
                .join("\n"),
            );
          }
        }
        const stream = createAssistantMessageEventStream();
        const response =
          requests++ === 0
            ? makeToolCall(
                `const permitted = ALL_TOOLS.map((tool) => tool.name).sort();
const search = await searchTools("code_resolve", { limit: 20 });
const descriptor = await describeTool("code_resolve");
let nestedBlocked = false;
try { await tools.code_resolve({ query: "secret" }); } catch { nestedBlocked = true; }
const classifierCount = (await models.getAvailableOfType("classifier")).length;
return JSON.stringify({ permitted, searchIncludesExcluded: search.some((tool) => tool.name === "code_resolve"), lookupMissing: descriptor === undefined, nestedBlocked, classifierCount });`,
              )
            : makeTextMessage("codemode policy verified");
        queueMicrotask(() => stream.push({ type: "done", ...response }));
        return stream;
      },
    };
    const parentRuntime = await ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsStore: new InMemoryModelsStore(),
      modelsPath: null,
      allowModelNetwork: false,
    });
    parentRuntime.registerNativeProvider(provider);
    const providerAuthority = createAgentRunProviderAuthority(new ModelRegistry(parentRuntime));
    const inputs = createAgentSessionInputs({
      cwd: root,
      agentDir: root,
      projectTrusted: false,
      providerAuthority,
      model: chatModel,
      thinkingLevel: "off",
      profile: {
        id: "codemode",
        source: "project",
        directory: root,
        manifest: {
          description: "Opted-in inspection",
          tools: ["read", "code_find", "codemode"],
          systemPrompt: "native",
          instructionScopes: [],
        },
      },
    });
    let activeTools: readonly string[] = [];

    const run = startAgentRun({
      inputs,
      prompt: "Use codemode to report the tools available to this profile.",
      observer: (session) => {
        activeTools = session.getActiveToolNames();
      },
      completionResolver: (session) => session.getLastAssistantText(),
    });
    await expect(run.result).resolves.toMatchObject({
      kind: "success",
      value: "codemode policy verified",
    });

    expect(activeTools).toEqual(["read", "code_find", "codemode"]);
    expect(codemodeResults).toHaveLength(1);
    expect(codemodeResults[0]).toContain('"permitted":["code_find","read"]');
    expect(codemodeResults[0]).toContain('"searchIncludesExcluded":false');
    expect(codemodeResults[0]).toContain('"lookupMissing":true');
    expect(codemodeResults[0]).toContain('"nestedBlocked":true');
    expect(codemodeResults[0]).toContain('"classifierCount":0');
    expect(codemodeResults[0]).not.toContain("code_resolve");
    expect(codemodeResults[0]).not.toContain("bash");
    expect(codemodeResults[0]).not.toContain("edit");
    await run.stop();
  });
});

function makeToolCall(code: string): { reason: "toolUse"; message: AssistantMessage } {
  return {
    reason: "toolUse",
    message: {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "codemode-policy-call",
          name: "codemode",
          arguments: { code },
        },
      ],
      api: chatModel.api,
      provider: chatModel.provider,
      model: chatModel.id,
      usage: noUsage,
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
      usage: noUsage,
      stopReason: "stop",
      timestamp: Date.now(),
    },
  };
}
