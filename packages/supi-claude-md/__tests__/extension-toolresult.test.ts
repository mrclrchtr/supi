import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "./extension-helpers.ts";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";

const mockFns = vi.hoisted(() => ({
  loadClaudeMdConfig: vi.fn(),
  extractPathFromToolEvent: vi.fn(),
  filterAlreadyLoaded: vi.fn(),
  findSubdirContextFiles: vi.fn(),
  formatSubdirContext: vi.fn(),
  shouldInjectSubdir: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-core", () => ({
  createInputSubmenu: vi.fn(),
  getContextToken: (details: unknown) =>
    details && typeof details === "object"
      ? ((details as { contextToken?: string }).contextToken ?? null)
      : null,
  loadSupiConfig: vi.fn(),
  registerConfigSettings: vi.fn(),
  registerSettings: vi.fn(),
  removeSupiConfigKey: vi.fn(),
  writeSupiConfig: vi.fn(),
}));

vi.mock("../src/config.ts", () => ({
  CLAUDE_MD_DEFAULTS: {
    rereadInterval: 3,
    contextThreshold: 80,
    subdirs: true,
    fileNames: ["CLAUDE.md", "AGENTS.md"],
  },
  loadClaudeMdConfig: mockFns.loadClaudeMdConfig,
}));

vi.mock("../src/discovery.ts", () => ({
  extractPathFromToolEvent: mockFns.extractPathFromToolEvent,
  filterAlreadyLoaded: mockFns.filterAlreadyLoaded,
  findSubdirContextFiles: mockFns.findSubdirContextFiles,
}));

vi.mock("../src/subdirectory.ts", () => ({
  formatSubdirContext: mockFns.formatSubdirContext,
  shouldInjectSubdir: mockFns.shouldInjectSubdir,
}));

vi.mock("../src/state.ts", () => ({
  createInitialState: () => ({
    completedTurns: 0,
    injectedDirs: new Map(),
    nativeContextPaths: new Set(),
    firstAgentStart: true,
  }),
  reconstructState: vi.fn(),
}));

import claudeMdExtension from "../src/claude-md.ts";

function resetMocks() {
  vi.clearAllMocks();
  mockFns.loadClaudeMdConfig.mockReturnValue({ ...DEFAULT_CONFIG });
  mockFns.extractPathFromToolEvent.mockReturnValue(null);
  mockFns.findSubdirContextFiles.mockReturnValue([]);
  mockFns.filterAlreadyLoaded.mockImplementation((files: unknown) => files);
}

describe("claudeMdExtension: tool_result (injection)", () => {
  beforeEach(resetMocks);

  it("injects context into tool result for supported tools", async () => {
    const pi = createPiMock();
    claudeMdExtension(pi as never);

    mockFns.extractPathFromToolEvent.mockReturnValue("packages/foo/src/bar.ts");
    mockFns.findSubdirContextFiles.mockReturnValue([
      {
        absolutePath: "/project/packages/foo/CLAUDE.md",
        relativePath: "packages/foo/CLAUDE.md",
        dir: "/project/packages/foo",
      },
    ]);
    mockFns.shouldInjectSubdir.mockReturnValue(true);
    mockFns.formatSubdirContext.mockReturnValue(
      '<extension-context source="supi-claude-md" file="packages/foo/CLAUDE.md" turn="0">\n# Foo\n</extension-context>',
    );

    const usage = { tokens: 50_000, contextWindow: 128_000, percent: 50 };

    const result = await pi.handlers.get("tool_result")?.[0]?.(
      {
        isError: false,
        toolName: "read",
        input: { path: "packages/foo/src/bar.ts" },
        content: [{ type: "text", text: "file content" }],
      },
      makeCtx({ cwd: "/project", getContextUsage: () => usage }),
    );

    expect(mockFns.shouldInjectSubdir).toHaveBeenCalledWith(
      "/project/packages/foo",
      expect.objectContaining({
        contextThreshold: 80,
        contextUsage: usage,
        currentTurn: 0,
        injectedDirs: expect.any(Map),
        rereadInterval: 3,
      }),
    );
    expect(result).toEqual({
      content: [
        { type: "text", text: "file content" },
        {
          type: "text",
          text: '<extension-context source="supi-claude-md" file="packages/foo/CLAUDE.md" turn="0">\n# Foo\n</extension-context>',
        },
      ],
    });
  });

  it("skips injection when formatSubdirContext returns empty", async () => {
    const pi = createPiMock();
    claudeMdExtension(pi as never);

    mockFns.extractPathFromToolEvent.mockReturnValue("packages/foo/bar.ts");
    mockFns.findSubdirContextFiles.mockReturnValue([
      {
        absolutePath: "/project/packages/foo/CLAUDE.md",
        relativePath: "packages/foo/CLAUDE.md",
        dir: "/project/packages/foo",
      },
    ]);
    mockFns.shouldInjectSubdir.mockReturnValue(true);
    mockFns.formatSubdirContext.mockReturnValue("");

    const result = await pi.handlers.get("tool_result")?.[0]?.(
      {
        isError: false,
        toolName: "read",
        input: { path: "packages/foo/bar.ts" },
        content: [{ type: "text", text: "content" }],
      },
      makeCtx(),
    );

    expect(result).toBeUndefined();
  });
});

