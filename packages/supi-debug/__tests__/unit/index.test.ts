import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  clearDebugEvents: vi.fn(),
  configureDebugRegistry: vi.fn(),
  getDebugEvents: vi.fn(),
  getDebugSummary: vi.fn(),
  loadSupiConfig: vi.fn(),
  registerDeclarativeSettings: vi.fn(),
  registerContextProvider: vi.fn(),
  maybeLogLoadStatus: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-core/config", () => ({
  loadSupiConfig: mockFns.loadSupiConfig,
}));

vi.mock("@mrclrchtr/supi-core/settings", () => ({
  registerDeclarativeSettings: mockFns.registerDeclarativeSettings,
}));

vi.mock("@mrclrchtr/supi-core/context", () => ({
  registerContextProvider: mockFns.registerContextProvider,
}));

vi.mock("../../src/status-log.ts", () => ({
  maybeLogLoadStatus: mockFns.maybeLogLoadStatus,
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
}));

import { createPiMock } from "@mrclrchtr/supi-test-utils";
import debugExtension from "../../src/debug.ts";

const ENABLED_CONFIG = {
  enabled: true,
  agentAccess: "sanitized",
  maxEvents: 100,
} as const;

type MockDebugConfig = {
  enabled: unknown;
  agentAccess: unknown;
  maxEvents: unknown;
};

function setup(config: MockDebugConfig = ENABLED_CONFIG) {
  mockFns.loadSupiConfig.mockReturnValue(config);
  mockFns.configureDebugRegistry.mockImplementation((value) => value);
  mockFns.getDebugEvents.mockReturnValue({ events: [], rawAccessDenied: false });
  mockFns.getDebugSummary.mockReturnValue(null);
  const pi = createPiMock();
  debugExtension(pi as never);
  return pi;
}

describe("supi-debug extension setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers settings, context provider, command, tool, and lifecycle handlers", () => {
    const pi = setup();

    expect(mockFns.registerDeclarativeSettings).toHaveBeenCalledOnce();
    expect(mockFns.registerContextProvider).toHaveBeenCalledOnce();
    expect(pi.handlers.has("session_start")).toBe(true);
    expect(pi.handlers.has("resources_discover")).toBe(true);
    expect(pi.commands.has("supi-debug")).toBe(true);
    expect(pi.tools.map((tool) => (tool as { name: string }).name)).toEqual(["supi_debug"]);
  });

  it("uses a string enum schema for debug levels", () => {
    const pi = setup();
    const tool = pi.tools[0] as { parameters: { properties: Record<string, unknown> } };
    const level = tool.parameters.properties.level;

    expect(level).toMatchObject({ type: "string", enum: ["debug", "info", "warning", "error"] });
  });

  it("configures the debug registry from merged config on load", () => {
    setup({ enabled: true, agentAccess: "raw", maxEvents: 250 });

    expect(mockFns.configureDebugRegistry).toHaveBeenCalledWith({
      enabled: true,
      agentAccess: "raw",
      maxEvents: 250,
    });
  });

  it("treats string enabled values explicitly instead of using truthiness", () => {
    setup({ enabled: "false", agentAccess: "raw", maxEvents: 250 });

    expect(mockFns.configureDebugRegistry).toHaveBeenCalledWith({
      enabled: false,
      agentAccess: "raw",
      maxEvents: 250,
    });
  });

  it("clears events and reapplies config on session_start", () => {
    const pi = setup();

    pi.handlers.get("session_start")?.[0]?.({}, { cwd: "/repo" });

    expect(mockFns.clearDebugEvents).toHaveBeenCalledOnce();
    expect(mockFns.loadSupiConfig).toHaveBeenCalledWith("debug", "/repo", expect.any(Object));
  });

  it("logs the load inventory after resource discovery", () => {
    const pi = setup();

    pi.handlers.get("resources_discover")?.[0]?.({}, { cwd: "/repo" });

    expect(mockFns.maybeLogLoadStatus).toHaveBeenCalledWith(pi, "/repo", "resources_discover");
  });

  it("context provider returns aggregate summary without event payloads", () => {
    setup();
    mockFns.getDebugSummary.mockReturnValue({
      total: 3,
      byLevel: { warning: 2, debug: 1 },
      bySource: { lsp: 3 },
    });

    const provider = mockFns.registerContextProvider.mock.calls[0][0];

    expect(provider.getData()).toEqual({
      total: 3,
      "level:warning": 2,
      "level:debug": 1,
      "source:lsp": 3,
    });
  });
});

