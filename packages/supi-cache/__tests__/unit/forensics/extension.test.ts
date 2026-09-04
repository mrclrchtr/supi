import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  runForensics: vi.fn(),
}));

vi.mock("../../../src/forensics/forensics.ts", () => ({
  runForensics: mockFns.runForensics,
}));

import { createPiMock, getHandlerOrThrow, makeCtx } from "@mrclrchtr/supi-test-utils";
import cacheForensicsExtension from "../../../src/forensics/extension.ts";

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

  it("does not expose a live message handler after registration", () => {
    const pi = createPiMock();
    cacheForensicsExtension(pi as never);

    expect(() => getHandlerOrThrow(pi, "message_end")).toThrow();
  });
});
