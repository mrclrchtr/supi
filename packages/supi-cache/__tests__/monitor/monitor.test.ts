import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  loadCacheMonitorConfig: vi.fn(),
}));

vi.mock("../../src/config.ts", () => ({
  CACHE_MONITOR_DEFAULTS: {
    enabled: true,
    notifications: true,
    regressionThreshold: 25,
    idleThresholdMinutes: 5,
  },
  loadCacheMonitorConfig: mockFns.loadCacheMonitorConfig,
}));

vi.mock("../../src/settings-registration.ts", () => ({
  registerCacheMonitorSettings: vi.fn(),
}));

vi.mock("../../src/forensics/forensics.ts", () => ({
  runForensics: vi.fn(),
}));

import { runForensics } from "../../src/forensics/forensics.ts";
import cacheMonitorExtension from "../../src/monitor/monitor.ts";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";

function assistantMessage(cacheRead: number, cacheWrite: number, input: number) {
  return {
    type: "message_end",
    message: {
      role: "assistant",
      usage: {
        cacheRead,
        cacheWrite,
        input,
        output: 500,
        totalTokens: cacheRead + cacheWrite + input + 500,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    },
  };
}

function resetMocks() {
  vi.clearAllMocks();
  mockFns.loadCacheMonitorConfig.mockReturnValue({
    enabled: true,
    notifications: true,
    regressionThreshold: 25,
    idleThresholdMinutes: 5,
  });
}

describe("cacheMonitorExtension", () => {
  beforeEach(resetMocks);

  it("registers all event handlers and commands", () => {
    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    for (const event of [
      "message_end",
      "session_compact",
      "model_select",
      "before_agent_start",
      "session_start",
      "session_shutdown",
    ]) {
      expect(pi.handlers.has(event), `missing handler: ${event}`).toBe(true);
    }
    expect(pi.commands.has("supi-cache-history")).toBe(true);
    expect(pi.commands.has("supi-cache-forensics")).toBe(true);
    expect(pi.renderers.has("supi-cache-history")).toBe(true);
    expect(pi.renderers.has("supi-cache-forensics-report")).toBe(true);
  });
});

describe("message_end handler", () => {
  beforeEach(resetMocks);

  it("records turn and updates status", async () => {
    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    const ctx = makeCtx();
    const handler = pi.handlers.get("message_end")?.[0];
    await handler(assistantMessage(8000, 2000, 2000), ctx);

    expect(pi.entries).toHaveLength(1);
    expect(pi.entries[0].type).toBe("supi-cache-turn");
    expect((pi.entries[0].data as Record<string, unknown>).hitRate).toBe(80);
    expect(ctx.ui.setStatus).toHaveBeenCalledWith("supi-cache", "cache: 80%");
  });

  it("skips non-assistant messages", async () => {
    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    const ctx = makeCtx();
    const handler = pi.handlers.get("message_end")?.[0];
    await handler({ type: "message_end", message: { role: "user" } }, ctx);

    expect(pi.entries).toHaveLength(0);
    expect(ctx.ui.setStatus).not.toHaveBeenCalled();
  });

  it("skips assistant messages without usage", async () => {
    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    const ctx = makeCtx();
    const handler = pi.handlers.get("message_end")?.[0];
    await handler({ type: "message_end", message: { role: "assistant" } }, ctx);

    expect(pi.entries).toHaveLength(0);
  });

  it("detects regression and notifies", async () => {
    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    const ctx = makeCtx();
    const handler = pi.handlers.get("message_end")?.[0];

    // First turn: 90% hit rate
    await handler(assistantMessage(9000, 0, 1000), ctx);
    // Second turn: 10% hit rate (80pp drop > 25pp threshold)
    await handler(assistantMessage(1000, 0, 9000), ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Cache regression"),
      "warning",
    );
  });

  it("suppresses notifications when disabled", async () => {
    mockFns.loadCacheMonitorConfig.mockReturnValue({
      enabled: true,
      notifications: false,
      regressionThreshold: 25,
      idleThresholdMinutes: 5,
    });

    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    const ctx = makeCtx();
    const handler = pi.handlers.get("message_end")?.[0];

    await handler(assistantMessage(9000, 0, 1000), ctx);
    await handler(assistantMessage(1000, 0, 9000), ctx);

    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });

  it("skips processing when disabled", async () => {
    mockFns.loadCacheMonitorConfig.mockReturnValue({
      enabled: false,
      notifications: true,
      regressionThreshold: 25,
      idleThresholdMinutes: 5,
    });

    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    const ctx = makeCtx();
    await pi.handlers.get("message_end")?.[0](assistantMessage(8000, 0, 2000), ctx);

    expect(pi.entries).toHaveLength(0);
    expect(ctx.ui.setStatus).not.toHaveBeenCalled();
  });
});

describe("session lifecycle", () => {
  beforeEach(resetMocks);

  it("restores state on session_start", async () => {
    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    const sessionEntries = [
      {
        type: "custom",
        customType: "supi-cache-turn",
        data: {
          turnIndex: 1,
          cacheRead: 8000,
          cacheWrite: 0,
          input: 2000,
          hitRate: 80,
          timestamp: 1000,
          note: "cold start",
        },
        id: "1",
        parentId: null,
      },
    ];

    const ctx = makeCtx({
      sessionManager: { getBranch: vi.fn().mockReturnValue(sessionEntries) },
    });

    await pi.handlers.get("session_start")?.[0]({ type: "session_start", reason: "startup" }, ctx);

    expect(ctx.ui.setStatus).toHaveBeenCalledWith("supi-cache", "cache: 80%");
  });

  it("clears status on session_start when disabled", async () => {
    mockFns.loadCacheMonitorConfig.mockReturnValue({
      enabled: false,
      notifications: true,
      regressionThreshold: 25,
      idleThresholdMinutes: 5,
    });

    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    const ctx = makeCtx();
    await pi.handlers.get("session_start")?.[0]({ type: "session_start", reason: "startup" }, ctx);

    expect(ctx.ui.setStatus).toHaveBeenCalledWith("supi-cache", undefined);
  });

  it("clears state on session_shutdown", async () => {
    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    const ctx = makeCtx();
    await pi.handlers.get("message_end")?.[0](assistantMessage(8000, 0, 2000), ctx);
    expect(pi.entries).toHaveLength(1);

    await pi.handlers.get("session_shutdown")?.[0](
      { type: "session_shutdown", reason: "quit" },
      ctx,
    );

    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("supi-cache", undefined);
  });
});

describe("cause tracking events", () => {
  beforeEach(resetMocks);

  it("flags compaction on session_compact", async () => {
    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    const ctx = makeCtx();
    const msgHandler = pi.handlers.get("message_end")?.[0];

    await msgHandler(assistantMessage(9000, 0, 1000), ctx);
    await pi.handlers.get("session_compact")?.[0](
      { type: "session_compact", compactionEntry: {}, fromExtension: false },
      ctx,
    );
    await msgHandler(assistantMessage(500, 0, 9500), ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("compaction"), "warning");
  });

  it("flags model change on model_select", async () => {
    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    const ctx = makeCtx();
    const msgHandler = pi.handlers.get("message_end")?.[0];

    await msgHandler(assistantMessage(9000, 0, 1000), ctx);
    await pi.handlers.get("model_select")?.[0](
      {
        type: "model_select",
        model: { provider: "anthropic", id: "claude-4" },
        previousModel: undefined,
        source: "user",
      },
      ctx,
    );
    await msgHandler(assistantMessage(0, 5000, 5000), ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("model changed to anthropic/claude-4"),
      "warning",
    );
  });

  it("flags prompt change on before_agent_start fingerprint diff", async () => {
    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    const ctx = makeCtx();
    const msgHandler = pi.handlers.get("message_end")?.[0];
    const baHandler = pi.handlers.get("before_agent_start")?.[0];

    await baHandler(
      {
        type: "before_agent_start",
        systemPrompt: "system prompt v1",
        prompt: "",
        systemPromptOptions: { cwd: "/project", selectedTools: ["read", "bash"] },
      },
      ctx,
    );
    await msgHandler(assistantMessage(9000, 0, 1000), ctx);

    await baHandler(
      {
        type: "before_agent_start",
        systemPrompt: "system prompt v2 different",
        prompt: "",
        systemPromptOptions: {
          cwd: "/project",
          selectedTools: ["read", "bash", "edit"],
        },
      },
      ctx,
    );
    await msgHandler(assistantMessage(500, 0, 9500), ctx);

    // Should contain the diff list with tool change description
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("system prompt changed (tools)"),
      "warning",
    );
  });
});

