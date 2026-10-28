import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  type AssistantMessage,
  createAssistantMessageEventStream,
  type ToolResultMessage,
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  createCodemodeExtension,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import {
  clearRegisteredContextProviders,
  registerContextProvider,
} from "@mrclrchtr/supi-core/context";
import { Value } from "typebox/value";
import { expect, it, vi } from "vitest";
import extension from "../../src/extension.ts";
import type { ContextReportOutput } from "../../src/tool/context_report/result-schema.ts";

// Enable the load-time gate without changing the parent process's project config.
vi.mock("../../src/config.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/config.ts")>()),
  loadContextConfig: () => ({ agentToolEnabled: true }),
}));

it("routes actual snapshot, attribution, and file metadata through default codemode and rejects thrown failures", async () => {
  const directory = await mkdtemp(join(tmpdir(), "supi-context-codemode-"));
  const events: ToolResultEvent[] = [];
  const spillPaths: string[] = [];
  let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  try {
    const settingsManager = SettingsManager.inMemory({
      defaultTools: ["+codemode"],
      compaction: { enabled: false },
      retry: { enabled: false },
    });
    const resourceLoader = new DefaultResourceLoader({
      cwd: directory,
      agentDir: directory,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      extensionFactories: [
        createCodemodeExtension(),
        extension,
        (pi) => {
          pi.on("tool_result", (event) => {
            if (event.toolName !== "context_report") return;
            events.push(event);
            const data = event.structuredContent as ContextReportOutput | undefined;
            if (data && "attributionFile" in data) spillPaths.push(data.attributionFile.path);
          });
        },
      ],
    });
    await resourceLoader.reload();
    const modelRuntime = await ModelRuntime.create({
      authPath: join(directory, "auth.json"),
      modelsPath: null,
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
    const model = modelRuntime.getModels()[0];
    if (!model) throw new Error("Missing local model catalog for the deterministic stream");
    const sessionManager = SessionManager.inMemory(directory);
    ({ session } = await createAgentSession({
      cwd: directory,
      agentDir: directory,
      model,
      modelRuntime,
      settingsManager,
      resourceLoader,
      sessionManager,
    }));
    await session.bindExtensions({});

    async function runScript(code: string) {
      if (!session) throw new Error("Session not initialized");
      let requests = 0;
      session.agent.streamFunction = (requestedModel) => {
        const first = ++requests === 1;
        const message: AssistantMessage = {
          role: "assistant",
          content: first
            ? [
                {
                  type: "toolCall",
                  id: `script-${session?.messages.length}`,
                  name: "codemode",
                  arguments: { code },
                },
              ]
            : [{ type: "text", text: "done" }],
          api: requestedModel.api,
          provider: requestedModel.provider,
          model: requestedModel.id,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: first ? "toolUse" : "stop",
          timestamp: Date.now(),
        };
        const stream = createAssistantMessageEventStream();
        stream.push({ type: "start", partial: { ...message, content: [], stopReason: "pending" } });
        stream.push({ type: "done", reason: first ? "toolUse" : "stop", message });
        return stream;
      };
      // Only provider streaming/auth preflight is replaced; Pi runs the real tools and hooks.
      await session.agent.prompt("Run the offline context fixture");
      const result = [...session.messages]
        .reverse()
        .find(
          (message): message is ToolResultMessage =>
            message.role === "toolResult" && message.toolName === "codemode",
        );
      if (!result) throw new Error("Missing codemode result");
      expect(result.isError).toBe(false);
      return result.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
    }

    const inline = await runScript(`
      const snapshot = await tools.context_report({});
      const full = await tools.context_report({ mode: "full" });
      return { capacity: typeof snapshot.headroomTokens === "number",
        pressure: typeof snapshot.pressurePercent === "number", model: snapshot.modelName,
        systemPrompt: typeof full.attribution.categories.systemPrompt === "number",
        toolCount: full.attribution.toolDefinitions.count,
        descriptionsExcluded: full.attribution.toolDefinitions.tools.every(tool => !("description" in tool)) };
    `);
    expect(inline).toContain('"capacity":true,"pressure":true');
    expect(inline).toContain('"systemPrompt":true');
    expect(inline).toContain('"descriptionsExcluded":true');
    expect(inline).toContain(`"model":${JSON.stringify(model.name)}`);
    expect(inline).toMatch(/"toolCount":[1-9]\d*/);

    // Seed existing injected-file observations, not a fabricated context_report result.
    sessionManager.appendMessage({
      role: "toolResult",
      toolCallId: "injected-fixture",
      toolName: "read",
      isError: false,
      content: [
        {
          type: "text",
          text: Array.from(
            { length: 1000 },
            (_, turn) =>
              `<extension-context source="supi-claude-md" file="/project/資料-${turn}.ts" turn="${turn}">body</extension-context>`,
          ).join("\n"),
        },
      ],
      timestamp: Date.now(),
    });
    const spilled = await runScript(`
      const full = await tools.context_report({ mode: "full" });
      return { path: full.attributionFile.path, bytes: full.attributionFile.bytes,
        capacity: typeof full.usedTokens === "number", noInlineAttribution: !("attribution" in full) };
    `);
    expect(spilled).toContain('"capacity":true,"noInlineAttribution":true');
    expect(spillPaths).toHaveLength(1);
    const path = spillPaths[0];
    if (!path) throw new Error("Missing attribution file");
    const saved = await readFile(path, "utf8");
    expect(spilled).toContain(
      `"path":${JSON.stringify(path)},"bytes":${Buffer.byteLength(saved, "utf8")}`,
    );
    const complete = JSON.parse(saved);
    expect(complete.attribution.injectedFiles).toHaveLength(1000);
    expect(complete).not.toHaveProperty("providerSections");

    const schema = session.getToolDefinition("context_report")?.outputSchema;
    if (!schema) throw new Error("Missing registered context_report outputSchema");
    expect(events).toHaveLength(3);
    for (const event of events) {
      expect(event.isError).toBe(false);
      expect(Value.Check(schema, event.structuredContent)).toBe(true);
      const roundTripped = JSON.parse(JSON.stringify(event.structuredContent));
      expect(roundTripped).toEqual(event.structuredContent);
      expect(Value.Check(schema, roundTripped)).toBe(true);
      expect(event.content).toEqual([
        { type: "text", text: JSON.stringify(event.structuredContent) },
      ]);
    }
    expect(Value.Check(schema, complete)).toBe(true);

    registerContextProvider({
      id: "codemode-failure-fixture",
      label: "Failure fixture",
      getData: () => {
        throw new Error("codemode-failure-fixture");
      },
    });
    const failure = await runScript(`
      try {
        await tools.context_report({ mode: "full" });
        return { rejected: false };
      } catch (error) { return { rejected: true, expected: error.message.includes("codemode-failure-fixture") }; }
    `);
    expect(failure).toContain('"rejected":true,"expected":true');
    expect(events.at(-1)?.isError).toBe(true);
  } finally {
    session?.dispose();
    clearRegisteredContextProviders();
    for (const path of spillPaths) await rm(dirname(path), { recursive: true, force: true });
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
