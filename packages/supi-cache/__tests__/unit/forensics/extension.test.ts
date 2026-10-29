import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  runForensics: vi.fn(),
}));

vi.mock("../../../src/forensics/forensics.ts", () => ({
  runForensics: mockFns.runForensics,
}));

import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { createPiMock, getHandlerOrThrow, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import cacheForensicsExtension from "../../../src/forensics/extension.ts";
import type { ForensicsOutput } from "../../../src/tool/cache_forensics/structured-schema.ts";

function assistantEntry(
  id: string,
  timestamp: number,
  usage: { input: number; cacheRead: number; cacheWrite: number },
) {
  return {
    type: "message",
    id,
    parentId: null,
    timestamp: new Date(timestamp).toISOString(),
    message: {
      role: "assistant",
      provider: "anthropic",
      model: "claude",
      timestamp,
      content: [],
      usage: {
        ...usage,
        output: 10,
        totalTokens: usage.input + usage.cacheRead + usage.cacheWrite + 10,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
    },
  };
}

beforeEach(() => {
  mockFns.runForensics.mockReset();
});

async function executeForensics(params: Record<string, unknown>) {
  const pi = createPiMock();
  cacheForensicsExtension(pi as never);
  const tool = getTool(pi, "cache_forensics") as ReturnType<typeof getTool> & {
    outputSchema?: TSchema;
  };
  const result = (await tool.execute(
    "test",
    params,
    undefined,
    undefined,
    makeCtx(),
  )) as AgentToolResult<unknown> & {
    structuredContent: ForensicsOutput;
  };
  if (!tool.outputSchema) throw new Error("Missing registered cache_forensics outputSchema");
  expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
  const roundTripped = JSON.parse(JSON.stringify(result.structuredContent));
  expect(roundTripped).toStrictEqual(result.structuredContent);
  expect(Value.Check(tool.outputSchema, roundTripped)).toBe(true);
  expect(result.content).toEqual([{ type: "text", text: JSON.stringify(roundTripped, null, 2) }]);
  return result;
}

describe("cacheForensicsExtension", () => {
  it("registers reports without installing live monitor handlers", () => {
    const pi = createPiMock();

    cacheForensicsExtension(pi as never);

    for (const event of [
      "message_end",
      "session_compact",
      "model_select",
      "before_agent_start",
      "session_start",
    ]) {
      expect(pi.handlers.has(event), `unexpected live handler: ${event}`).toBe(false);
    }
    expect(pi.commands.has("supi-cache-history")).toBe(true);
    expect(pi.commands.has("supi-cache-forensics")).toBe(true);
    expect(pi.renderers.has("supi-cache-history")).toBe(true);
    expect(pi.renderers.has("supi-cache-forensics-report")).toBe(true);
    expect(pi.tools.map((tool) => (tool as { name: string }).name)).toEqual(["cache_forensics"]);
  });

  it("builds history from native assistant messages", async () => {
    const pi = createPiMock();
    cacheForensicsExtension(pi as never);
    const ctx = makeCtx({
      sessionManager: {
        getBranch: vi.fn(() => [
          assistantEntry("1", 1000, { cacheRead: 8000, cacheWrite: 2000, input: 2000 }),
          assistantEntry("2", 2000, { cacheRead: 5000, cacheWrite: 0, input: 5000 }),
        ]),
      },
    });

    const command = pi.commands.get("supi-cache-history") as {
      handler: (args: string, context: unknown) => Promise<void>;
    };
    await command.handler("", ctx);

    expect(pi.messages).toHaveLength(1);
    const snapshot = pi.messages[0].details as { turns: Array<Record<string, unknown>> };
    expect(snapshot.turns).toHaveLength(2);
    expect(snapshot.turns[0]).toMatchObject({ hitRate: 67, cacheWrite: 2000 });
    expect(snapshot.turns[1]).toMatchObject({ hitRate: 50, missedTokens: 5000 });
  });

  it("runs forensics with command arguments and persisted thresholds", async () => {
    const pi = createPiMock();
    cacheForensicsExtension(pi as never);
    mockFns.runForensics.mockResolvedValue({
      pattern: "hotspots",
      findings: [],
      sessionsScanned: 2,
      turnsAnalyzed: 8,
    });

    const command = pi.commands.get("supi-cache-forensics") as {
      handler: (args: string, context: unknown) => Promise<void>;
    };
    await command.handler("--pattern hotspots --since 3d --min-drop 20 --limit 10", makeCtx());

    expect(mockFns.runForensics).toHaveBeenCalledWith({
      pattern: "hotspots",
      since: "3d",
      minDrop: 20,
      maxFindings: 10,
      idleThresholdMinutes: 5,
      regressionThreshold: 25,
    });
    expect(pi.messages[0]).toMatchObject({
      customType: "supi-cache-forensics-report",
      content: "2 sessions, 8 turns",
    });
  });

  it("registers historical-cache selection and pattern guidance", () => {
    const pi = createPiMock();
    cacheForensicsExtension(pi as never);

    const tool = getTool(pi, "cache_forensics");
    expect(tool.description).toMatch(/historical PI sessions/i);
    expect(tool.description).toMatch(/redacted shape fingerprints/i);
    expect(tool.description).not.toMatch(/breakdown.*hotspots.*correlate.*idle/i);

    const schema = tool.parameters as {
      properties: { pattern: { description?: string } };
    };
    expect(schema.properties.pattern.description).toMatch(/breakdown=cause totals/i);
    expect(schema.properties.pattern.description).toMatch(/hotspots=largest drops/i);
    expect(schema.properties.pattern.description).toMatch(/correlate=preceding tool shapes/i);
    expect(schema.properties.pattern.description).toMatch(/idle=drops after long gaps/i);
  });

  it("returns schema-valid native findings and equivalent direct-call JSON", async () => {
    mockFns.runForensics.mockResolvedValue({
      pattern: "hotspots",
      sessionsScanned: 2,
      turnsAnalyzed: 8,
      findings: [
        {
          sessionId: "session-1",
          turnIndex: 3,
          previousRate: 90,
          currentRate: 10,
          drop: 80,
          cause: { type: "unknown" },
          toolsBefore: [],
          missedCost: 0.39730000000000004,
        },
      ],
    });
    const result = await executeForensics({ pattern: "hotspots" });

    expect(result.structuredContent).toEqual({
      pattern: "hotspots",
      sessionsScanned: 2,
      turnsAnalyzed: 8,
      findings: [
        {
          sessionId: "session-1",
          turnIndex: 3,
          previousRate: 90,
          currentRate: 10,
          drop: 80,
          cause: { type: "unknown" },
          toolsBefore: [],
          missedCost: 0.3973,
        },
      ],
    });
  });

  it.each(["hotspots", "correlate", "idle"])(
    "returns native empty %s findings without query-limit totals",
    async (pattern) => {
      mockFns.runForensics.mockResolvedValue({
        pattern,
        findings: [],
        sessionsScanned: 0,
        turnsAnalyzed: 0,
      });
      const result = await executeForensics({ pattern });
      expect(result.structuredContent).toStrictEqual({
        pattern,
        findings: [],
        sessionsScanned: 0,
        turnsAnalyzed: 0,
      });
    },
  );

  it("allowlists all cause counts for native breakdown queries", async () => {
    mockFns.runForensics.mockResolvedValue({
      pattern: "breakdown",
      sessionsScanned: 4,
      turnsAnalyzed: 20,
      breakdown: {
        compaction: 1,
        branch_summary: 2,
        model_change: 3,
        prompt_change: 4,
        unknown: 5,
        idle: 6,
        internal: "private",
      },
      internal: "private",
    });
    const result = await executeForensics({ pattern: "breakdown" });
    expect(result.structuredContent).toStrictEqual({
      pattern: "breakdown",
      sessionsScanned: 4,
      turnsAnalyzed: 20,
      breakdown: {
        compaction: 1,
        branch_summary: 2,
        model_change: 3,
        prompt_change: 4,
        unknown: 5,
        idle: 6,
      },
    });
  });

  it("preserves thrown execution failures rather than returning a success-shaped envelope", async () => {
    const failure = new Error("Session listing failed");
    mockFns.runForensics.mockRejectedValue(failure);
    await expect(executeForensics({ pattern: "breakdown" })).rejects.toBe(failure);
  });

  it("does not expose a live message handler after registration", () => {
    const pi = createPiMock();
    cacheForensicsExtension(pi as never);

    expect(() => getHandlerOrThrow(pi, "message_end")).toThrow();
  });
});
