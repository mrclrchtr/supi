import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
import { Value } from "typebox/value";
import { expect, it, vi } from "vitest";
import extension from "../../src/extension.ts";
import type { ForensicsOutput } from "../../src/tool/cache_forensics/structured-schema.ts";

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function historicalSession() {
  const start = Date.now() - 2 * 24 * 60 * 60 * 1000;
  const header = {
    type: "session",
    version: 3,
    id: "fixture",
    timestamp: new Date(start).toISOString(),
    cwd: "/fixture",
  };
  const entries = Array.from({ length: 180 }, (_, index) => {
    const timestamp = start + index * 6 * 60 * 1000;
    const low = index % 2 === 1;
    return {
      type: "message",
      id: `turn-${index}`,
      parentId: index === 0 ? null : `turn-${index - 1}`,
      timestamp: new Date(timestamp).toISOString(),
      message: {
        role: "assistant",
        provider: "fixture",
        model: "fixture",
        api: "anthropic-messages",
        timestamp,
        stopReason: "toolUse",
        content: [
          {
            type: "toolCall",
            id: `bash-${index}`,
            name: "bash",
            arguments: { command: "private-command-value" },
          },
          {
            type: "toolCall",
            id: `write-${index}`,
            name: "write",
            arguments: { path: "/private-path-value", content: "private-body-value" },
          },
        ],
        usage: {
          ...usage,
          input: low ? 9000 : 1000,
          cacheRead: low ? 1000 : 9000,
          totalTokens: 10000,
          cost: { ...usage.cost, input: 0.4, cacheRead: 0.001, total: 0.401 },
        },
      },
    };
  });
  return [header, ...entries].map((entry) => JSON.stringify(entry)).join("\n");
}