describe("/supi-cache-history command", () => {
  beforeEach(resetMocks);

  it("sends a custom message with turn snapshot", async () => {
    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    const ctx = makeCtx();
    await pi.handlers.get("message_end")?.[0](assistantMessage(8000, 0, 2000), ctx);

    const cmd = pi.commands.get("supi-cache-history");
    if (!cmd) throw new Error("supi-cache-history command not registered");
    await cmd.handler("", ctx);

    expect(pi.messages).toHaveLength(1);
    expect(pi.messages[0].customType).toBe("supi-cache-history");
    expect(pi.messages[0].display).toBe(true);
    // Verify snapshot is persisted in details
    const details = pi.messages[0].details as Record<string, unknown>;
    expect(details.turns).toHaveLength(1);
    expect(details.cacheSupported).toBe(true);
  });

  it("snapshot is independent of later state changes", async () => {
    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    const ctx = makeCtx();
    await pi.handlers.get("message_end")?.[0](assistantMessage(8000, 0, 2000), ctx);

    const cmd = pi.commands.get("supi-cache-history");
    if (!cmd) throw new Error("supi-cache-history command not registered");
    await cmd.handler("", ctx);

    // Record more turns after the report was sent
    await pi.handlers.get("message_end")?.[0](assistantMessage(5000, 0, 5000), ctx);

    // Snapshot should still have just 1 turn
    const details = pi.messages[0].details as { turns: unknown[] };
    expect(details.turns).toHaveLength(1);
  });
});

