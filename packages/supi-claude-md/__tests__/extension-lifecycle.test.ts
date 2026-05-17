import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "./extension-helpers.ts";

const mockFns = vi.hoisted(() => ({
  loadClaudeMdConfig: vi.fn(),
  extractPathFromToolEvent: vi.fn(),
  filterAlreadyLoaded: vi.fn(),
  findSubdirContextFiles: vi.fn(),
  formatSubdirContext: vi.fn(),
  shouldInjectSubdir: vi.fn(),
  reconstructState: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-core/api", () => ({
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
    injectedDirs: new Set(),
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

describe("claudeMdExtension: registration", () => {
  beforeEach(resetMocks);

  it("registers all event handlers", () => {
    const pi = createPiMock();
    claudeMdExtension(pi as never);

    for (const event of ["session_start", "session_compact", "before_agent_start", "tool_result"]) {
      expect(pi.handlers.has(event), `missing handler for ${event}`).toBe(true);
    }
  });
});

describe("claudeMdExtension: session_start", () => {
  beforeEach(resetMocks);

  it("reconstructs state from session history", async () => {
    const pi = createPiMock();
    claudeMdExtension(pi as never);

    mockFns.reconstructState.mockReturnValue({
      injectedDirs: new Set(["packages/foo"]),
    });

    await pi.handlers.get("session_start")?.[0]?.(
      {},
      { cwd: "/project", sessionManager: { getBranch: () => [{ type: "assistant" }] } },
    );

    expect(mockFns.reconstructState).toHaveBeenCalled();
  });

  it("starts fresh when reconstruction fails", async () => {
    const pi = createPiMock();
    claudeMdExtension(pi as never);

    await expect(
      pi.handlers.get("session_start")?.[0]?.(
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

describe("claudeMdExtension: session_compact", () => {
  beforeEach(resetMocks);

  it("clears injectedDirs on compact", async () => {
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
    mockFns.filterAlreadyLoaded.mockImplementation((files: unknown[]) => files);
    mockFns.shouldInjectSubdir.mockReturnValue(true);
    mockFns.formatSubdirContext.mockReturnValue("<extension-context>content</extension-context>");

    await pi.handlers.get("tool_result")?.[0]?.(
      {
        isError: false,
        toolName: "read",
        input: { path: "packages/foo/bar.ts" },
        content: [{ type: "text", text: "file content" }],
      },
      makeCtx(),
    );

    // Compact should clear injectedDirs
    await pi.handlers.get("session_compact")?.[0]?.({}, makeCtx());

    const result = await pi.handlers.get("before_agent_start")?.[0]?.(
      { systemPromptOptions: { contextFiles: [{ path: "CLAUDE.md", content: "root" }] } },
      makeCtx(),
    );

    expect(result).toBeUndefined();
  });
});
