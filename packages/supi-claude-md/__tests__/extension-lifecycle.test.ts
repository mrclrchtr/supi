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
  reconstructState: vi.fn(),
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
    needsRefresh: true,
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
  mockFns.pruneStaleRefreshMessages.mockImplementation((msgs) => msgs);
}

describe("claudeMdExtension: registration", () => {
  beforeEach(resetMocks);

  it("registers /supi-claude-md command", () => {
    const { commands, pi } = createPiMock();
    claudeMdExtension(pi as never);
    expect(commands.has("supi-claude-md")).toBe(true);
  });

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

  it("sets needsRefresh and clears injectedDirs", async () => {
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

    await handlers.get("session_compact")?.({}, makeCtx());

    mockFns.shouldRefreshRoot.mockReturnValue(true);
    mockFns.readNativeContextFiles.mockReturnValue([{ path: "CLAUDE.md", content: "root" }]);
    mockFns.formatRefreshContext.mockReturnValue("<extension-context>root</extension-context>");

    const result = await handlers.get("before_agent_start")?.(
      { systemPromptOptions: { contextFiles: [{ path: "CLAUDE.md", content: "root" }] } },
      makeCtx(),
    );

    expect(result).toMatchObject({ message: { customType: "supi-claude-md-refresh" } });
  });

  it("does not set needsRefresh when compactRefresh is disabled", async () => {
    mockFns.loadClaudeMdConfig.mockReturnValue({ ...DEFAULT_CONFIG, compactRefresh: false });

    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    mockFns.shouldRefreshRoot.mockReturnValue(true);
    mockFns.readNativeContextFiles.mockReturnValue([{ path: "CLAUDE.md", content: "root" }]);
    mockFns.formatRefreshContext.mockReturnValue("<extension-context>root</extension-context>");

    const ctx = makeCtx();
    const event = {
      systemPromptOptions: { contextFiles: [{ path: "CLAUDE.md", content: "root context" }] },
    };

    await handlers.get("before_agent_start")?.(event, ctx);

    mockFns.shouldRefreshRoot.mockReturnValue(false);
    await handlers.get("session_compact")?.({}, ctx);

    expect(await handlers.get("before_agent_start")?.(event, ctx)).toBeUndefined();
  });
});
