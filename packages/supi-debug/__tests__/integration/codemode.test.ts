import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AssistantMessage,
  createAssistantMessageEventStream,
  type JsonObject,
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
  clearDebugEvents,
  DEBUG_EVENT_ENTRY_TYPE,
  recordDebugEvent,
} from "@mrclrchtr/supi-core/debug";
import { Value } from "typebox/value";
import { expect, it } from "vitest";
import extension from "../../src/extension.ts";

it("delivers real debug query fields through PI's default codemode, preserving direct calls and thrown failures", async () => {
  const directory = await mkdtemp(join(tmpdir(), "supi-debug-codemode-"));
  const events: ToolResultEvent[] = [];
  let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  try {
    const configDir = join(directory, ".pi", "supi");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "config.json"),
      JSON.stringify({
        debug: { enabled: true, agentAccess: "sanitized", maxEvents: 100 },
      }),
    );
    const historical = join(directory, "historical.jsonl");
    await writeFile(
      historical,
      JSON.stringify({
        type: "custom",
        customType: DEBUG_EVENT_ENTRY_TYPE,
        data: {
          id: 1,
          timestamp: 10,
          source: "offline",
          level: "info",
          category: "fixture",
          message: "Historical evidence",
          data: { answer: 42 },
        },
      }),
    );
    const malformedSession = join(directory, "malformed.jsonl");
    await writeFile(malformedSession, '{"type":"custom","customType":"supi-debug-event","data":\n');
    const emptySession = join(directory, "empty.jsonl");
    await writeFile(emptySession, "");
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
            if (event.toolName === "debug") events.push(event);
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
    ({ session } = await createAgentSession({
      cwd: directory,
      agentDir: directory,
      model,
      modelRuntime,
      settingsManager,
      resourceLoader,
      sessionManager: SessionManager.inMemory(directory),
    }));
    await session.bindExtensions({});
    recordDebugEvent({
      source: "offline",
      level: "info",
      category: "fixture",
      message: "Live evidence",
      data: { answer: 7, password: "not-for-agent" },
      rawData: { private: "raw-only" },
    });

    async function runTool(name: string, args: JsonObject) {
      if (!session) throw new Error("Session not initialized");
      let requests = 0;
      session.agent.streamFunction = (requestedModel) => {
        const first = ++requests === 1;
        const message: AssistantMessage = {
          role: "assistant",
          content: first
            ? [{ type: "toolCall", id: `call-${session?.messages.length}`, name, arguments: args }]
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
      // Replace only the provider stream/auth preflight. PI executes the actual tools and hooks.
      await session.agent.prompt("Run the offline debug fixture");
      const result = [...session.messages]
        .reverse()
        .find(
          (message): message is ToolResultMessage =>
            message.role === "toolResult" && message.toolName === name,
        );
      if (!result) throw new Error(`Missing ${name} result`);
      return result;
    }

    const routed = await runTool("codemode", {
      code: `
      const live = await tools.debug({ source: "offline", includeRaw: true });
      const history = await tools.debug({ sessionFile: ${JSON.stringify(historical)}, includeRaw: true });
      const empty = await tools.debug({ source: "missing" });
      const malformed = await tools.debug({ sessionFile: ${JSON.stringify(malformedSession)} });
      return { live: live.events[0].message, answer: live.events[0].data.answer,
        denied: live.rawAccessDenied, history: history.events[0].data.answer,
        provenance: history.provenance.kind, rawUnavailable: history.rawDataUnavailable,
        emptyCount: empty.selection.returnedEventCount, complete: empty.selection.complete,
        malformedLineCount: malformed.provenance.malformedLineCount, scanComplete: malformed.selection.complete };
    `,
    });
    expect(routed.isError).toBe(false);
    expect(routed.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining('"live":"Live evidence","answer":7'),
        }),
      ]),
    );
    const text = routed.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n");
    expect(text).toContain(
      '"denied":true,"history":42,"provenance":"persisted","rawUnavailable":true',
    );
    expect(text).toContain('"emptyCount":0,"complete":true');
    // biome-ignore lint/security/noSecrets: JSON field/count assertion, not a credential.
    expect(text).toContain('"malformedLineCount":1');
    expect(text).toContain('"scanComplete":false');
    const schema = session.getToolDefinition("debug")?.outputSchema;
    if (!schema) throw new Error("Missing registered debug outputSchema");
    expect(events).toHaveLength(4);
    for (const event of events) {
      expect(event.isError).toBe(false);
      expect(Value.Check(schema, event.structuredContent)).toBe(true);
      expect(JSON.stringify(event)).not.toContain("raw-only");
      expect(JSON.stringify(event)).not.toContain("not-for-agent");
    }

    const direct = await runTool("debug", { source: "offline" });
    expect(direct.isError).toBe(false);
    expect(direct.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text", text: expect.stringContaining("Live evidence") }),
      ]),
    );
    const directEmpty = await runTool("debug", { sessionFile: emptySession, includeRaw: true });
    expect(directEmpty.isError).toBe(false);
    expect(directEmpty.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("Raw debug data is not persisted"),
        }),
      ]),
    );
    const failure = await runTool("codemode", {
      code: `
      try {
        await tools.debug({ sessionFile: ${JSON.stringify(join(directory, "missing.jsonl"))} });
        return { rejected: false };
      } catch (error) { return { rejected: true, missingFile: error.message.includes("ENOENT") }; }
    `,
    });
    expect(failure.isError).toBe(false);
    expect(failure.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining('"rejected":true,"missingFile":true'),
        }),
      ]),
    );
  } finally {
    session?.dispose();
    clearDebugEvents();
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
