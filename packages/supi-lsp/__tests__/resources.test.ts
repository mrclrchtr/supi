import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  scanProjectCapabilities: vi.fn(() => []),
  startDetectedServers: vi.fn(),
  introspectCapabilities: vi.fn(() => []),
  buildProjectGuidelines: vi.fn(() => []),
  lspPromptGuidelines: [],
  lspPromptSnippet: "test",
  lspToolDescription: "test",
  executeAction: vi.fn(),
  diagnosticsContextFingerprint: vi.fn(),
  formatDiagnosticsContext: vi.fn(),
  pruneAndReorderContextMessages: vi.fn((msgs) => msgs),
  registerLspAwareToolOverrides: vi.fn(),
}));

vi.mock("../config.ts", () => ({ loadConfig: mockFns.loadConfig }));
vi.mock("../scanner.ts", () => ({
  scanProjectCapabilities: mockFns.scanProjectCapabilities,
  startDetectedServers: mockFns.startDetectedServers,
  introspectCapabilities: mockFns.introspectCapabilities,
}));
vi.mock("@mrclrchtr/supi-core", () => ({
  pruneAndReorderContextMessages: mockFns.pruneAndReorderContextMessages,
}));
vi.mock("../guidance.ts", () => ({
  buildProjectGuidelines: mockFns.buildProjectGuidelines,
  diagnosticsContextFingerprint: mockFns.diagnosticsContextFingerprint,
  formatDiagnosticsContext: mockFns.formatDiagnosticsContext,
  lspPromptGuidelines: mockFns.lspPromptGuidelines,
  lspPromptSnippet: mockFns.lspPromptSnippet,
}));
vi.mock("../overrides.ts", () => ({
  registerLspAwareToolOverrides: mockFns.registerLspAwareToolOverrides,
}));
vi.mock("../tool-actions.ts", () => ({
  executeAction: mockFns.executeAction,
  lspToolDescription: mockFns.lspToolDescription,
}));
vi.mock("../ui.ts", () => ({
  toggleLspStatusOverlay: vi.fn(),
  updateLspUi: vi.fn(),
}));
vi.mock("../summary.ts", () => ({}));

import lspExtension from "../lsp.ts";

function setup(): Map<string, (...args: unknown[]) => unknown> {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const pi = {
    on(event: string, handler: (...args: unknown[]) => unknown) {
      handlers.set(event, handler);
    },
    registerTool() {},
    registerCommand() {},
    getActiveTools: () => ["lsp"],
    setActiveTools: () => {},
  };
  lspExtension(pi as never);
  return handlers;
}

function getDiscoverHandler(handlers: Map<string, (...args: unknown[]) => unknown>) {
  const handler = handlers.get("resources_discover");
  expect(handler).toBeDefined();
  return handler as (...args: unknown[]) => Promise<{ skillPaths: string[] }>;
}

describe("supi-lsp resources_discover", () => {
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