describe("supi_cache_forensics agent tool", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(runForensics).mockReset();
  });

  it("is registered with correct name and parameters", () => {
    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    expect(pi.tools).toHaveLength(1);
    const tool = pi.tools[0] as { name: string; promptGuidelines?: string[] };
    expect(tool.name).toBe("supi_cache_forensics");
    expect(tool.promptGuidelines?.length).toBeGreaterThan(0);
  });

  it("calls runForensics with parsed params and strips human detail", async () => {
    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    vi.mocked(runForensics).mockResolvedValue({
      pattern: "hotspots",
      findings: [
        {
          sessionId: "abc",
          turnIndex: 3,
          previousRate: 90,
          currentRate: 10,
          drop: 80,
          cause: { type: "unknown" },
          toolsBefore: [{ toolName: "bash", paramKeys: ["command"], paramShapes: {} }],
          _pathsInvolved: ["/secret/path"],
          _commandSummaries: ["secret command"],
        },
      ],
      sessionsScanned: 2,
      turnsAnalyzed: 5,
    });

    const tool = pi.tools[0] as {
      execute: (
        _toolCallId: string,
        params: unknown,
        _signal: unknown,
        _onUpdate: unknown,
        ctx: unknown,
      ) => Promise<{ content: { type: string; text: string }[]; details: unknown }>;
    };

    const ctx = makeCtx();
    const result = await tool.execute(
      "tc-1",
      { pattern: "hotspots", since: "3d", minDrop: 20, maxSessions: 50 },
      undefined,
      undefined,
      ctx,
    );

    expect(runForensics).toHaveBeenCalledWith({
      pattern: "hotspots",
      since: "3d",
      minDrop: 20,
      maxSessions: 50,
      idleThresholdMinutes: 5,
      regressionThreshold: 25,
    });

    const text = result.content[0].text;
    expect(text).toContain("abc");
    expect(text).not.toContain("/secret/path");
    expect(text).not.toContain("secret command");
  });

  it("uses defaults for optional params", async () => {
    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    vi.mocked(runForensics).mockResolvedValue({
      pattern: "breakdown",
      breakdown: { compaction: 1, model_change: 0, prompt_change: 0, unknown: 0, idle: 0 },
      sessionsScanned: 1,
      turnsAnalyzed: 3,
    });

    const tool = pi.tools[0] as {
      execute: (
        _toolCallId: string,
        params: unknown,
        _signal: unknown,
        _onUpdate: unknown,
        ctx: unknown,
      ) => Promise<{ content: { type: string; text: string }[]; details: unknown }>;
    };

    const ctx = makeCtx();
    await tool.execute("tc-1", { pattern: "breakdown" }, undefined, undefined, ctx);

    expect(runForensics).toHaveBeenCalledWith(
      expect.objectContaining({
        pattern: "breakdown",
        since: "7d",
        minDrop: 0,
        maxSessions: 100,
        regressionThreshold: 25,
      }),
    );
  });
});

