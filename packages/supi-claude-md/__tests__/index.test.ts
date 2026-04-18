import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  loadClaudeMdConfig: vi.fn(),
  extractPathFromToolEvent: vi.fn(),
  filterAlreadyLoaded: vi.fn(),
  findSubdirContextFiles: vi.fn(),
}));

vi.mock("../config.ts", () => ({
  loadClaudeMdConfig: mockFns.loadClaudeMdConfig,
}));

vi.mock("../discovery.ts", () => ({
  extractPathFromToolEvent: mockFns.extractPathFromToolEvent,
  filterAlreadyLoaded: mockFns.filterAlreadyLoaded,
  findSubdirContextFiles: mockFns.findSubdirContextFiles,
}));

import claudeMdExtension from "../index.ts";

function createPiMock() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const commands = new Map<string, unknown>();

  return {
    handlers,
    commands,
    pi: {
      on(event: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(event, handler);
      },
      registerCommand(name: string, spec: unknown) {
        commands.set(name, spec);
      },
    },
  };
}

describe("claudeMdExtension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFns.loadClaudeMdConfig.mockReturnValue({
      rereadInterval: 3,
      subdirs: true,
      compactRefresh: true,
      fileNames: ["CLAUDE.md", "AGENTS.md"],
    });
    mockFns.extractPathFromToolEvent.mockReturnValue("packages/foo/src/bar.ts");
    mockFns.findSubdirContextFiles.mockReturnValue([]);
    mockFns.filterAlreadyLoaded.mockImplementation((files) => files);
  });

  it("does not force a refresh after compaction when compactRefresh is disabled", async () => {
    mockFns.loadClaudeMdConfig.mockReturnValue({
      rereadInterval: 0,
      subdirs: true,
      compactRefresh: false,
      fileNames: ["CLAUDE.md", "AGENTS.md"],
    });

    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    const beforeAgentStart = handlers.get("before_agent_start");
    const sessionCompact = handlers.get("session_compact");
    const ctx = { cwd: "/project" };
    const event = {
      systemPromptOptions: {
        contextFiles: [{ path: "CLAUDE.md", content: "root context" }],
      },
    };

    const firstRefresh = await beforeAgentStart?.(event, ctx);
    expect(firstRefresh).toMatchObject({
      message: { customType: "supi-claude-md-refresh" },
    });

    await sessionCompact?.({}, ctx);

    const secondRefresh = await beforeAgentStart?.(event, ctx);
    expect(secondRefresh).toBeUndefined();
  });

  it("ignores errored tool results before attempting discovery", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    const toolResult = handlers.get("tool_result");
    const result = await toolResult?.(
      {
        isError: true,
        toolName: "read",
        input: { path: "packages/foo/missing.ts" },
        content: [],
      },
      { cwd: "/project" },
    );

    expect(result).toBeUndefined();
    expect(mockFns.extractPathFromToolEvent).not.toHaveBeenCalled();
    expect(mockFns.findSubdirContextFiles).not.toHaveBeenCalled();
    expect(mockFns.filterAlreadyLoaded).not.toHaveBeenCalled();
  });
});
