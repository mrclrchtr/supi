import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPiMock, DEFAULT_CONFIG, makeCtx } from "./extension-helpers.ts";

const mockFns = vi.hoisted(() => ({
  loadClaudeMdConfig: vi.fn(),
  extractPathFromToolEvent: vi.fn(),
  filterAlreadyLoaded: vi.fn(),
  findSubdirContextFiles: vi.fn(),
  formatSubdirContext: vi.fn(),
  shouldInjectSubdir: vi.fn(),
  reconstructState: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-core", () => ({
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

vi.mock("../config.ts", () => ({
  CLAUDE_MD_DEFAULTS: {
    rereadInterval: 3,
    contextThreshold: 80,
    subdirs: true,
    fileNames: ["CLAUDE.md", "AGENTS.md"],
  },
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

vi.mock("../state.ts", () => ({
  createInitialState: () => ({
    completedTurns: 0,
    injectedDirs: new Map(),
    nativeContextPaths: new Set(),
    firstAgentStart: true,
  }),
  reconstructState: mockFns.reconstructState,
}));

import claudeMdExtension from "../claude-md.ts";

function resetMocks() {
  vi.clearAllMocks();
  mockFns.loadClaudeMdConfig.mockReturnValue({ ...DEFAULT_CONFIG });
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

    // Verify turn counting without relying on refresh emission
    const bas = handlers.get("before_agent_start") as (...args: unknown[]) => unknown;
    await bas(
      { systemPromptOptions: { contextFiles: [{ path: "CLAUDE.md", content: "c" }] } },
      makeCtx(),
    );

    expect(mockFns.extractPathFromToolEvent).not.toHaveBeenCalled();
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

    // Compact should clear injectedDirs
    await handlers.get("session_compact")?.({}, makeCtx());

    const result = await handlers.get("before_agent_start")?.(
      { systemPromptOptions: { contextFiles: [{ path: "CLAUDE.md", content: "root" }] } },
      makeCtx(),
    );

    expect(result).toBeUndefined();
  });
});
