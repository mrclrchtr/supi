import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  createBashTool: vi.fn(),
  createLocalBashOperations: vi.fn(),
  loadSupiConfig: vi.fn(),
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
  registerConfigSettings: mockFns.registerConfigSettings,
  registerContextProvider: mockFns.registerContextProvider,
}));

import { createBashTool } from "@mariozechner/pi-coding-agent";
import { registerConfigSettings, registerContextProvider } from "@mrclrchtr/supi-core";
import rtkExtension from "../index.ts";
import { resetTracking } from "../tracking.ts";

interface PiMock {
  handlers: Map<string, (...args: unknown[]) => unknown>;
  tools: unknown[];
  commands: Map<string, unknown>;
  pi: {
    on: (event: string, handler: (...args: unknown[]) => unknown) => void;
    registerTool: (tool: unknown) => void;
    registerCommand: (name: string, spec: unknown) => void;
  };
}

function createPiMock(): PiMock {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const tools: unknown[] = [];
  const commands = new Map<string, unknown>();
  return {
    handlers,
    tools,
    commands,
    pi: {
      on(event: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(event, handler);
      },
      registerTool(tool: unknown) {
        tools.push(tool);
      },
      registerCommand(name: string, spec: unknown) {
        commands.set(name, spec);
      },
    },
  };
}

describe("rtkExtension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTracking();
    mockFns.execFileSync.mockReturnValue("rtk 1.0.0");
    mockFns.loadSupiConfig.mockReturnValue({ enabled: true, rewriteTimeout: 5000 });
    mockFns.getShellPath.mockReturnValue(undefined);
    mockFns.getShellCommandPrefix.mockReturnValue(undefined);
    mockFns.createBashTool.mockImplementation((_cwd, options) => {
      return { name: "bash", execute: vi.fn(), ...options };
    });
    mockFns.createLocalBashOperations.mockReturnValue({ exec: vi.fn() });
  });

  it("throws when rtk binary is missing", () => {
    mockFns.execFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const { pi } = createPiMock();
    expect(() => rtkExtension(pi as never)).toThrow("rtk binary not found");
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

  it("spawnHook rewrites command when enabled", () => {
    const { pi } = createPiMock();
    rtkExtension(pi as never);

    const spawnHook = vi.mocked(createBashTool).mock.calls[0][1]?.spawnHook;
    expect(spawnHook).toBeDefined();

    mockFns.execFileSync.mockReturnValue("rtk git status");
    const result = spawnHook?.({ command: "git status", cwd: "/project", env: {} });
    expect(result).toEqual({ command: "rtk git status", cwd: "/project", env: {} });
  });

  it("spawnHook falls back when rtk rewrite fails", () => {
    const { pi } = createPiMock();
    rtkExtension(pi as never);

    const spawnHook = vi.mocked(createBashTool).mock.calls[0][1]?.spawnHook;
    mockFns.execFileSync.mockImplementation(() => {
      throw new Error("exit 1");
    });

    const result = spawnHook?.({ command: "echo hello", cwd: "/project", env: {} });
    expect(result).toEqual({ command: "echo hello", cwd: "/project", env: {} });
  });

  it("forwards shellPath and commandPrefix to createBashTool", () => {
    mockFns.getShellPath.mockReturnValue("/bin/zsh");
    mockFns.getShellCommandPrefix.mockReturnValue("source ~/.zshrc");
    const { pi } = createPiMock();
    rtkExtension(pi as never);

    const options = vi.mocked(createBashTool).mock.calls[0][1];
    expect(options?.shellPath).toBe("/bin/zsh");
    expect(options?.commandPrefix).toBe("source ~/.zshrc");
  });

  it("spawnHook passes through when disabled", () => {
    mockFns.loadSupiConfig.mockReturnValue({ enabled: false, rewriteTimeout: 5000 });
    const { pi } = createPiMock();
    rtkExtension(pi as never);

    const spawnHook = vi.mocked(createBashTool).mock.calls[0][1]?.spawnHook;
    const result = spawnHook?.({ command: "git status", cwd: "/project", env: {} });
    expect(result).toEqual({ command: "git status", cwd: "/project", env: {} });
  });

  it("user_bash rewrites !cmd commands", () => {
    const { pi, handlers } = createPiMock();
    rtkExtension(pi as never);

    mockFns.execFileSync.mockReturnValue("rtk git status");

    const result = handlers.get("user_bash")?.({
      command: "!git status",
      excludeFromContext: false,
      cwd: "/project",
    }) as { operations?: unknown } | undefined;

    expect(result).toBeDefined();
    expect(result?.operations).toBeDefined();
  });

  it("user_bash ignores !!cmd commands", () => {
    const { pi, handlers } = createPiMock();
    rtkExtension(pi as never);

    const result = handlers.get("user_bash")?.({
      command: "!!git status",
      excludeFromContext: true,
      cwd: "/project",
    });

    expect(result).toBeUndefined();
  });

  it("user_bash falls through when rewrite fails and records fallback", () => {
    const { pi, handlers } = createPiMock();
    rtkExtension(pi as never);

    mockFns.execFileSync.mockImplementation(() => {
      throw new Error("exit 1");
    });

    const result = handlers.get("user_bash")?.({
      command: "!echo hello",
      excludeFromContext: false,
      cwd: "/project",
    });

    expect(result).toBeUndefined();

    const providerCall = vi.mocked(registerContextProvider).mock.calls[0][0];
    expect(providerCall.getData()).toEqual({
      rewrites: 0,
      fallbacks: 1,
      estimatedTokensSaved: 0,
    });
  });

  it("user_bash forwards shellPath to createLocalBashOperations", () => {
    mockFns.getShellPath.mockReturnValue("/bin/fish");
    const { pi, handlers } = createPiMock();
    rtkExtension(pi as never);

    mockFns.execFileSync.mockReturnValue("rtk git status");

    handlers.get("user_bash")?.({
      command: "!git status",
      excludeFromContext: false,
      cwd: "/project",
    });

    expect(mockFns.createLocalBashOperations).toHaveBeenCalledWith({ shellPath: "/bin/fish" });
  });

  it("resets tracking on session_start", () => {
    const { pi, handlers } = createPiMock();
    rtkExtension(pi as never);

    // Populate stats via spawnHook
    const spawnHook = vi.mocked(createBashTool).mock.calls[0][1]?.spawnHook;
    mockFns.execFileSync.mockReturnValue("rtk git status");
    spawnHook?.({ command: "git status", cwd: "/project", env: {} });

    const providerCall = vi.mocked(registerContextProvider).mock.calls[0][0];
    expect(providerCall.getData()).toEqual({
      rewrites: 1,
      fallbacks: 0,
      estimatedTokensSaved: 200,
    });

    // Reset via session_start
    handlers.get("session_start")?.({});
    expect(providerCall.getData()).toBeNull();
  });
});