describe("supi-debug settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers declarative settings with expected fields and type-driven persistence", () => {
    setup({ enabled: false, agentAccess: "raw", maxEvents: 250 });

    const options = mockFns.registerDeclarativeSettings.mock.calls[0][1];

    // Verify fields are declared declaratively
    expect(options.fields).toHaveLength(3);
    expect(options.fields[0]).toMatchObject({ kind: "boolean", key: "enabled" });
    expect(options.fields[1]).toMatchObject({
      kind: "enum",
      key: "agentAccess",
      values: ["off", "sanitized", "raw"],
    });
    expect(options.fields[2]).toMatchObject({ kind: "number", key: "maxEvents" });

    // Verify afterPersist triggers live sync
    mockFns.configureDebugRegistry.mockClear();
    mockFns.loadSupiConfig.mockReturnValue({
      enabled: true,
      agentAccess: "raw",
      maxEvents: 500,
    });

    options.afterPersist?.({
      scope: "project",
      cwd: "/repo",
      fieldKey: "enabled",
      action: "set",
      storedValue: "on",
      effectiveValue: true,
      effectiveSource: "project",
    });

    // afterPersist should call syncLiveDebugRegistry which calls applyDebugConfig → configureDebugRegistry
    expect(mockFns.configureDebugRegistry).toHaveBeenCalled();
  });

  it("reconfigures the live registry on afterPersist", () => {
    setup();

    const options = mockFns.registerDeclarativeSettings.mock.calls[0][1];
    mockFns.configureDebugRegistry.mockClear();
    mockFns.clearDebugEvents.mockClear();
    mockFns.loadSupiConfig.mockReturnValue({
      enabled: false,
      agentAccess: "raw",
      maxEvents: 50,
    });

    options.afterPersist?.({
      scope: "project",
      cwd: "/repo",
      fieldKey: "enabled",
      action: "set",
      storedValue: "off",
      effectiveValue: false,
      effectiveSource: "project",
    });

    expect(mockFns.configureDebugRegistry).toHaveBeenCalled();
  });
});

