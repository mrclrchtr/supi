import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  clearDebugEvents: vi.fn(),
  configureDebugRegistry: vi.fn(),
  getDebugEvents: vi.fn(),
  getDebugSummary: vi.fn(),
  loadSupiConfig: vi.fn(),
  registerConfigSettings: vi.fn(),
  registerContextProvider: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-core/api", () => ({
  clearDebugEvents: mockFns.clearDebugEvents,
  configureDebugRegistry: mockFns.configureDebugRegistry,
  DEBUG_REGISTRY_DEFAULTS: {
    enabled: false,
    agentAccess: "sanitized",
    maxEvents: 100,
    notifyLevel: "off",
  },
  getDebugEvents: mockFns.getDebugEvents,
  getDebugSummary: mockFns.getDebugSummary,
  loadSupiConfig: mockFns.loadSupiConfig,
  registerConfigSettings: mockFns.registerConfigSettings,
  registerContextProvider: mockFns.registerContextProvider,
}));

import { createPiMock } from "@mrclrchtr/supi-test-utils";
import debugExtension from "../src/debug.ts";

const ENABLED_CONFIG = {
  enabled: true,
  agentAccess: "sanitized",
  maxEvents: 100,
  notifyLevel: "off",
} as const;

type MockDebugConfig = {
  enabled: unknown;
  agentAccess: unknown;
  maxEvents: unknown;
  notifyLevel: unknown;
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

  it("registers settings, context provider, command, tool, and session handler", () => {
    const pi = setup();

    expect(mockFns.registerConfigSettings).toHaveBeenCalledOnce();
    expect(mockFns.registerContextProvider).toHaveBeenCalledOnce();
    expect(pi.handlers.has("session_start")).toBe(true);
    expect(pi.commands.has("supi-debug")).toBe(true);
    expect(pi.tools.map((tool) => (tool as { name: string }).name)).toEqual(["supi_debug"]);
  });

  it("configures the debug registry from merged config on load", () => {
    setup({ enabled: true, agentAccess: "raw", maxEvents: 250, notifyLevel: "warning" });

    expect(mockFns.configureDebugRegistry).toHaveBeenCalledWith({
      enabled: true,
      agentAccess: "raw",
      maxEvents: 250,
      notifyLevel: "warning",
    });
  });

  it("treats string enabled values explicitly instead of using truthiness", () => {
    setup({ enabled: "false", agentAccess: "raw", maxEvents: 250, notifyLevel: "warning" });

    expect(mockFns.configureDebugRegistry).toHaveBeenCalledWith({
      enabled: false,
      agentAccess: "raw",
      maxEvents: 250,
      notifyLevel: "warning",
    });
  });

  it("clears events and reapplies config on session_start", () => {
    const pi = setup();

    pi.handlers.get("session_start")?.[0]?.({}, { cwd: "/repo" });

    expect(mockFns.clearDebugEvents).toHaveBeenCalledOnce();
    expect(mockFns.loadSupiConfig).toHaveBeenCalledWith("debug", "/repo", expect.any(Object));
  });

  it("context provider returns aggregate summary without event payloads", () => {
    setup();
    mockFns.getDebugSummary.mockReturnValue({
      total: 3,
      byLevel: { warning: 2, debug: 1 },
      bySource: { rtk: 3 },
    });

    const provider = mockFns.registerContextProvider.mock.calls[0][0];

    expect(provider.getData()).toEqual({
      total: 3,
      "level:warning": 2,
      "level:debug": 1,
      "source:rtk": 3,
    });
  });
});

