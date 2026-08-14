import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  clearDebugEvents: vi.fn(),
  configureDebugRegistry: vi.fn(),
  getDebugEvents: vi.fn(),
  getDebugSummary: vi.fn(),
  isDebugLevel: vi.fn(),
  isDebugOperationId: vi.fn((value) => value === "op-AAAAAAAAAAAAAAAAAAAAAA"),
  loadSupiConfig: vi.fn(),
  defineConfigSettings: vi.fn((options) => options),
  registerSettings: vi.fn(),
  registerContextProvider: vi.fn(),
  subscribeDebugEvents: vi.fn<(listener: (event: unknown) => void) => () => void>(() => vi.fn()),
  readSessionDebugEvents: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-core/config", () => ({
  loadSupiConfig: mockFns.loadSupiConfig,
}));

vi.mock("@mrclrchtr/supi-core/settings", () => ({
  defineConfigSettings: mockFns.defineConfigSettings,
  registerSettings: mockFns.registerSettings,
}));

vi.mock("@mrclrchtr/supi-core/context", () => ({
  registerContextProvider: mockFns.registerContextProvider,
}));

vi.mock("@mrclrchtr/supi-core/debug", () => ({
  clearDebugEvents: mockFns.clearDebugEvents,
  configureDebugRegistry: mockFns.configureDebugRegistry,
  DEBUG_REGISTRY_DEFAULTS: {
    enabled: false,
    agentAccess: "sanitized",
    maxEvents: 100,
  },
  getDebugEvents: mockFns.getDebugEvents,
  getDebugSummary: mockFns.getDebugSummary,
  isDebugLevel: mockFns.isDebugLevel,
  isDebugOperationId: mockFns.isDebugOperationId,
  subscribeDebugEvents: mockFns.subscribeDebugEvents,
}));

vi.mock("../../src/session-events.ts", () => ({
  DEBUG_EVENT_ENTRY_TYPE: "supi-debug-event",
  readSessionDebugEvents: mockFns.readSessionDebugEvents,
}));

import { createPiMock } from "@mrclrchtr/supi-test-utils";
import debugExtension from "../../src/debug.ts";

function setup(config = { enabled: true, agentAccess: "sanitized", maxEvents: 100 }) {
  mockFns.loadSupiConfig.mockReturnValue(config);
  mockFns.configureDebugRegistry.mockImplementation((value) => value);
  mockFns.getDebugEvents.mockReturnValue({ events: [], rawAccessDenied: false });
  mockFns.getDebugSummary.mockReturnValue(null);
  const pi = createPiMock();
  void debugExtension(pi as never);
  return pi;
}

function makeTool(pi: ReturnType<typeof createPiMock>) {
  return pi.tools[0] as { execute: (...args: unknown[]) => Promise<unknown> };
}

