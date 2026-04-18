import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPiMock, DEFAULT_CONFIG, makeCtx } from "./extension-helpers.ts";

const mockFns = vi.hoisted(() => ({
  loadClaudeMdConfig: vi.fn(),
  extractPathFromToolEvent: vi.fn(),
  filterAlreadyLoaded: vi.fn(),
  findSubdirContextFiles: vi.fn(),
  formatSubdirContext: vi.fn(),
  shouldInjectSubdir: vi.fn(),
  shouldRefreshRoot: vi.fn(),
  formatRefreshContext: vi.fn(),
  readNativeContextFiles: vi.fn(),
  pruneStaleRefreshMessages: vi.fn(),
}));

vi.mock("../config.ts", () => ({
  loadClaudeMdConfig: mockFns.loadClaudeMdConfig,
}));

vi.mock("../discovery.ts", () => ({
  extractPathFromToolEvent: mockFns.extractPathFromToolEvent,
  filterAlreadyLoaded: mockFns.filterAlreadyLoaded,
  findSubdirContextFiles: mockFns.findSubdirContextFiles,
}));

vi.mock("../subdirectory.ts", () => ({
  formatSubdirContext: mockFns.formatSubdirContext,
  shouldInjectSubdir: mockFns.shouldInjectSubdir,
}));

vi.mock("../refresh.ts", () => ({
  shouldRefreshRoot: mockFns.shouldRefreshRoot,
  formatRefreshContext: mockFns.formatRefreshContext,
  readNativeContextFiles: mockFns.readNativeContextFiles,
  pruneStaleRefreshMessages: mockFns.pruneStaleRefreshMessages,
}));

vi.mock("../state.ts", () => ({
  createInitialState: () => ({
    completedTurns: 0,
    lastRefreshTurn: 0,
    injectedDirs: new Map(),
    needsRefresh: false,
    currentContextToken: null,
    contextCounter: 0,
    nativeContextPaths: new Set(),
    firstAgentStart: true,
  }),
  reconstructState: vi.fn(),
}));

import claudeMdExtension from "../index.ts";

function resetMocks() {
  vi.clearAllMocks();
  mockFns.loadClaudeMdConfig.mockReturnValue({ ...DEFAULT_CONFIG });
  mockFns.extractPathFromToolEvent.mockReturnValue(null);
  mockFns.findSubdirContextFiles.mockReturnValue([]);
  mockFns.filterAlreadyLoaded.mockImplementation((files: unknown) => files);
  mockFns.shouldRefreshRoot.mockReturnValue(false);
  mockFns.pruneStaleRefreshMessages.mockImplementation((msgs: unknown) => msgs);
}

describe("claudeMdExtension: tool_result (injection)", () => {
  beforeEach(resetMocks);

  it("injects context into tool result for supported tools", async () => {
    const { handlers, pi } = createPiMock();
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

    const result = await handlers.get("tool_result")?.(
      {
        isError: false,
        toolName: "read",
        input: { path: "packages/foo/src/bar.ts" },
        content: [{ type: "text", text: "file content" }],
      },
      makeCtx(),
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
    const { handlers, pi } = createPiMock();
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

    const result = await handlers.get("tool_result")?.(
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
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    mockFns.loadClaudeMdConfig.mockReturnValue({ ...DEFAULT_CONFIG, subdirs: false });

    const result = await handlers.get("tool_result")?.(
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
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    const result = await handlers.get("tool_result")?.(
      { isError: true, toolName: "read", input: { path: "x" }, content: [] },
      makeCtx(),
    );

    expect(result).toBeUndefined();
    expect(mockFns.extractPathFromToolEvent).not.toHaveBeenCalled();
  });

  it("skips when path extraction returns null", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    mockFns.extractPathFromToolEvent.mockReturnValue(null);

    const result = await handlers.get("tool_result")?.(
      { isError: false, toolName: "bash", input: { command: "ls" }, content: [] },
      makeCtx(),
    );

    expect(result).toBeUndefined();
    expect(mockFns.findSubdirContextFiles).not.toHaveBeenCalled();
  });

  it("skips when no context files found", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    mockFns.extractPathFromToolEvent.mockReturnValue("packages/foo/bar.ts");

    const result = await handlers.get("tool_result")?.(
      { isError: false, toolName: "read", input: { path: "packages/foo/bar.ts" }, content: [] },
      makeCtx(),
    );

    expect(result).toBeUndefined();
  });

  it("skips when all dirs are already fresh", async () => {
    const { handlers, pi } = createPiMock();
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

    const result = await handlers.get("tool_result")?.(
      { isError: false, toolName: "read", input: { path: "packages/foo/bar.ts" }, content: [] },
      makeCtx(),
    );

    expect(result).toBeUndefined();
  });
});

describe("claudeMdExtension: native path deduplication", () => {
  beforeEach(resetMocks);

  it("captures native paths on first before_agent_start only", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    mockFns.shouldRefreshRoot.mockReturnValue(true);
    mockFns.readNativeContextFiles.mockReturnValue([
      { path: "/project/CLAUDE.md", content: "root" },
    ]);
    mockFns.formatRefreshContext.mockReturnValue("context");

    const bas = handlers.get("before_agent_start") as (...args: unknown[]) => unknown;
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

    mockFns.shouldRefreshRoot.mockReturnValue(false);
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

    await handlers.get("tool_result")?.(
      { isError: false, toolName: "read", input: { path: "src/foo.ts" }, content: [] },
      makeCtx(),
    );

    expect(mockFns.formatSubdirContext).not.toHaveBeenCalled();
  });

  it("calls filterAlreadyLoaded with native paths set", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    mockFns.shouldRefreshRoot.mockReturnValue(true);
    mockFns.readNativeContextFiles.mockReturnValue([
      { path: "/project/CLAUDE.md", content: "root" },
    ]);
    mockFns.formatRefreshContext.mockReturnValue("context");

    await handlers.get("before_agent_start")?.(
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

    await handlers.get("tool_result")?.(
      { isError: false, toolName: "read", input: { path: "src/bar.ts" }, content: [] },
      makeCtx(),
    );

    expect(mockFns.filterAlreadyLoaded).toHaveBeenCalledWith(expect.any(Array), expect.any(Set));
  });
});
