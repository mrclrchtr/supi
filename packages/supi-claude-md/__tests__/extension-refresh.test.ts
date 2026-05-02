import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPiMock, DEFAULT_CONFIG, makeCtx } from "./extension-helpers.ts";

const mockFns = vi.hoisted(() => ({
  loadClaudeMdConfig: vi.fn(),
  shouldRefreshRoot: vi.fn(),
  formatRefreshContext: vi.fn(),
  readNativeContextFiles: vi.fn(),
  pruneAndReorderContextMessages: vi.fn(),
  extractPathFromToolEvent: vi.fn(),
  findSubdirContextFiles: vi.fn(),
  filterAlreadyLoaded: vi.fn(),
  formatSubdirContext: vi.fn(),
  shouldInjectSubdir: vi.fn(),
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
  reconstructState: vi.fn(),
}));

import claudeMdExtension from "../index.ts";

function resetMocks() {
  vi.clearAllMocks();
  mockFns.loadClaudeMdConfig.mockReturnValue({ ...DEFAULT_CONFIG, fileNames: ["CLAUDE.md"] });
  mockFns.shouldRefreshRoot.mockReturnValue(false);
  mockFns.pruneAndReorderContextMessages.mockImplementation((msgs: unknown) => msgs);
  mockFns.extractPathFromToolEvent.mockReturnValue(null);
  mockFns.findSubdirContextFiles.mockReturnValue([]);
  mockFns.filterAlreadyLoaded.mockImplementation((files: unknown[]) => files);
}

describe("claudeMdExtension: before_agent_start (no root refresh)", () => {
  beforeEach(resetMocks);

  it("does not emit a refresh message at turn 0", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    const result = await handlers.get("before_agent_start")?.(
      { systemPromptOptions: { contextFiles: [{ path: "CLAUDE.md", content: "# Root" }] } },
      makeCtx(),
    );

    expect(result).toBeUndefined();
    expect(mockFns.readNativeContextFiles).not.toHaveBeenCalled();
    expect(mockFns.formatRefreshContext).not.toHaveBeenCalled();
  });

  it("does not emit a refresh message at rereadInterval", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    // Simulate turns so interval would be met
    const turnEnd = handlers.get("turn_end") as (...args: unknown[]) => unknown;
    await turnEnd({ message: { stopReason: "stop" } }, makeCtx());
    await turnEnd({ message: { stopReason: "stop" } }, makeCtx());
    await turnEnd({ message: { stopReason: "stop" } }, makeCtx());

    const result = await handlers.get("before_agent_start")?.(
      { systemPromptOptions: { contextFiles: [{ path: "CLAUDE.md", content: "# Root" }] } },
      makeCtx(),
    );

    expect(result).toBeUndefined();
  });

  it("does not emit a refresh message when context usage is high", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    const usage = { tokens: 100_000, contextWindow: 128_000, percent: 85 };

    const result = await handlers.get("before_agent_start")?.(
      { systemPromptOptions: { contextFiles: [{ path: "CLAUDE.md", content: "# Root" }] } },
      makeCtx("/project", usage),
    );

    expect(result).toBeUndefined();
    expect(mockFns.shouldRefreshRoot).not.toHaveBeenCalled();
  });

  it("does not emit a refresh message when context usage is low", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    const usage = { tokens: 10_000, contextWindow: 128_000, percent: 10 };

    const result = await handlers.get("before_agent_start")?.(
      { systemPromptOptions: { contextFiles: [{ path: "CLAUDE.md", content: "# Root" }] } },
      makeCtx("/project", usage),
    );

    expect(result).toBeUndefined();
    expect(mockFns.shouldRefreshRoot).not.toHaveBeenCalled();
  });

  it("does not emit a refresh message after compaction", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    await handlers.get("session_compact")?.({}, makeCtx());

    const result = await handlers.get("before_agent_start")?.(
      { systemPromptOptions: { contextFiles: [{ path: "CLAUDE.md", content: "# Root" }] } },
      makeCtx(),
    );

    expect(result).toBeUndefined();
  });

  it("still captures native context paths on first before_agent_start", async () => {
    const { handlers, pi } = createPiMock();
    claudeMdExtension(pi as never);

    mockFns.extractPathFromToolEvent.mockReturnValue("src/foo.ts");
    mockFns.findSubdirContextFiles.mockReturnValue([
      { absolutePath: "/project/CLAUDE.md", relativePath: "CLAUDE.md", dir: "/project" },
    ]);
    mockFns.filterAlreadyLoaded.mockImplementation(
      (files: Array<{ absolutePath: string }>, nativePaths: Set<string>) =>
        files.filter((f) => !nativePaths.has(f.absolutePath)),
    );

    // First before_agent_start captures native paths
    await handlers.get("before_agent_start")?.(
      {
        systemPromptOptions: {
          contextFiles: [
            { path: "/project/CLAUDE.md", content: "# Root" },
            { path: "/project/AGENTS.md", content: "agents" },
          ],
        },
      },
      makeCtx(),
    );

    // Second before_agent_start should not re-capture
    await handlers.get("before_agent_start")?.(
      { systemPromptOptions: { contextFiles: [{ path: "/project/NEW.md", content: "new" }] } },
      makeCtx(),
    );

    // tool_result should use the originally captured paths for deduplication
    mockFns.formatSubdirContext.mockReturnValue("context");
    mockFns.shouldInjectSubdir.mockReturnValue(true);

    await handlers.get("tool_result")?.(
      { isError: false, toolName: "read", input: { path: "src/foo.ts" }, content: [] },
      makeCtx(),
    );

    expect(mockFns.formatSubdirContext).not.toHaveBeenCalled();
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
});