describe("supi-debug command and tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("command reports disabled debugging", async () => {
    const pi = setup({
      enabled: false,
      agentAccess: "sanitized",
      maxEvents: 100,
    });

    const cmd = pi.commands.get("supi-debug") as {
      handler: (args: string, ctx: { cwd: string }) => Promise<void>;
    };
    await cmd?.handler("", { cwd: "/repo" });

    expect(pi.messages[0]?.content).toContain("disabled");
    expect(mockFns.getDebugEvents).not.toHaveBeenCalled();
  });

  it("command renders sanitized recent events", async () => {
    const pi = setup();
    mockFns.getDebugEvents.mockReturnValue({
      rawAccessDenied: false,
      events: [
        {
          id: 1,
          timestamp: 1_700_000_000_000,
          source: "lsp",
          level: "warning",
          category: "fallback",
          message: "timeout",
          cwd: "/repo",
          data: { command: "git status" },
        },
      ],
    });

    const cmd = pi.commands.get("supi-debug") as {
      handler: (args: string, ctx: { cwd: string }) => Promise<void>;
    };
    await cmd?.handler("source=lsp level=warning limit=5", { cwd: "/repo" });

    expect(mockFns.getDebugEvents).toHaveBeenCalledWith({
      source: "lsp",
      level: "warning",
      limit: 5,
    });
    expect(pi.messages[0]?.content).toContain("lsp");
    expect(pi.messages[0]?.content).toContain("git status");
  });

  it("command handles circular and bigint payloads without crashing", async () => {
    const pi = setup();
    const circular: Record<string, unknown> = { count: 1n };
    circular.self = circular;
    mockFns.getDebugEvents.mockReturnValue({
      rawAccessDenied: false,
      events: [
        {
          id: 1,
          timestamp: 1_700_000_000_000,
          source: "lsp",
          level: "warning",
          category: "fallback",
          message: "timeout",
          data: circular,
        },
      ],
    });

    const cmd = pi.commands.get("supi-debug") as {
      handler: (args: string, ctx: { cwd: string }) => Promise<void>;
    };

    await expect(cmd?.handler("source=lsp", { cwd: "/repo" })).resolves.toBeUndefined();
    expect(pi.messages[0]?.content).toContain('"[Circular]"');
    expect(pi.messages[0]?.content).toContain("1n");
  });

  it("tool denies access when agent access is off", async () => {
    const pi = setup({ enabled: true, agentAccess: "off", maxEvents: 100 });
    const tool = pi.tools[0] as { name: string; execute: (...args: unknown[]) => Promise<unknown> };

    await expect(tool?.execute("id", {}, undefined, undefined, { cwd: "/repo" })).rejects.toThrow(
      "Agent access to SuPi debug events is disabled.",
    );
  });

  it("tool returns sanitized events and reports raw denial", async () => {
    const pi = setup();
    mockFns.getDebugEvents.mockReturnValue({
      rawAccessDenied: true,
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
    });
    const tool = pi.tools[0] as { name: string; execute: (...args: unknown[]) => Promise<unknown> };

    const result = (await tool?.execute(
      "id",
      { source: "lsp", includeRaw: true },
      undefined,
      undefined,
      { cwd: "/repo" },
    )) as {
      details: { rawAccessDenied: boolean };
      content: Array<{ text: string }>;
    };

    expect(mockFns.getDebugEvents).toHaveBeenCalledWith({
      source: "lsp",
      level: undefined,
      category: undefined,
      limit: undefined,
      includeRaw: true,
      allowRaw: false,
    });
    expect(result.details.rawAccessDenied).toBe(true);
    expect(result.content[0]?.text).toContain("Raw debug data was requested");
  });

  it("tool requests raw events when raw access is enabled", async () => {
    const pi = setup({ enabled: true, agentAccess: "raw", maxEvents: 100 });
    const tool = pi.tools[0] as { name: string; execute: (...args: unknown[]) => Promise<unknown> };

    await tool?.execute("id", { includeRaw: true }, undefined, undefined, { cwd: "/repo" });

    expect(mockFns.getDebugEvents).toHaveBeenCalledWith({
      source: undefined,
      level: undefined,
      category: undefined,
      limit: undefined,
      includeRaw: true,
      allowRaw: true,
    });
  });

  it("tool renders resilient payload formatting for raw events", async () => {
    const pi = setup({ enabled: true, agentAccess: "raw", maxEvents: 100 });
    const circular: Record<string, unknown> = { count: 2n };
    circular.self = circular;
    mockFns.getDebugEvents.mockReturnValue({
      rawAccessDenied: false,
      events: [
        {
          id: 1,
          timestamp: 1_700_000_000_000,
          source: "lsp",
          level: "warning",
          category: "fallback",
          message: "timeout",
          rawData: circular,
        },
      ],
    });
    const tool = pi.tools[0] as { name: string; execute: (...args: unknown[]) => Promise<unknown> };

    const result = (await tool?.execute("id", { includeRaw: true }, undefined, undefined, {
      cwd: "/repo",
    })) as {
      content: Array<{ text: string }>;
    };

    expect(result.content[0]?.text).toContain('"[Circular]"');
    expect(result.content[0]?.text).toContain("2n");
  });
});