it("selects real cache facts and spill references through PI's default codemode without parsing tool text", async () => {
  const directory = await mkdtemp(join(tmpdir(), "supi-cache-codemode-"));
  const events: ToolResultEvent[] = [];
  const spillDirectories = new Set<string>();
  let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  const listAll = vi.spyOn(SessionManager, "listAll");
  try {
    const historical = join(directory, "historical.jsonl");
    const empty = join(directory, "empty.jsonl");
    await writeFile(historical, historicalSession());
    await writeFile(empty, "");
    listAll.mockResolvedValue(
      [
        { id: "fixture", path: historical },
        { id: "empty", path: empty },
        { id: "unreadable", path: join(directory, "missing.jsonl") },
      ].map((item) => ({
        ...item,
        cwd: directory,
        created: new Date(),
        modified: new Date(),
        messageCount: 0,
        firstMessage: "",
        allMessagesText: "",
      })),
    );

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
            if (event.toolName !== "cache_forensics") return;
            events.push(event);
            const data = event.structuredContent as ForensicsOutput | undefined;
            if (data && "truncated" in data) spillDirectories.add(dirname(data.fullOutputPath));
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

    async function runTool(name: string, args: JsonObject) {
      if (!session) throw new Error("Session not initialized");
      let requests = 0;
      session.agent.streamFunction = (requestedModel) => {
        const first = ++requests === 1;
        const message: AssistantMessage = {
          role: "assistant",
          api: requestedModel.api,
          provider: requestedModel.provider,
          model: requestedModel.id,
          content: first
            ? [{ type: "toolCall", id: `call-${session?.messages.length}`, name, arguments: args }]
            : [{ type: "text", text: "done" }],
          usage,
          stopReason: first ? "toolUse" : "stop",
          timestamp: Date.now(),
        };
        const stream = createAssistantMessageEventStream();
        stream.push({ type: "start", partial: { ...message, content: [], stopReason: "pending" } });
        stream.push({ type: "done", reason: first ? "toolUse" : "stop", message });
        return stream;
      };
      // Replace only provider streaming/auth preflight; PI executes real tools and nested hooks.
      await session.agent.prompt("Run the offline cache fixture");
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
      const hotspots = await tools.cache_forensics({ pattern: "hotspots", limit: 2 });
      const breakdown = await tools.cache_forensics({ pattern: "breakdown" });
      const correlate = await tools.cache_forensics({ pattern: "correlate", limit: 1 });
      const idle = await tools.cache_forensics({ pattern: "idle", limit: 1 });
      const empty = await tools.cache_forensics({ pattern: "hotspots", minDrop: 90 });
      const spill = await tools.cache_forensics({ pattern: "hotspots", limit: 80 });
      const selected = { pattern: hotspots.pattern, sessions: hotspots.sessionsScanned, turns: hotspots.turnsAnalyzed,
        count: hotspots.findings.length, total: hotspots.findingsTotal, limit: hotspots.findingsLimit,
        turn: hotspots.findings[0].turnIndex, drop: hotspots.findings[0].drop,
        tool: correlate.findings[0].toolsBefore[0].toolName, idleGap: idle.findings[0].cause.idleGapMinutes,
        causeCount: breakdown.breakdown.idle, emptyCount: empty.findings.length,
        hasEmptyTotal: "findingsTotal" in empty, spilled: spill.truncated === true,
        hasPartial: "findings" in spill || "breakdown" in spill };
      const expected = { pattern: "hotspots", sessions: 1, turns: 180, count: 2, total: 90, limit: 2,
        turn: 2, drop: 80, tool: "bash", idleGap: 6, causeCount: 90, emptyCount: 0,
        hasEmptyTotal: false, spilled: true, hasPartial: false };
      for (const [key, value] of Object.entries(expected)) {
        if (selected[key] !== value) throw new Error("Unexpected native field: " + key);
      }
      if (typeof spill.fullOutputPath !== "string") throw new Error("Missing native spill reference");
      return "Native cache fields verified: " + spill.fullOutputPath;
    `,
    });
    expect(routed.isError).toBe(false);
    const text = routed.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n");
    expect(text).toContain("Native cache fields verified:");

    const direct = await runTool("cache_forensics", { pattern: "breakdown" });
    expect(direct.isError).toBe(false);
    const schema = session.getToolDefinition("cache_forensics")?.outputSchema;
    if (!schema) throw new Error("Missing registered cache_forensics outputSchema");
    expect(events).toHaveLength(7);
    for (const event of events) {
      expect(event.isError).toBe(false);
      expect(Value.Check(schema, event.structuredContent)).toBe(true);
      const roundTripped = JSON.parse(JSON.stringify(event.structuredContent));
      expect(roundTripped).toStrictEqual(event.structuredContent);
      expect(Value.Check(schema, roundTripped)).toBe(true);
      expect(event.content).toEqual([
        { type: "text", text: JSON.stringify(roundTripped, null, 2) },
      ]);
      expect(JSON.stringify(event)).not.toContain("private-");
      expect(roundTripped).not.toHaveProperty("complete");
    }
    expect(direct.content).toEqual(events[6].content);
    const spill = events[5].structuredContent as ForensicsOutput;
    expect(spill).toMatchObject({
      truncated: true,
      findingsTotal: 90,
      findingsLimit: 80,
      limit: 80,
      sessionsScanned: 1,
      turnsAnalyzed: 180,
    });
    if (!("truncated" in spill)) throw new Error("Expected an oversized spill result");
    expect(text).toContain(spill.fullOutputPath);
    expect(events[5].details).toEqual({ fullOutputPath: spill.fullOutputPath });
    const saved = await readFile(spill.fullOutputPath, "utf-8");
    const data = JSON.parse(saved);
    expect(Value.Check(schema, data)).toBe(true);
    expect(data.findings).toHaveLength(80);
    expect(data.findings[0]).toMatchObject({
      sessionId: "fixture",
      turnIndex: 2,
      missedTokens: 9000,
      missedCost: 0.391,
    });
    expect(data.findings.at(-1).turnIndex).toBe(160);
    expect(saved).not.toContain("private-");
    expect(saved).not.toContain("_pathsInvolved");
    expect(saved).not.toContain("_commandSummaries");
    expect(spill.totalLines).toBe(saved.split("\n").length);
    expect(spill.totalBytes).toBe(Buffer.byteLength(saved, "utf-8"));

    listAll.mockRejectedValueOnce(new Error("Session listing failed"));
    const failure = await runTool("codemode", {
      code: `
      try { await tools.cache_forensics({ pattern: "breakdown" }); }
      catch (error) {
        if (error.message !== "Session listing failed") throw error;
        return "Session listing failure rejected";
      }
      throw new Error("Expected listing failure to reject");
    `,
    });
    expect(failure.isError).toBe(false);
    expect(failure.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("Session listing failure rejected"),
        }),
      ]),
    );
    listAll.mockRejectedValueOnce(new Error("Session listing failed"));
    const directFailure = await runTool("cache_forensics", { pattern: "breakdown" });
    expect(directFailure.isError).toBe(true);
  } finally {
    session?.dispose();
    listAll.mockRestore();
    for (const path of spillDirectories) await rm(path, { recursive: true, force: true });
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
