import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  createBashTool: vi.fn(),
  createLocalBashOperations: vi.fn(),
  loadSupiConfig: vi.fn(),
  recordDebugEvent: vi.fn(),
  registerConfigSettings: vi.fn(),
  registerContextProvider: vi.fn(),
  getShellPath: vi.fn(),
  getShellCommandPrefix: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: mockFns.execFileSync,
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
  createBashTool: mockFns.createBashTool,
  createLocalBashOperations: mockFns.createLocalBashOperations,
  SettingsManager: {
    create: () => ({
      getShellPath: mockFns.getShellPath,
      getShellCommandPrefix: mockFns.getShellCommandPrefix,
    }),
  },
}));

vi.mock("@mrclrchtr/supi-core", () => ({
  loadSupiConfig: mockFns.loadSupiConfig,
  recordDebugEvent: mockFns.recordDebugEvent,
  registerConfigSettings: mockFns.registerConfigSettings,
  registerContextProvider: mockFns.registerContextProvider,
}));

import { registerConfigSettings, registerContextProvider } from "@mrclrchtr/supi-core";
import rtkExtension from "../index.ts";
import { resetTracking } from "../tracking.ts";

interface PiMock {
  handlers: Map<string, (...args: unknown[]) => unknown>;
  tools: unknown[];
  pi: {
    on: (event: string, handler: (...args: unknown[]) => unknown) => void;
    registerTool: (tool: unknown) => void;
    registerCommand: (name: string, spec: unknown) => void;
  };
}

interface BashTool {
  name: string;
  execute: (...args: unknown[]) => Promise<unknown>;
}

interface UiCtx {
  cwd: string;
  hasUI: boolean;
  ui: {
    notify: ReturnType<typeof vi.fn>;
  };
}

function createPiMock(): PiMock {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const tools: unknown[] = [];
  return {
    handlers,
    tools,
    pi: {
      on(event: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(event, handler);
      },
      registerTool(tool: unknown) {
        tools.push(tool);
      },
      registerCommand(_name: string, _spec: unknown) {},
    },
  };
}

function getRegisteredBashTool(tools: unknown[]): BashTool | undefined {
  return tools.find((tool) => (tool as BashTool).name === "bash") as BashTool | undefined;
}

function createUiCtx(cwd = "/project"): UiCtx {
  return {
    cwd,
    hasUI: true,
    ui: {
      notify: vi.fn(),
    },
  };
}

const VERSION_OUTPUT = "rtk 1.0.0";

function mockRtkAvailable(): void {
  mockFns.execFileSync.mockImplementation((...args: unknown[]) => {
    const [cmd, argv] = args as [string, string[]];
    if (cmd === "rtk" && Array.isArray(argv)) {
      if (argv[0] === "--version") {
        return VERSION_OUTPUT;
      }
      if (argv[0] === "rewrite") {
        return `rtk ${argv[1] ?? ""}`;
      }
    }
    throw new Error(`Unexpected call: ${cmd} ${JSON.stringify(argv)}`);
  });
}

