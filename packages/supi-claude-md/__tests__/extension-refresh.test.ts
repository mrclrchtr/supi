import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPiMock, makeCtx } from "./extension-helpers.ts";

const mockFns = vi.hoisted(() => ({
  loadClaudeMdConfig: vi.fn(),
  shouldRefreshRoot: vi.fn(),
  formatRefreshContext: vi.fn(),
  readNativeContextFiles: vi.fn(),
  pruneStaleRefreshMessages: vi.fn(),
}));

vi.mock("../config.ts", () => ({
  loadClaudeMdConfig: mockFns.loadClaudeMdConfig,
}));

vi.mock("../discovery.ts", () => ({
  extractPathFromToolEvent: vi.fn(),
  filterAlreadyLoaded: vi.fn(),
  findSubdirContextFiles: vi.fn(),
}));

vi.mock("../subdirectory.ts", () => ({
  formatSubdirContext: vi.fn(),
  shouldInjectSubdir: vi.fn(),
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
  mockFns.loadClaudeMdConfig.mockReturnValue({
    rereadInterval: 3,
    subdirs: true,
    compactRefresh: true,
    fileNames: ["CLAUDE.md"],
  });
  mockFns.shouldRefreshRoot.mockReturnValue(false);
  mockFns.pruneStaleRefreshMessages.mockImplementation((msgs: unknown) => msgs);
}

describe("claudeMdExtension: before_agent_start (root refresh)", () => {
  beforeEach(resetMocks);

  it("injects root refresh message when refresh is due", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    mockFns.shouldRefreshRoot.mockReturnValue(true);
    mockFns.readNativeContextFiles.mockReturnValue([{ path: "CLAUDE.md", content: "# Root" }]);
    mockFns.formatRefreshContext.mockReturnValue(
      '<extension-context source="supi-claude-md" file="CLAUDE.md">\n# Root\n</extension-context>',
    );

    const result = await handlers.get("before_agent_start")?.(
      { systemPromptOptions: { contextFiles: [{ path: "CLAUDE.md", content: "# Root" }] } },
      makeCtx(),
    );

    expect(result).toEqual({
      message: {
        customType: "supi-claude-md-refresh",
        content:
          '<extension-context source="supi-claude-md" file="CLAUDE.md">\n# Root\n</extension-context>',
        display: false,
        details: {
          contextToken: expect.stringMatching(/^supi-claude-md-\d+$/),
          turn: 0,
        },
      },
    });
  });

  it("returns undefined when no refresh is needed", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    const result = await handlers.get("before_agent_start")?.(
      { systemPromptOptions: { contextFiles: [] } },
      makeCtx(),
    );

    expect(result).toBeUndefined();
  });

  it("returns undefined when native files are empty", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    mockFns.shouldRefreshRoot.mockReturnValue(true);
    mockFns.readNativeContextFiles.mockReturnValue([]);
    mockFns.formatRefreshContext.mockReturnValue("");

    const result = await handlers.get("before_agent_start")?.(
      { systemPromptOptions: { contextFiles: [] } },
      makeCtx(),
    );

    expect(result).toBeUndefined();
  });
});

describe("claudeMdExtension: before_agent_start (no duplication at session start)", () => {
  beforeEach(resetMocks);

  it("does not emit refresh on turn 0 with fresh state (needsRefresh=false)", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    // needsRefresh defaults to false, shouldRefreshRoot returns false
    // → no refresh message on first before_agent_start
    mockFns.shouldRefreshRoot.mockReturnValue(false);

    const result = await handlers.get("before_agent_start")?.(
      { systemPromptOptions: { contextFiles: [{ path: "CLAUDE.md", content: "# Root" }] } },
      makeCtx(),
    );

    expect(result).toBeUndefined();
    expect(mockFns.readNativeContextFiles).not.toHaveBeenCalled();
  });
});

describe("claudeMdExtension: compaction-triggered refresh", () => {
  beforeEach(resetMocks);

  it("sets needsRefresh=true on compact, causing re-injection on next before_agent_start", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    // Turn 0: no refresh (needsRefresh=false)
    mockFns.shouldRefreshRoot.mockReturnValue(false);
    await handlers.get("before_agent_start")?.(
      { systemPromptOptions: { contextFiles: [{ path: "CLAUDE.md", content: "# Root" }] } },
      makeCtx(),
    );

    // Compaction event sets needsRefresh=true (via real state mutation)
    await handlers.get("session_compact")?.({}, makeCtx());

    // Now shouldRefreshRoot returns true because needsRefresh is true
    mockFns.shouldRefreshRoot.mockReturnValue(true);
    mockFns.readNativeContextFiles.mockReturnValue([{ path: "CLAUDE.md", content: "# Root" }]);
    mockFns.formatRefreshContext.mockReturnValue("<extension-context>root</extension-context>");

    const result = await handlers.get("before_agent_start")?.(
      { systemPromptOptions: { contextFiles: [{ path: "CLAUDE.md", content: "# Root" }] } },
      makeCtx(),
    );

    expect(result).toMatchObject({ message: { customType: "supi-claude-md-refresh" } });
  });
});

describe("claudeMdExtension: context event", () => {
  beforeEach(resetMocks);

  it("delegates to pruneStaleRefreshMessages and returns modified messages", () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    const prunedMessages = [{ role: "user", customType: undefined, details: undefined }];
    mockFns.pruneStaleRefreshMessages.mockReturnValue(prunedMessages);

    const result = handlers.get("context")?.({
      messages: [
        { role: "user", customType: undefined, details: undefined },
        {
          role: "assistant",
          customType: "supi-claude-md-refresh",
          details: { contextToken: "old" },
        },
      ],
    });

    expect(result).toEqual({ messages: prunedMessages });
  });

  it("returns undefined when messages are unchanged", () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    const messages = [{ role: "user", customType: undefined, details: undefined }];
    mockFns.pruneStaleRefreshMessages.mockReturnValue(messages);

    const result = handlers.get("context")?.({ messages });

    expect(result).toBeUndefined();
  });
});
