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

vi.mock("@mrclrchtr/supi-core", () => ({
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

import debugExtension from "../index.ts";

interface PiMock {
  handlers: Map<string, (...args: unknown[]) => unknown>;
  commands: Map<string, { handler: (args: string, ctx: { cwd: string }) => Promise<void> }>;
  tools: Array<{ name: string; execute: (...args: unknown[]) => Promise<unknown> }>;
  messages: Array<{ customType: string; content: string; display: boolean }>;
  pi: {
    on: (event: string, handler: (...args: unknown[]) => unknown) => void;
    registerCommand: (
      name: string,
      spec: { handler: (args: string, ctx: { cwd: string }) => Promise<void> },
    ) => void;
    registerTool: (tool: {
      name: string;
      execute: (...args: unknown[]) => Promise<unknown>;
    }) => void;
    sendMessage: (message: { customType: string; content: string; display: boolean }) => void;
  };
}

const ENABLED_CONFIG = {
  enabled: true,
  agentAccess: "sanitized",
  maxEvents: 100,
  notifyLevel: "off",
};

function createPiMock(): PiMock {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const commands = new Map<
    string,
    { handler: (args: string, ctx: { cwd: string }) => Promise<void> }
  >();
  const tools: PiMock["tools"] = [];
  const messages: PiMock["messages"] = [];
  return {
    handlers,
    commands,
    tools,
    messages,
    pi: {
      on(event, handler) {
        handlers.set(event, handler);
      },
      registerCommand(name, spec) {
        commands.set(name, spec);
      },
      registerTool(tool) {
        tools.push(tool);
      },
      sendMessage(message) {
        messages.push(message);
      },
    },
  };
}

function setup(config = ENABLED_CONFIG): PiMock {
  mockFns.loadSupiConfig.mockReturnValue(config);
  mockFns.configureDebugRegistry.mockImplementation((value) => value);
  mockFns.getDebugEvents.mockReturnValue({ events: [], rawAccessDenied: false });
  mockFns.getDebugSummary.mockReturnValue(null);
  const mock = createPiMock();
  debugExtension(mock.pi as never);
  return mock;
}

describe("supi-debug extension setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers settings, context provider, command, tool, and session handler", () => {
    const mock = setup();

    expect(mockFns.registerConfigSettings).toHaveBeenCalledOnce();
    expect(mockFns.registerContextProvider).toHaveBeenCalledOnce();
    expect(mock.handlers.has("session_start")).toBe(true);
    expect(mock.commands.has("supi-debug")).toBe(true);
    expect(mock.tools.map((tool) => tool.name)).toEqual(["supi_debug"]);
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

  it("clears events and reapplies config on session_start", () => {
    const mock = setup();

    mock.handlers.get("session_start")?.({}, { cwd: "/repo" });

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
  });
});

describe("supi-debug command and tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("command reports disabled debugging", async () => {
    const mock = setup({
      enabled: false,
      agentAccess: "sanitized",
      maxEvents: 100,
      notifyLevel: "off",
    });

    await mock.commands.get("supi-debug")?.handler("", { cwd: "/repo" });

    expect(mock.messages[0]?.content).toContain("disabled");
    expect(mockFns.getDebugEvents).not.toHaveBeenCalled();
  });

  it("command renders sanitized recent events", async () => {
    const mock = setup();
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

    await mock.commands
      .get("supi-debug")
      ?.handler("source=rtk level=warning limit=5", { cwd: "/repo" });

    expect(mockFns.getDebugEvents).toHaveBeenCalledWith({
      source: "rtk",
      level: "warning",
      limit: 5,
    });
    expect(mock.messages[0]?.content).toContain("rtk");
    expect(mock.messages[0]?.content).toContain("git status");
  });

  it("tool denies access when agent access is off", async () => {
    const mock = setup({ enabled: true, agentAccess: "off", maxEvents: 100, notifyLevel: "off" });
    const tool = mock.tools[0];

    const result = (await tool?.execute("id", {}, undefined, undefined, { cwd: "/repo" })) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("disabled");
  });

  it("tool returns sanitized events and reports raw denial", async () => {
    const mock = setup();
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
    const tool = mock.tools[0];

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
    const mock = setup({ enabled: true, agentAccess: "raw", maxEvents: 100, notifyLevel: "off" });
    const tool = mock.tools[0];

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
});