describe("rtkExtension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTracking();
    mockRtkAvailable();
    mockFns.loadSupiConfig.mockReturnValue({ enabled: true, rewriteTimeout: 5000 });
    mockFns.getShellPath.mockReturnValue(undefined);
    mockFns.getShellCommandPrefix.mockReturnValue(undefined);
    mockFns.createBashTool.mockImplementation((_cwd, options) => {
      return { name: "bash", execute: vi.fn().mockResolvedValue(undefined), ...options };
    });
    mockFns.createLocalBashOperations.mockReturnValue({ exec: vi.fn() });
  });

  it("does not throw when the rtk binary is missing", () => {
    mockFns.execFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const { pi } = createPiMock();
    expect(() => rtkExtension(pi as never)).not.toThrow();
  });

  it("registers settings, context provider, and event handlers", () => {
    const { pi, handlers, tools } = createPiMock();
    rtkExtension(pi as never);

    expect(registerConfigSettings).toHaveBeenCalled();
    expect(registerContextProvider).toHaveBeenCalled();
    expect(handlers.has("session_start")).toBe(true);
    expect(handlers.has("user_bash")).toBe(true);
    expect(tools).toHaveLength(1);
  });

  it("execute creates the bash tool with the current ctx.cwd and shell settings", async () => {
    const { pi, tools } = createPiMock();
    rtkExtension(pi as never);

    const bashTool = getRegisteredBashTool(tools);
    expect(bashTool).toBeDefined();
    if (!bashTool) {
      throw new Error("bash tool not registered");
    }

    mockFns.getShellPath.mockReturnValue("/bin/zsh");
    mockFns.getShellCommandPrefix.mockReturnValue("source ~/.zshrc");

    await bashTool.execute("id", { command: "git status" }, undefined, () => {}, createUiCtx());

    const lastCall = vi.mocked(mockFns.createBashTool).mock.lastCall;
    expect(lastCall?.[0]).toBe("/project");
    expect(lastCall?.[1]).toMatchObject({
      shellPath: "/bin/zsh",
      commandPrefix: "source ~/.zshrc",
    });
  });

  it("spawnHook rewrites commands when enabled", async () => {
    const { pi, tools } = createPiMock();
    rtkExtension(pi as never);

    const bashTool = getRegisteredBashTool(tools);
    if (!bashTool) {
      throw new Error("bash tool not registered");
    }

    const uiCtx = createUiCtx();
    await bashTool.execute("id", { command: "git status" }, undefined, () => {}, uiCtx);

    const spawnHook = vi.mocked(mockFns.createBashTool).mock.lastCall?.[1]?.spawnHook;
    const result = spawnHook?.({ command: "git status", cwd: "/project", env: {} });
    expect(result).toEqual({ command: "rtk git status", cwd: "/project", env: {} });
    expect(mockFns.recordDebugEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "rtk",
        level: "debug",
        category: "rewrite",
        data: expect.objectContaining({
          command: "git status",
          rewrittenCommand: "rtk git status",
        }),
      }),
    );
    expect(uiCtx.ui.notify).not.toHaveBeenCalled();
  });

  it("spawnHook falls back and records a fallback when rewrite fails", async () => {
    mockFns.execFileSync.mockImplementation((...args: unknown[]) => {
      const [cmd, argv] = args as [string, string[]];
      if (cmd === "rtk" && Array.isArray(argv) && argv[0] === "--version") {
        return VERSION_OUTPUT;
      }
      if (cmd === "rtk" && Array.isArray(argv) && argv[0] === "rewrite") {
        throw new Error("exit 1");
      }
      throw new Error(`Unexpected call: ${cmd} ${JSON.stringify(argv)}`);
    });

    const { pi, tools } = createPiMock();
    rtkExtension(pi as never);

    const bashTool = getRegisteredBashTool(tools);
    if (!bashTool) {
      throw new Error("bash tool not registered");
    }

    await bashTool.execute("id", { command: "echo hello" }, undefined, () => {}, createUiCtx());

    const spawnHook = vi.mocked(mockFns.createBashTool).mock.lastCall?.[1]?.spawnHook;
    const result = spawnHook?.({ command: "echo hello", cwd: "/project", env: {} });
    expect(result).toEqual({ command: "echo hello", cwd: "/project", env: {} });
    expect(mockFns.recordDebugEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "rtk",
        level: "warning",
        category: "fallback",
        data: expect.objectContaining({ command: "echo hello", reason: "error" }),
      }),
    );

    const providerCall = vi.mocked(registerContextProvider).mock.calls[0][0];
    expect(providerCall.getData()).toEqual({
      rewrites: 0,
      fallbacks: 1,
      estimatedTokensSaved: 0,
    });
  });

  it("spawnHook warns once per session when the rtk binary is unavailable", async () => {
    mockFns.execFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const { pi, tools } = createPiMock();
    rtkExtension(pi as never);

    const bashTool = getRegisteredBashTool(tools);
    if (!bashTool) {
      throw new Error("bash tool not registered");
    }

    const uiCtx = createUiCtx();
    await bashTool.execute("id", { command: "git status" }, undefined, () => {}, uiCtx);

    const spawnHook = vi.mocked(mockFns.createBashTool).mock.lastCall?.[1]?.spawnHook;
    expect(spawnHook?.({ command: "git status", cwd: "/project", env: {} })).toEqual({
      command: "git status",
      cwd: "/project",
      env: {},
    });
    expect(spawnHook?.({ command: "git diff", cwd: "/project", env: {} })).toEqual({
      command: "git diff",
      cwd: "/project",
      env: {},
    });

    expect(uiCtx.ui.notify).toHaveBeenCalledTimes(1);
    expect(mockFns.recordDebugEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "rtk",
        level: "warning",
        category: "fallback",
        data: expect.objectContaining({ command: "git status", reason: "unavailable" }),
      }),
    );
    expect(uiCtx.ui.notify).toHaveBeenCalledWith(
      "RTK is enabled but the rtk binary is not available on PATH. Falling back to normal bash execution.",
      "warning",
    );

    const providerCall = vi.mocked(registerContextProvider).mock.calls[0][0];
    expect(providerCall.getData()).toBeNull();
  });

  it("spawnHook passes through when disabled", async () => {
    mockFns.loadSupiConfig.mockReturnValue({ enabled: false, rewriteTimeout: 5000 });

    const { pi, tools } = createPiMock();
    rtkExtension(pi as never);

    const bashTool = getRegisteredBashTool(tools);
    if (!bashTool) {
      throw new Error("bash tool not registered");
    }

    await bashTool.execute("id", { command: "git status" }, undefined, () => {}, createUiCtx());

    const spawnHook = vi.mocked(mockFns.createBashTool).mock.lastCall?.[1]?.spawnHook;
    const result = spawnHook?.({ command: "git status", cwd: "/project", env: {} });
    expect(result).toEqual({ command: "git status", cwd: "/project", env: {} });
    expect(mockFns.execFileSync).not.toHaveBeenCalled();
    expect(mockFns.recordDebugEvent).not.toHaveBeenCalled();
  });

  it("keeps normal behavior when debug registry declines to retain an event", async () => {
    mockFns.recordDebugEvent.mockReturnValue(null);

    const { pi, tools } = createPiMock();
    rtkExtension(pi as never);

    const bashTool = getRegisteredBashTool(tools);
    if (!bashTool) {
      throw new Error("bash tool not registered");
    }

    await bashTool.execute("id", { command: "git status" }, undefined, () => {}, createUiCtx());

    const spawnHook = vi.mocked(mockFns.createBashTool).mock.lastCall?.[1]?.spawnHook;
    const result = spawnHook?.({ command: "git status", cwd: "/project", env: {} });
    expect(result).toEqual({ command: "rtk git status", cwd: "/project", env: {} });
  });

  it("user_bash rewrites commands and uses the shellPath for the event cwd", () => {
    mockFns.getShellPath.mockReturnValue("/bin/fish");

    const { pi, handlers } = createPiMock();
    rtkExtension(pi as never);

    const result = handlers.get("user_bash")?.(
      {
        command: "!git status",
        excludeFromContext: false,
        cwd: "/project",
      },
      createUiCtx(),
    ) as { operations?: unknown } | undefined;

    expect(result).toBeDefined();
    expect(result?.operations).toBeDefined();
    expect(mockFns.createLocalBashOperations).toHaveBeenCalledWith({ shellPath: "/bin/fish" });
  });

  it("user_bash warns and skips interception when rtk is unavailable", () => {
    mockFns.execFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const { pi, handlers } = createPiMock();
    rtkExtension(pi as never);

    const uiCtx = createUiCtx();
    const result = handlers.get("user_bash")?.(
      {
        command: "!echo hello",
        excludeFromContext: false,
        cwd: "/project",
      },
      uiCtx,
    );

    expect(result).toBeUndefined();
    expect(uiCtx.ui.notify).toHaveBeenCalledTimes(1);

    const providerCall = vi.mocked(registerContextProvider).mock.calls[0][0];
    expect(providerCall.getData()).toBeNull();
  });

  it("session_start resets the cached availability probe and warning state", async () => {
    mockFns.execFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const { pi, handlers, tools } = createPiMock();
    rtkExtension(pi as never);

    const bashTool = getRegisteredBashTool(tools);
    if (!bashTool) {
      throw new Error("bash tool not registered");
    }

    const firstCtx = createUiCtx();
    await bashTool.execute("id", { command: "git status" }, undefined, () => {}, firstCtx);
    const firstSpawnHook = vi.mocked(mockFns.createBashTool).mock.lastCall?.[1]?.spawnHook;
    firstSpawnHook?.({ command: "git status", cwd: "/project", env: {} });

    expect(firstCtx.ui.notify).toHaveBeenCalledTimes(1);
    expect(mockFns.execFileSync).toHaveBeenCalledTimes(1);

    handlers.get("session_start")?.({});

    const secondCtx = createUiCtx();
    await bashTool.execute("id", { command: "git diff" }, undefined, () => {}, secondCtx);
    const secondSpawnHook = vi.mocked(mockFns.createBashTool).mock.lastCall?.[1]?.spawnHook;
    secondSpawnHook?.({ command: "git diff", cwd: "/project", env: {} });

    expect(secondCtx.ui.notify).toHaveBeenCalledTimes(1);
    expect(mockFns.execFileSync).toHaveBeenCalledTimes(2);
  });
});
