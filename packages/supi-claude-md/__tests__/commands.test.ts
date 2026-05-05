import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPiMock, DEFAULT_CONFIG } from "./extension-helpers.ts";

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
  reconstructState: mockFns.reconstructState,
}));

import claudeMdExtension from "../src/claude-md.ts";

function resetMocks() {
  vi.clearAllMocks();
  mockFns.loadClaudeMdConfig.mockReturnValue({ ...DEFAULT_CONFIG });
}

describe("claudeMdExtension: /revise-claude-md command", () => {
  beforeEach(resetMocks);

  it("registers the revise-claude-md command", () => {
    const { commands, pi } = createPiMock();
    claudeMdExtension(pi as never);
    expect(commands.has("revise-claude-md")).toBe(true);
  });

  it("sends a user message with the revise prompt when invoked", async () => {
    const { commands, sendUserMessage, pi } = createPiMock();
    claudeMdExtension(pi as never);

    const command = commands.get("revise-claude-md") as {
      handler: (args: string, ctx: unknown) => Promise<unknown>;
    };
    await command.handler("", { cwd: "/project" });

    expect(sendUserMessage).toHaveBeenCalledOnce();
    const message = sendUserMessage.mock.calls[0][0] as string;
    expect(message).toContain("Review this session");
    expect(message).toContain("Reflect");
    expect(message).toContain("Find CLAUDE.md");
  });
});
