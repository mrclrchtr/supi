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
  pruneAndReorderContextMessages: vi.fn(),
  reconstructState: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-core", () => ({
  getContextToken: (details: unknown) =>
    details && typeof details === "object"
      ? ((details as { contextToken?: string }).contextToken ?? null)
      : null,
  loadSupiConfig: vi.fn(),
  pruneAndReorderContextMessages: mockFns.pruneAndReorderContextMessages,
  registerSettings: vi.fn(),
  removeSupiConfigKey: vi.fn(),
  restorePromptContent: vi.fn((msgs: unknown) => msgs),
  writeSupiConfig: vi.fn(),
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
}));

vi.mock("../state.ts", () => ({
  createInitialState: () => ({
    completedTurns: 0,
    lastRefreshTurn: 0,
    injectedDirs: new Map(),
    currentContextToken: null,
    contextCounter: 0,
    nativeContextPaths: new Set(),
    firstAgentStart: true,
  }),
  reconstructState: mockFns.reconstructState,
}));

import claudeMdExtension from "../index.ts";

function resetMocks() {
  vi.clearAllMocks();
  mockFns.loadClaudeMdConfig.mockReturnValue({ ...DEFAULT_CONFIG });
  mockFns.shouldRefreshRoot.mockReturnValue(false);
  mockFns.pruneAndReorderContextMessages.mockImplementation((msgs) => msgs);
}

describe("claudeMdExtension: registration", () => {
  beforeEach(resetMocks);

  it("registers all event handlers", () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    for (const event of [
      "session_start",
      "turn_end",
      "session_compact",
      "before_agent_start",
      "context",
      "tool_result",
    ]) {
      expect(handlers.has(event), `missing handler for ${event}`).toBe(true);
    }
  });
});

describe("claudeMdExtension: session_start", () => {
  beforeEach(resetMocks);

  it("reconstructs state from session history", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    mockFns.reconstructState.mockReturnValue({
      completedTurns: 12,
      lastRefreshTurn: 9,
      injectedDirs: new Map([["packages/foo", { turn: 5, file: "packages/foo/CLAUDE.md" }]]),
    });

    await handlers.get("session_start")?.(
      {},
      { cwd: "/project", sessionManager: { getBranch: () => [{ type: "assistant" }] } },
    );

    expect(mockFns.reconstructState).toHaveBeenCalled();
  });

  it("starts fresh when reconstruction fails", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    await expect(
      handlers.get("session_start")?.(
        {},
        {
          cwd: "/project",
          sessionManager: {
            getBranch: () => {
              throw new Error("boom");
            },
          },
        },
      ),
    ).resolves.toBeUndefined();
  });
});

describe("claudeMdExtension: turn_end", () => {
  beforeEach(resetMocks);

  it("increments completedTurns on stopReason stop", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    const turnEnd = handlers.get("turn_end") as (...args: unknown[]) => unknown;
    await turnEnd({ message: { stopReason: "stop" } }, makeCtx());
    await turnEnd({ message: { stopReason: "stop" } }, makeCtx());
    await turnEnd({ message: { stopReason: "tool_use" } }, makeCtx());

    mockFns.shouldRefreshRoot.mockReturnValue(true);
    mockFns.readNativeContextFiles.mockReturnValue([{ path: "CLAUDE.md", content: "c" }]);
    mockFns.formatRefreshContext.mockReturnValue("ctx");

    const result = (await handlers.get("before_agent_start")?.(
      { systemPromptOptions: { contextFiles: [{ path: "CLAUDE.md", content: "c" }] } },
      makeCtx(),
    )) as { message: { details: { turn: number } } } | undefined;

    expect(result?.message?.details?.turn).toBe(2);
  });
});

describe("claudeMdExtension: session_compact", () => {
  beforeEach(resetMocks);

  it("clears injectedDirs on compact", async () => {
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
    mockFns.filterAlreadyLoaded.mockImplementation((files: unknown[]) => files);
    mockFns.shouldInjectSubdir.mockReturnValue(true);
    mockFns.formatSubdirContext.mockReturnValue("<extension-context>content</extension-context>");

    await handlers.get("tool_result")?.(
      {
        isError: false,
        toolName: "read",
        input: { path: "packages/foo/bar.ts" },
        content: [{ type: "text", text: "file content" }],
      },
      makeCtx(),
    );

    // Compact should clear injectedDirs but not trigger refresh (it's redundant)
    await handlers.get("session_compact")?.({}, makeCtx());

    // After compaction, shouldRefreshRoot is still false (interval not met)
    mockFns.shouldRefreshRoot.mockReturnValue(false);
    const result = await handlers.get("before_agent_start")?.(
      { systemPromptOptions: { contextFiles: [{ path: "CLAUDE.md", content: "root" }] } },
      makeCtx(),
    );

    expect(result).toBeUndefined();
  });
});
