import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const DEFAULT_CONFIG = {
  rereadInterval: 3,
  subdirs: true,
  fileNames: ["CLAUDE.md", "AGENTS.md"],
};

function setup(): Map<string, (...args: unknown[]) => unknown> {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const pi = {
    on(event: string, handler: (...args: unknown[]) => unknown) {
      handlers.set(event, handler);
    },
    registerCommand() {},
    registerMessageRenderer() {},
  };
  claudeMdExtension(pi as never);
  return handlers;
}

function getDiscoverHandler(handlers: Map<string, (...args: unknown[]) => unknown>) {
  const handler = handlers.get("resources_discover");
  expect(handler).toBeDefined();
  return handler as (...args: unknown[]) => Promise<{ skillPaths: string[] }>;
}

describe("supi-claude-md resources_discover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFns.loadClaudeMdConfig.mockReturnValue({ ...DEFAULT_CONFIG });
  });

  it("registers a resources_discover handler", () => {
    const handlers = setup();
    expect(handlers.has("resources_discover")).toBe(true);
  });

  it("returns absolute skill paths", async () => {
    const handler = getDiscoverHandler(setup());
    const result = await handler({}, { cwd: "/tmp" });

    expect(result.skillPaths).toBeDefined();
    expect(result.skillPaths.length).toBeGreaterThan(0);
    for (const p of result.skillPaths) {
      expect(p).toMatch(/^\//);
    }
  });

  it("points at a resources directory that exists on disk", async () => {
    const handler = getDiscoverHandler(setup());
    const result = await handler({}, { cwd: "/tmp" });

    for (const p of result.skillPaths) {
      expect(existsSync(p)).toBe(true);
    }
  });

  it("points at a directory containing a SKILL.md", async () => {
    const handler = getDiscoverHandler(setup());
    const result = await handler({}, { cwd: "/tmp" });

    for (const p of result.skillPaths) {
      expect(findSkillFile(p)).toBeTruthy();
    }
  });
});

function findSkillFile(dir: string): string | null {
  if (existsSync(join(dir, "SKILL.md"))) return join(dir, "SKILL.md");
  const entries = existsSync(dir) ? readdirSync(dir) : [];
  for (const entry of entries) {
    const sub = join(dir, entry);
    if (statSync(sub).isDirectory()) {
      const found = findSkillFile(sub);
      if (found) return found;
    }
  }
  return null;
}