describe("/supi-cache-forensics command", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(runForensics).mockReset();
  });

  it("calls runForensics and sends a message with the result", async () => {
    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    vi.mocked(runForensics).mockResolvedValue({
      pattern: "breakdown",
      breakdown: { compaction: 2, model_change: 1, prompt_change: 0, unknown: 1, idle: 0 },
      sessionsScanned: 5,
      turnsAnalyzed: 20,
    });

    const cmd = pi.commands.get("supi-cache-forensics");
    if (!cmd) throw new Error("supi-cache-forensics command not registered");

    const ctx = makeCtx();
    await cmd.handler("--pattern breakdown --since 7d", ctx);

    expect(runForensics).toHaveBeenCalledWith({
      pattern: "breakdown",
      since: "7d",
      minDrop: 0,
      idleThresholdMinutes: 5,
      regressionThreshold: 25,
    });

    expect(pi.messages).toHaveLength(1);
    expect(pi.messages[0].customType).toBe("supi-cache-forensics-report");
    expect(pi.messages[0].display).toBe(true);
  });

  it("passes --since and --pattern args to runForensics", async () => {
    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    vi.mocked(runForensics).mockResolvedValue({
      pattern: "hotspots",
      findings: [],
      sessionsScanned: 0,
      turnsAnalyzed: 0,
    });

    const cmd = pi.commands.get("supi-cache-forensics");
    if (!cmd) throw new Error("supi-cache-forensics command not registered");

    const ctx = makeCtx();
    await cmd.handler("--pattern hotspots --since 3d --min-drop 15", ctx);

    expect(runForensics).toHaveBeenCalledWith({
      pattern: "hotspots",
      since: "3d",
      minDrop: 15,
      idleThresholdMinutes: 5,
      regressionThreshold: 25,
    });
  });
});

describe("no-data turns (zero cache counters)", () => {
  beforeEach(resetMocks);

  it("does not trigger false regression from a no-cache-metrics turn", async () => {
    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    const ctx = makeCtx();
    const handler = pi.handlers.get("message_end")?.[0];

    // Turn 1: 90% cache hit
    await handler(assistantMessage(9000, 0, 1000), ctx);
    // Turn 2: zero cache counters (provider switch, no cache support)
    await handler(assistantMessage(0, 0, 10000), ctx);

    // Should NOT notify regression — turn 2 is no-data, not a real 0%
    expect(ctx.ui.notify).not.toHaveBeenCalled();
    // Status should show — not 0%
    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("supi-cache", "cache: \u2014");
  });

  it("does not compare across a no-data gap", async () => {
    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    const ctx = makeCtx();
    const handler = pi.handlers.get("message_end")?.[0];

    await handler(assistantMessage(9000, 0, 1000), ctx);
    await handler(assistantMessage(0, 0, 10000), ctx);
    await handler(assistantMessage(1000, 0, 9000), ctx);

    expect(ctx.ui.notify).not.toHaveBeenCalled();
    expect(pi.entries).toHaveLength(3);
    expect((pi.entries[2].data as Record<string, unknown>).note).toBeUndefined();
    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("supi-cache", "cache: 10%");
  });

  it("carries model-change attribution across a no-data gap", async () => {
    const pi = createPiMock();
    cacheMonitorExtension(pi as never);

    const ctx = makeCtx();
    const handler = pi.handlers.get("message_end")?.[0];

    await handler(assistantMessage(9000, 0, 1000), ctx);
    await pi.handlers.get("model_select")?.[0](
      {
        type: "model_select",
        model: { provider: "anthropic", id: "claude-4" },
        previousModel: undefined,
        source: "user",
      },
      ctx,
    );
    await handler(assistantMessage(0, 0, 10000), ctx);
    await handler(assistantMessage(1000, 0, 9000), ctx);

    expect(ctx.ui.notify).not.toHaveBeenCalled();
    expect((pi.entries[1].data as Record<string, unknown>).note).toBeUndefined();
    expect((pi.entries[2].data as Record<string, unknown>).note).toBe("\u26a0 model changed");
    expect((pi.entries[2].data as Record<string, unknown>).cause).toEqual({
      type: "model_change",
      model: "anthropic/claude-4",
    });
  });
});