describe("supi-debug tool output", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an invalid Debug Operation ID before querying retained events", async () => {
    const pi = setup();
    const tool = makeTool(pi);

    await expect(
      tool.execute("debug-call", { operationId: "raw-public-call" }, undefined, undefined, {
        cwd: "/repo",
      }),
    ).rejects.toThrow("Invalid Debug Operation ID");
    expect(mockFns.getDebugEvents).not.toHaveBeenCalled();
  });

  it("throws when debug capture is disabled", async () => {
    const pi = setup({
      enabled: false,
      agentAccess: "sanitized",
      maxEvents: 100,
    });
    const tool = makeTool(pi);

    await expect(tool.execute("id", {}, undefined, undefined, { cwd: "/repo" })).rejects.toThrow(
      "SuPi debug event capture is disabled",
    );
  });

  it("persists sanitized events as session entries", () => {
    const pi = setup();
    const listener = mockFns.subscribeDebugEvents.mock.calls[0]?.[0] as (event: unknown) => void;
    const event = {
      id: 1,
      timestamp: 1_700_000_000_000,
      source: "lsp",
      level: "warning",
      category: "fallback",
      message: "timeout",
      data: { command: "git status" },
    };

    listener(event);

    expect(pi.entries).toEqual([{ type: "supi-debug-event", data: event }]);
  });

  it("resolves relative historical tool paths from the tool cwd", async () => {
    const pi = setup({ enabled: false, agentAccess: "sanitized", maxEvents: 100 });
    mockFns.readSessionDebugEvents.mockResolvedValue({ events: [], persistedEventCount: 0 });
    const tool = makeTool(pi);

    await tool.execute("id", { sessionFile: "@logs/other.jsonl" }, undefined, undefined, {
      cwd: "/repo",
    });

    expect(mockFns.readSessionDebugEvents).toHaveBeenCalledWith("/repo/logs/other.jsonl", {
      operationId: undefined,
      source: undefined,
      level: undefined,
      category: undefined,
      limit: undefined,
    });
  });

  it("reads persisted events from another session", async () => {
    const pi = setup({ enabled: false, agentAccess: "raw", maxEvents: 100 });
    mockFns.readSessionDebugEvents.mockResolvedValue({
      events: [
        {
          id: 1,
          timestamp: 1_700_000_000_000,
          source: "lsp",
          level: "warning",
          category: "fallback",
          message: "timeout",
        },
      ],
      persistedEventCount: 1,
    });
    const tool = makeTool(pi);

    const result = (await tool.execute(
      "id",
      { sessionFile: "/sessions/other.jsonl", source: "lsp", includeRaw: true },
      undefined,
      undefined,
      { cwd: "/repo" },
    )) as {
      content: Array<{ text: string }>;
      details: { enabled: boolean; rawDataUnavailable: boolean };
    };

    expect(mockFns.readSessionDebugEvents).toHaveBeenCalledWith("/sessions/other.jsonl", {
      operationId: undefined,
      source: "lsp",
      level: undefined,
      category: undefined,
      limit: undefined,
    });
    expect(result.content[0]?.text).toContain("Raw debug data is not persisted");
    expect(result.details.enabled).toBe(false);
    expect(result.details.rawDataUnavailable).toBe(true);
  });

  it("shows and filters a Debug Operation ID for persisted events", async () => {
    const operationId = "op-AAAAAAAAAAAAAAAAAAAAAA";
    const pi = setup({ enabled: false, agentAccess: "sanitized", maxEvents: 100 });
    mockFns.readSessionDebugEvents.mockResolvedValue({
      events: [
        {
          id: 1,
          timestamp: 1_700_000_000_000,
          source: "code-intelligence",
          level: "debug",
          category: "code-operation.start",
          message: "Code operation started",
          operationId,
        },
      ],
      persistedEventCount: 1,
    });
    const tool = makeTool(pi);

    const result = (await tool.execute(
      "debug-call",
      { sessionFile: "/sessions/other.jsonl", operationId },
      undefined,
      undefined,
      { cwd: "/repo" },
    )) as { content: Array<{ text: string }>; details: { events: unknown[] } };

    expect(mockFns.readSessionDebugEvents).toHaveBeenCalledWith("/sessions/other.jsonl", {
      operationId,
      source: undefined,
      level: undefined,
      category: undefined,
      limit: undefined,
    });
    expect(result.content[0]?.text).toContain(`operationId: ${operationId}`);
    expect(result.details.events).toEqual([expect.objectContaining({ operationId })]);
  });

  it("identifies sessions recorded before debug persistence", async () => {
    const pi = setup({ enabled: false, agentAccess: "sanitized", maxEvents: 100 });
    mockFns.readSessionDebugEvents.mockResolvedValue({ events: [], persistedEventCount: 0 });
    const tool = makeTool(pi);

    const result = (await tool.execute(
      "id",
      { sessionFile: "/sessions/old.jsonl" },
      undefined,
      undefined,
      { cwd: "/repo" },
    )) as { content: Array<{ text: string }> };

    expect(result.content[0]?.text).toContain("cannot be backfilled");
  });

  it("resolves relative historical command paths from the command cwd", async () => {
    const pi = setup({ enabled: false, agentAccess: "sanitized", maxEvents: 100 });
    mockFns.readSessionDebugEvents.mockResolvedValue({ events: [], persistedEventCount: 0 });
    const command = pi.commands.get("supi-debug") as {
      handler: (args: string, ctx: { cwd: string }) => Promise<void>;
    };

    await command.handler("sessionFile=@logs/old.jsonl", { cwd: "/repo" });

    expect(mockFns.readSessionDebugEvents).toHaveBeenCalledWith("/repo/logs/old.jsonl", {
      operationId: undefined,
      source: undefined,
      level: undefined,
      category: undefined,
      limit: undefined,
    });
  });

  it("accepts sessionFile for historical command inspection", async () => {
    const pi = setup({ enabled: false, agentAccess: "sanitized", maxEvents: 100 });
    mockFns.readSessionDebugEvents.mockResolvedValue({ events: [], persistedEventCount: 0 });
    const command = pi.commands.get("supi-debug") as {
      handler: (args: string, ctx: { cwd: string }) => Promise<void>;
    };

    await command.handler("sessionFile=/sessions/old.jsonl", { cwd: "/repo" });

    expect(mockFns.readSessionDebugEvents).toHaveBeenCalledWith("/sessions/old.jsonl", {
      operationId: undefined,
      source: undefined,
      level: undefined,
      category: undefined,
      limit: undefined,
    });
  });

  it("keeps the truncation notice inside the output bounds", async () => {
    const pi = setup();
    mockFns.getDebugEvents.mockReturnValue({
      rawAccessDenied: false,
      events: Array.from({ length: 2_100 }, (_, index) => ({
        id: index + 1,
        timestamp: 1_700_000_000_000 + index,
        source: "lsp",
        level: "debug",
        category: "trace",
        message: `event-${index + 1}`,
      })),
    });
    const tool = makeTool(pi);

    const result = (await tool.execute("id", {}, undefined, undefined, { cwd: "/repo" })) as {
      content: Array<{ text: string }>;
    };
    const text = result.content[0]?.text ?? "";

    expect(text).toContain("[Output truncated:");
    expect(text.split("\n").length).toBeLessThanOrEqual(2_000);
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(50 * 1024);
  });

  it("truncates large tool output and reports truncation metadata", async () => {
    const pi = setup();
    mockFns.getDebugEvents.mockReturnValue({
      rawAccessDenied: false,
      events: Array.from({ length: 2_100 }, (_, index) => ({
        id: index + 1,
        timestamp: 1_700_000_000_000 + index,
        source: "lsp",
        level: "debug",
        category: "trace",
        message: `event-${index + 1}`,
      })),
    });
    const tool = makeTool(pi);

    const result = (await tool.execute("id", {}, undefined, undefined, { cwd: "/repo" })) as {
      content: Array<{ text: string }>;
      details: { truncation?: { truncated: boolean; outputLines: number; totalLines: number } };
    };

    expect(mockFns.getDebugEvents).toHaveBeenCalledOnce();
    expect(result.content[0]?.text).toContain("[Output truncated:");
    expect(result.details.truncation).toMatchObject({
      truncated: true,
      totalLines: 2_100,
    });
    expect(result.details.truncation?.outputLines).toBeLessThan(2_100);
  });
});

