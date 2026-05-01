import { describe, expect, it, vi } from "vitest";

// Mock submodules before importing the extension
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
  pruneAndReorderContextMessages: mockFns.pruneAndReorderContextMessages,
  restorePromptContent: vi.fn((msgs: unknown) => msgs),
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

vi.mock("../settings-registration.ts", () => ({
  registerClaudeMdSettings: vi.fn(),
}));

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import claudeMdExtension from "../index.ts";

// Capture registerMessageRenderer calls
function createPiWithRenderers() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const renderers = new Map<string, (...args: unknown[]) => unknown>();

  const pi = {
    on(event: string, handler: (...args: unknown[]) => unknown) {
      handlers.set(event, handler);
    },
    registerCommand() {},
    registerMessageRenderer(customType: string, renderer: (...args: unknown[]) => unknown) {
      renderers.set(customType, renderer);
    },
  } as unknown as ExtensionAPI;

  return { handlers, renderers, pi };
}

// Minimal theme that wraps text with color markers for assertions
function createTheme() {
  const fg = (color: string, text: string) => `[${color}]${text}[/${color}]`;
  const bg = (_color: string, text: string) => text; // bg doesn't matter for assertions
  return { fg, bg };
}

type RenderOutputOptions = { expanded?: boolean; width?: number };

function renderClaudeMdMessage(details: unknown, options: RenderOutputOptions = {}): string {
  const { renderers, pi } = createPiWithRenderers();
  claudeMdExtension(pi);

  const renderer = renderers.get("supi-claude-md-refresh");
  if (!renderer) throw new Error("supi-claude-md-refresh renderer was not registered");

  const result = renderer(
    {
      role: "custom" as const,
      customType: "supi-claude-md-refresh",
      content: "some content",
      display: true,
      details,
      timestamp: Date.now(),
    },
    { expanded: options.expanded ?? false },
    createTheme(),
  );

  return (result as { render: (w: number) => string[] }).render(options.width ?? 80).join("\n");
}

describe("supi-claude-md-refresh message renderer", () => {
  it("renders collapsed view with file count", () => {
    const output = renderClaudeMdMessage({
      contextToken: "supi-claude-md-3",
      turn: 3,
      fileCount: 3,
      files: ["CLAUDE.md", "docs/CLAUDE.md", "src/AGENTS.md"],
    });

    expect(output).toContain("CLAUDE.md refreshed (3 files)");
    // Collapsed should NOT show token
    expect(output).not.toContain("token:");
  });

  it("renders expanded view with token details", () => {
    const output = renderClaudeMdMessage(
      {
        contextToken: "supi-claude-md-5",
        turn: 5,
        fileCount: 2,
        files: ["CLAUDE.md", "packages/app/CLAUDE.md"],
      },
      { expanded: true },
    );

    expect(output).toContain("CLAUDE.md refreshed (2 files)");
    expect(output).toContain("CLAUDE.md");
    expect(output).toContain("packages/app/CLAUDE.md");
    expect(output).toContain("token: supi-claude-md-5");
  });

  it("renders with missing details gracefully", () => {
    const output = renderClaudeMdMessage(undefined);

    expect(output).toContain("CLAUDE.md refreshed");
    expect(output).not.toContain("files)");
  });

  it("renders singular file count correctly", () => {
    const output = renderClaudeMdMessage({
      contextToken: "t-1",
      turn: 1,
      fileCount: 1,
      files: ["CLAUDE.md"],
    });

    expect(output).toContain("CLAUDE.md refreshed (1 file)");
    expect(output).not.toContain("1 files");
  });
});