describe("claudeMdExtension: tool_result (skip conditions)", () => {
  beforeEach(resetMocks);

  it("skips injection when subdirs is disabled", async () => {
    const pi = createPiMock();
    claudeMdExtension(pi as never);

    mockFns.loadClaudeMdConfig.mockReturnValue({ ...DEFAULT_CONFIG, subdirs: false });

    const result = await pi.handlers.get("tool_result")?.[0]?.(
      {
        isError: false,
        toolName: "read",
        input: { path: "packages/foo/bar.ts" },
        content: [{ type: "text", text: "content" }],
      },
      makeCtx(),
    );

    expect(result).toBeUndefined();
    expect(mockFns.extractPathFromToolEvent).not.toHaveBeenCalled();
  });

  it("ignores errored tool results", async () => {
    const pi = createPiMock();
    claudeMdExtension(pi as never);

    const result = await pi.handlers.get("tool_result")?.[0]?.(
      { isError: true, toolName: "read", input: { path: "x" }, content: [] },
      makeCtx(),
    );

    expect(result).toBeUndefined();
    expect(mockFns.extractPathFromToolEvent).not.toHaveBeenCalled();
  });

  it("skips when path extraction returns null", async () => {
    const pi = createPiMock();
    claudeMdExtension(pi as never);

    mockFns.extractPathFromToolEvent.mockReturnValue(null);

    const result = await pi.handlers.get("tool_result")?.[0]?.(
      { isError: false, toolName: "bash", input: { command: "ls" }, content: [] },
      makeCtx(),
    );

    expect(result).toBeUndefined();
    expect(mockFns.findSubdirContextFiles).not.toHaveBeenCalled();
  });

  it("skips when no context files found", async () => {
    const pi = createPiMock();
    claudeMdExtension(pi as never);

    mockFns.extractPathFromToolEvent.mockReturnValue("packages/foo/bar.ts");

    const result = await pi.handlers.get("tool_result")?.[0]?.(
      { isError: false, toolName: "read", input: { path: "packages/foo/bar.ts" }, content: [] },
      makeCtx(),
    );

    expect(result).toBeUndefined();
  });

  it("skips when all dirs are already fresh", async () => {
    const pi = createPiMock();
    claudeMdExtension(pi as never);

    mockFns.extractPathFromToolEvent.mockReturnValue("packages/foo/bar.ts");
    mockFns.findSubdirContextFiles.mockReturnValue([
      {
        absolutePath: "/project/packages/foo/CLAUDE.md",
        relativePath: "packages/foo/CLAUDE.md",
        dir: "/project/packages/foo",
      },
    ]);
    mockFns.shouldInjectSubdir.mockReturnValue(false);

    const result = await pi.handlers.get("tool_result")?.[0]?.(
      { isError: false, toolName: "read", input: { path: "packages/foo/bar.ts" }, content: [] },
      makeCtx(),
    );

    expect(result).toBeUndefined();
  });
});

describe("claudeMdExtension: native path deduplication", () => {
  beforeEach(resetMocks);

  it("captures native paths on first before_agent_start only", async () => {
    const pi = createPiMock();
    claudeMdExtension(pi as never);

    const bas = pi.handlers.get("before_agent_start")?.[0] as (...args: unknown[]) => unknown;
    await bas(
      {
        systemPromptOptions: {
          contextFiles: [
            { path: "/project/CLAUDE.md", content: "root" },
            { path: "/project/AGENTS.md", content: "agents" },
          ],
        },
      },
      makeCtx(),
    );

    // Second before_agent_start should not re-capture
    await bas(
      { systemPromptOptions: { contextFiles: [{ path: "/project/NEW.md", content: "new" }] } },
      makeCtx(),
    );

    mockFns.extractPathFromToolEvent.mockReturnValue("src/foo.ts");
    mockFns.findSubdirContextFiles.mockReturnValue([
      { absolutePath: "/project/CLAUDE.md", relativePath: "CLAUDE.md", dir: "/project" },
    ]);
    mockFns.filterAlreadyLoaded.mockImplementation(
      (files: Array<{ absolutePath: string }>, nativePaths: Set<string>) =>
        files.filter((f) => !nativePaths.has(f.absolutePath)),
    );

    await pi.handlers.get("tool_result")?.[0]?.(
      { isError: false, toolName: "read", input: { path: "src/foo.ts" }, content: [] },
      makeCtx(),
    );

    expect(mockFns.formatSubdirContext).not.toHaveBeenCalled();
  });

  it("calls filterAlreadyLoaded with native paths set", async () => {
    const pi = createPiMock();
    claudeMdExtension(pi as never);

    await pi.handlers.get("before_agent_start")?.[0]?.(
      { systemPromptOptions: { contextFiles: [{ path: "/project/CLAUDE.md", content: "root" }] } },
      makeCtx(),
    );

    mockFns.extractPathFromToolEvent.mockReturnValue("src/bar.ts");
    mockFns.findSubdirContextFiles.mockReturnValue([
      {
        absolutePath: "/project/packages/foo/CLAUDE.md",
        relativePath: "packages/foo/CLAUDE.md",
        dir: "/project/packages/foo",
      },
    ]);
    mockFns.shouldInjectSubdir.mockReturnValue(true);
    mockFns.formatSubdirContext.mockReturnValue("context");

    await pi.handlers.get("tool_result")?.[0]?.(
      { isError: false, toolName: "read", input: { path: "src/bar.ts" }, content: [] },
      makeCtx(),
    );

    expect(mockFns.filterAlreadyLoaded).toHaveBeenCalledWith(expect.any(Array), expect.any(Set));
  });
});