it("renders identity-bearing LSP events with cwd, server, file, and method", async () => {
  const pi = setup();
  mockFns.getDebugEvents.mockReturnValue({
    rawAccessDenied: false,
    events: [
      {
        id: 1,
        timestamp: 1_700_000_000_000,
        source: "lsp",
        level: "debug",
        category: "request.timing",
        message: "LSP semantic request completed for textDocument/hover",
        cwd: "/home/user/workspace",
        data: {
          method: "textDocument/hover",
          methodClass: "semantic",
          outcome: "completed",
          server: "typescript",
          timing: { durationMs: 5, phasesMs: { request: 5 } },
        },
      },
      {
        id: 2,
        timestamp: 1_700_000_001_000,
        source: "lsp",
        level: "debug",
        category: "diagnostics.timing",
        message: "LSP diagnostic sync-file completed",
        cwd: "/home/user/workspace",
        data: { operation: "sync-file", file: "src/index.ts", server: "typescript" },
      },
    ],
  });
  const tool = makeTool(pi);

  const result = (await tool.execute("id", { source: "lsp" }, undefined, undefined, {
    cwd: "/repo",
  })) as { content: Array<{ text: string }> };

  const text = result.content[0]?.text ?? "";
  expect(text).toContain("cwd: /home/user/workspace");
  expect(text).toContain("textDocument/hover");
  expect(text).toContain("server");
  expect(text).toContain("src/index.ts");
});
