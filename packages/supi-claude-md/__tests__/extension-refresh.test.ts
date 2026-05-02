import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPiMock, DEFAULT_CONFIG, makeCtx } from "./extension-helpers.ts";

const mockFns = vi.hoisted(() => ({
  loadClaudeMdConfig: vi.fn(),
  shouldRefreshRoot: vi.fn(),
  formatRefreshContext: vi.fn(),
  readNativeContextFiles: vi.fn(),
  pruneAndReorderContextMessages: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-core", () => ({
  getContextToken: (details: unknown) =>
    details && typeof details === "object"
      ? ((details as { contextToken?: string }).contextToken ?? null)
      : null,
  loadSupiConfig: vi.fn(),
  pruneAndReorderContextMessages: mockFns.pruneAndReorderContextMessages,
  registerConfigSettings: vi.fn(),
  registerSettings: vi.fn(),
  removeSupiConfigKey: vi.fn(),
  restorePromptContent(
    messages: Array<{ customType?: string; content?: unknown; details?: unknown }>,
    customType: string,
    activeToken: string | null,
  ) {
    if (!activeToken) return messages;
    const getContextToken = (d: unknown): string | null => {
      if (!d || typeof d !== "object") return null;
      const t = (d as { contextToken?: unknown }).contextToken;
      return typeof t === "string" ? t : null;
    };
    const getPromptContent = (d: unknown): string | null => {
      if (!d || typeof d !== "object") return null;
      const p = (d as { promptContent?: unknown }).promptContent;
      return typeof p === "string" ? p : null;
    };
    const idx = messages.findIndex(
      (m) => m.customType === customType && getContextToken(m.details) === activeToken,
    );
    if (idx === -1) return messages;
    const pc = getPromptContent(messages[idx]?.details);
    if (!pc || messages[idx]?.content === pc) return messages;
    const next = [...messages];
    next[idx] = { ...next[idx], content: pc };
    return next;
  },
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
  reconstructState: vi.fn(),
}));

import claudeMdExtension from "../index.ts";

function resetMocks() {
  vi.clearAllMocks();
  mockFns.loadClaudeMdConfig.mockReturnValue({ ...DEFAULT_CONFIG, fileNames: ["CLAUDE.md"] });
  mockFns.shouldRefreshRoot.mockReturnValue(false);
  mockFns.pruneAndReorderContextMessages.mockImplementation((msgs: unknown) => msgs);
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
        content: "CLAUDE.md refreshed (1 file)",
        display: true,
        details: {
          contextToken: expect.stringMatching(/^supi-claude-md-\d+$/),
          promptContent:
            '<extension-context source="supi-claude-md" file="CLAUDE.md">\n# Root\n</extension-context>',
          turn: 0,
          fileCount: 1,
          files: ["CLAUDE.md"],
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

  it("passes context usage to root refresh decision", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    const usage = { tokens: 100_000, contextWindow: 128_000, percent: 85 };

    await handlers.get("before_agent_start")?.(
      { systemPromptOptions: { contextFiles: [] } },
      makeCtx("/project", usage),
    );

    expect(mockFns.shouldRefreshRoot).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ contextThreshold: 80 }),
      usage,
    );
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

  it("does not emit refresh on turn 0 with fresh state", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    // shouldRefreshRoot returns false → no refresh message on first before_agent_start
    mockFns.shouldRefreshRoot.mockReturnValue(false);

    const result = await handlers.get("before_agent_start")?.(
      { systemPromptOptions: { contextFiles: [{ path: "CLAUDE.md", content: "# Root" }] } },
      makeCtx(),
    );

    expect(result).toBeUndefined();
    expect(mockFns.readNativeContextFiles).not.toHaveBeenCalled();
  });
});

describe("claudeMdExtension: context event", () => {
  beforeEach(resetMocks);

  it("delegates to pruneAndReorderContextMessages and returns modified messages", () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    const prunedMessages = [{ role: "user", customType: undefined, details: undefined }];
    mockFns.pruneAndReorderContextMessages.mockReturnValue(prunedMessages);

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
    mockFns.pruneAndReorderContextMessages.mockReturnValue(messages);

    const result = handlers.get("context")?.({ messages });

    expect(result).toBeUndefined();
  });

  it("restores raw prompt content only for model context", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    mockFns.shouldRefreshRoot.mockReturnValue(true);
    mockFns.readNativeContextFiles.mockReturnValue([{ path: "CLAUDE.md", content: "# Root" }]);
    mockFns.formatRefreshContext.mockReturnValue("<extension-context>raw</extension-context>");
    mockFns.pruneAndReorderContextMessages.mockImplementation((msgs: unknown) => msgs);

    const refresh = (await handlers.get("before_agent_start")?.(
      { systemPromptOptions: { contextFiles: [{ path: "CLAUDE.md", content: "# Root" }] } },
      makeCtx(),
    )) as { message: Record<string, unknown> } | undefined;
    const message = refresh?.message;

    const result = handlers.get("context")?.({
      messages: [{ role: "custom", ...message }],
    });

    expect(result).toEqual({
      messages: [
        expect.objectContaining({
          content: "<extension-context>raw</extension-context>",
        }),
      ],
    });
    expect(message?.content).toBe("CLAUDE.md refreshed (1 file)");
  });
});