describe("supi-debug settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds setting items and persists typed values", () => {
    setup({ enabled: false, agentAccess: "raw", maxEvents: 250, notifyLevel: "error" });

    const options = mockFns.registerConfigSettings.mock.calls[0][0];
    expect(
      options.buildItems({
        enabled: false,
        agentAccess: "raw",
        maxEvents: 250,
        notifyLevel: "error",
      }),
    ).toMatchObject([
      { id: "enabled", currentValue: "off" },
      { id: "agentAccess", currentValue: "raw" },
      { id: "maxEvents", currentValue: "250" },
      { id: "notifyLevel", currentValue: "error" },
    ]);

    const helpers = { set: vi.fn(), unset: vi.fn() };
    mockFns.configureDebugRegistry.mockClear();
    mockFns.loadSupiConfig.mockReturnValue({
      enabled: true,
      agentAccess: "raw",
      maxEvents: 500,
      notifyLevel: "warning",
    });
    options.persistChange("project", "/repo", "enabled", "on", helpers);
    options.persistChange("project", "/repo", "agentAccess", "raw", helpers);
    options.persistChange("project", "/repo", "maxEvents", "500", helpers);
    options.persistChange("project", "/repo", "notifyLevel", "warning", helpers);

    expect(helpers.set.mock.calls).toEqual([
      ["enabled", true],
      ["agentAccess", "raw"],
      ["maxEvents", 500],
      ["notifyLevel", "warning"],
    ]);
    expect(mockFns.configureDebugRegistry).toHaveBeenCalledWith({
      enabled: true,
      agentAccess: "raw",
      maxEvents: 500,
      notifyLevel: "warning",
    });
  });

  it("reconfigures the live registry immediately and clears events when disabling", () => {
    setup();

    const options = mockFns.registerConfigSettings.mock.calls[0][0];
    const helpers = { set: vi.fn(), unset: vi.fn() };
    mockFns.configureDebugRegistry.mockClear();
    mockFns.clearDebugEvents.mockClear();
    mockFns.loadSupiConfig.mockReturnValue({
      enabled: false,
      agentAccess: "raw",
      maxEvents: 50,
      notifyLevel: "error",
    });

    options.persistChange("project", "/repo", "enabled", "off", helpers);

    expect(helpers.set).toHaveBeenCalledWith("enabled", false);
    expect(mockFns.configureDebugRegistry).toHaveBeenCalledWith({
      enabled: false,
      agentAccess: "raw",
      maxEvents: 50,
      notifyLevel: "error",
    });
    expect(mockFns.clearDebugEvents).toHaveBeenCalledOnce();
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
      notifyLevel: "off",
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
          source: "rtk",
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
    await cmd?.handler("source=rtk level=warning limit=5", { cwd: "/repo" });

    expect(mockFns.getDebugEvents).toHaveBeenCalledWith({
      source: "rtk",
      level: "warning",
      limit: 5,
    });
    expect(pi.messages[0]?.content).toContain("rtk");
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
          source: "rtk",
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

    await expect(cmd?.handler("source=rtk", { cwd: "/repo" })).resolves.toBeUndefined();
    expect(pi.messages[0]?.content).toContain('"[Circular]"');
    expect(pi.messages[0]?.content).toContain("1n");
  });

  it("tool denies access when agent access is off", async () => {
    const pi = setup({ enabled: true, agentAccess: "off", maxEvents: 100, notifyLevel: "off" });
    const tool = pi.tools[0] as { name: string; execute: (...args: unknown[]) => Promise<unknown> };

    const result = (await tool?.execute("id", {}, undefined, undefined, { cwd: "/repo" })) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("disabled");
  });

  it("tool returns sanitized events and reports raw denial", async () => {
    const pi = setup();
    mockFns.getDebugEvents.mockReturnValue({
      rawAccessDenied: true,
      events: [
        {
          id: 1,
          timestamp: 1_700_000_000_000,
          source: "rtk",
          level: "warning",
          category: "fallback",
          message: "timeout",
        },
      ],
    });
    const tool = pi.tools[0] as { name: string; execute: (...args: unknown[]) => Promise<unknown> };

    const result = (await tool?.execute(
      "id",
      { source: "rtk", includeRaw: true },
      undefined,
      undefined,
      { cwd: "/repo" },
    )) as {
      details: { rawAccessDenied: boolean };
      content: Array<{ text: string }>;
    };

    expect(mockFns.getDebugEvents).toHaveBeenCalledWith({
      source: "rtk",
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
    const pi = setup({ enabled: true, agentAccess: "raw", maxEvents: 100, notifyLevel: "off" });
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
    const pi = setup({ enabled: true, agentAccess: "raw", maxEvents: 100, notifyLevel: "off" });
    const circular: Record<string, unknown> = { count: 2n };
    circular.self = circular;
    mockFns.getDebugEvents.mockReturnValue({
      rawAccessDenied: false,
      events: [
        {
          id: 1,
          timestamp: 1_700_000_000_000,
          source: "rtk",
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
