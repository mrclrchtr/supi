import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
  type ToolCall,
} from "@earendil-works/pi-ai";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createAgentRunProviderAuthority, startAgentRun } from "@mrclrchtr/supi-agent-runtime/api";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAgentSessionInputs,
  discoverProfileCatalogue,
  isReadOnlyCapabilitySet,
  resolveProfileDefinition,
} from "../../src/api.ts";

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
            ? makeToolCall("codemode", {
                code: `const permitted = ALL_TOOLS.map((tool) => tool.name).sort();
const search = await searchTools("code_resolve", { limit: 20 });
const descriptor = await describeTool("code_resolve");
let nestedBlocked = false;
try { await tools.code_resolve({ query: "secret" }); } catch { nestedBlocked = true; }
const classifierCount = (await models.getAvailableOfType("classifier")).length;
return JSON.stringify({ permitted, searchIncludesExcluded: search.some((tool) => tool.name === "code_resolve"), lookupMissing: descriptor === undefined, nestedBlocked, classifierCount });`,
              })
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
    expect(codemodeResults[0]).not.toContain("grep");
    expect(codemodeResults[0]).not.toContain('"find"');
    expect(codemodeResults[0]).not.toContain('"ls"');
    await run.stop();
  });

  it.each(["explore", "general"])(
    "executes discovery tools directly and through codemode in the bundled %s profile",
    async (profileId) => {
      const root = await mkdtemp(join(tmpdir(), "supi-agent-discovery-"));
      roots.push(root);
      await writeFile(join(root, "references.md"), "# References\nlegacy/settings\n");
      await writeFile(join(root, "migration.sql"), "-- Migration\nselect discovery_marker();\n");
      const catalogue = await discoverProfileCatalogue({
        cwd: root,
        agentDir: root,
        projectTrusted: false,
      });
      const entry = catalogue.profiles.find((candidate) => candidate.id === profileId);
      if (!entry) throw new Error(`Missing bundled profile: ${profileId}`);
      const profile = resolveProfileDefinition(entry);
      if (!("manifest" in profile)) throw new Error(profile.message);
      expect(catalogue.diagnostics).toEqual([]);
      expect(isReadOnlyCapabilitySet(profile.manifest.tools)).toBe(profileId === "explore");
      expect(profile.manifest.tools).toEqual(expect.arrayContaining(["grep", "find", "ls"]));

      const calls: Pick<ToolCall, "name" | "arguments">[] = [
        { name: "grep", arguments: { pattern: "legacy/settings", glob: "*.md", literal: true } },
        { name: "find", arguments: { pattern: "*.sql" } },
        { name: "ls", arguments: { path: "." } },
        { name: "grep", arguments: { pattern: "no-such-content", literal: true } },
        {
          name: "codemode",
          arguments: {
            code: `return JSON.stringify({
  matches: await tools.grep({ pattern: "discovery_marker", glob: "*.sql", literal: true }),
  files: await tools.find({ pattern: "*.md" }),
  entries: await tools.ls({ path: "." })
});`,
          },
        },
      ];
      const results = new Map<string, { text: string; isError: boolean }>();
      let requests = 0;
      const provider: Provider = {
        id: chatModel.provider,
        name: "Discovery Test Provider",
        auth: {
          apiKey: { name: "Test Key", resolve: async () => ({ auth: { apiKey: "test-key" } }) },
        },
        getModels: () => [chatModel],
        getAllModels: () => [chatModel],
        stream: () => createAssistantMessageEventStream(),
        streamSimple: (_model, context) => {
          for (const message of context.messages) {
            if (message.role === "toolResult") {
              results.set(message.toolCallId, {
                text: message.content
                  .filter((item) => item.type === "text")
                  .map((item) => item.text)
                  .join("\n"),
                isError: message.isError,
              });
            }
          }
          const index = requests++;
          const call = calls[index];
          const response = call
            ? makeToolCall(call.name, call.arguments, `discovery-${index}`)
            : makeTextMessage("discovery verified");
          const stream = createAssistantMessageEventStream();
          queueMicrotask(() => stream.push({ type: "done", ...response }));
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
        prompt: "Find Markdown references and SQL migrations using the discovery tools.",
        completionResolver: (session) => session.getLastAssistantText(),
      });
      try {
        await expect(run.result).resolves.toMatchObject({
          kind: "success",
          value: "discovery verified",
        });
        expect(results.size).toBe(calls.length);
        expect([...results.values()].every((result) => !result.isError)).toBe(true);
        expect(results.get("discovery-0")?.text).toContain("references.md:2:");
        expect(results.get("discovery-0")?.text).toContain("legacy/settings");
        expect(results.get("discovery-1")?.text).toContain("migration.sql");
        expect(results.get("discovery-2")?.text).toContain("references.md");
        expect(results.get("discovery-2")?.text).toContain("migration.sql");
        expect(results.get("discovery-3")?.text).toContain("No matches found");
        expect(results.get("discovery-4")?.text).toContain("migration.sql:2:");
        expect(results.get("discovery-4")?.text).toContain("discovery_marker");
        expect(results.get("discovery-4")?.text).toContain("references.md");
      } finally {
        await run.stop();
      }
    },
    20_000,
  );
});

function makeToolCall(
  name: string,
  args: ToolCall["arguments"],
  id = "codemode-policy-call",
): { reason: "toolUse"; message: AssistantMessage } {
  return {
    reason: "toolUse",
    message: {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id,
          name,
          arguments: args,
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
