/**
 * Regression tests for code_intel fallback chains and confidence labeling.
 *
 * Verifies that:
 * - `callers` uses LSP → ripgrep (no tree-sitter)
 * - `implementations` uses LSP → ripgrep (no tree-sitter)
 * - Confidence labels match the actual source of data
 * - Fallthrough happens correctly when LSP returns empty/no results
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeAction } from "../src/tool-actions.ts";

// ── LSP mock ──────────────────────────────────────────────────────────

const mockLspFns = vi.hoisted(() => ({
  getSessionLspService: vi.fn<(cwd: string) => unknown>(),
}));

vi.mock("@mrclrchtr/supi-lsp/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-lsp/api")>();
  return {
    ...actual,
    getSessionLspService: mockLspFns.getSessionLspService,
  };
});

// ── Test helpers ──────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-fallback-"));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmpDir, { recursive: true, force: true });
});

function createSourceFile(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

// ── callers — LSP unavailable ─────────────────────────────────────────

describe("callers action — LSP unavailable", () => {
  beforeEach(() => {
    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "unavailable",
      reason: "No LSP in test env",
    });
  });

  it("returns no-data message for anchored target without symbol name", async () => {
    createSourceFile("test.ts", "export const x = 1;\n");

    const result = await executeAction(
      { action: "callers", file: "test.ts", line: 1, character: 1 },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("No caller data available");
    expect(result.details).toBeDefined();
    if (result.details) {
      expect(result.details.type).toBe("search");
      if (result.details.type === "search") {
        expect(result.details.data.confidence).toBe("unavailable");
      }
    }
  });

  it("falls back to heuristic text search when symbol is provided", async () => {
    createSourceFile("lib.ts", "function myFunc() { return 42; }\nmyFunc();\n");

    const result = await executeAction({ action: "callers", symbol: "myFunc" }, { cwd: tmpDir });

    expect(result.content).toContain("heuristic");
    expect(result.content).toContain("myFunc");
    expect(result.details).toBeDefined();
    expect(result.details?.type).toBe("search");
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("heuristic");
      // heuristic path now sets candidateCount to actual ripgrep match count
      expect(result.details.data.candidateCount).toBeGreaterThan(0);
    }
  });

  it("returns heuristic confidence for symbol target with declaration-only matches", async () => {
    createSourceFile("lib.ts", "function orphanFunc() { return 42; }\n");

    const result = await executeAction(
      { action: "callers", symbol: "orphanFunc" },
      { cwd: tmpDir },
    );

    // ripgrep finds the declaration as a match (word-boundary search), so
    // the heuristic path shows matches rather than "No references found"
    expect(result.content).toContain("heuristic");
    expect(result.content).toContain("orphanFunc");
    expect(result.details).toBeDefined();
    expect(result.details?.type).toBe("search");
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("heuristic");
    }
  });
});

// ── callers — LSP available ──────────────────────────────────────────

describe("callers action — LSP available", () => {
  it("returns semantic confidence when LSP returns caller references", async () => {
    const sourcePath = createSourceFile("src/module.ts", "export function target() {}\n");
    createSourceFile("src/caller.ts", "import { target } from './module';\ntarget();\n");

    const mockService = {
      references: vi.fn().mockResolvedValue([
        {
          uri: `file://${sourcePath}`,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
        },
        {
          uri: `file://${path.join(tmpDir, "src", "caller.ts")}`,
          range: { start: { line: 2, character: 0 }, end: { line: 2, character: 6 } },
        },
      ]),
      implementation: vi.fn(),
    } as { references: ReturnType<typeof vi.fn>; implementation: ReturnType<typeof vi.fn> };

    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: mockService,
    });

    const result = await executeAction(
      { action: "callers", file: "src/module.ts", line: 1, character: 1 },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("Callers");
    expect(result.content).toContain("semantic");
    expect(result.details).toBeDefined();
    expect(result.details?.type).toBe("search");
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("semantic");
      // candidateCount should match the rendered, non-declaration caller refs
      expect(result.details.data.candidateCount).toBe(1);
    }
    // Verify LSP was called
    expect(mockService.references).toHaveBeenCalledTimes(1);
  });

  it("falls through to heuristic when LSP returns only the declaration (anchored, no name)", async () => {
    const sourcePath = createSourceFile("src/module.ts", "export function target() {}\n");

    const mockService = {
      references: vi.fn().mockResolvedValue([
        {
          uri: `file://${sourcePath}`,
          // Matches the declaration position (line 1, char 1 → 0-based line 0, char 0)
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
        },
      ]),
      implementation: vi.fn(),
    } as { references: ReturnType<typeof vi.fn>; implementation: ReturnType<typeof vi.fn> };

    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: mockService,
    });

    const result = await executeAction(
      { action: "callers", file: "src/module.ts", line: 1, character: 1 },
      { cwd: tmpDir },
    );

    // Anchored target has no symbol name → cannot do heuristic fallback
    expect(result.content).toContain("No caller data available");
    expect(result.details).toBeDefined();
    if (result.details) {
      expect(result.details.type).toBe("search");
      if (result.details.type === "search") {
        expect(result.details.data.confidence).toBe("unavailable");
      }
    }
  });

  it("falls back to heuristic when LSP returns only the declaration with symbol name", async () => {
    const sourcePath = createSourceFile("src/module.ts", "export function target() {}\n");

    const mockService: Record<string, ReturnType<typeof vi.fn>> = {
      references: vi.fn().mockResolvedValue([
        {
          uri: `file://${sourcePath}`,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
        },
      ]),
      implementation: vi.fn(),
      workspaceSymbol: vi.fn().mockResolvedValue([
        {
          name: "target",
          kind: 6, // Method
          location: {
            uri: `file://${sourcePath}`,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
          },
        },
      ]),
    };

    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: mockService,
    });

    // Symbol target: resolveTarget uses LSP workspaceSymbol to find the declaration,
    // then action's LSP references returns only the declaration → falls through.
    // target.name is set from the resolved symbol → falls to heuristic.

    const result = await executeAction({ action: "callers", symbol: "target" }, { cwd: tmpDir });

    // LSP refs found only declaration, filtered out → callerRefs.length === 0
    // target.name is "target" → falls to heuristic
    expect(result.content).toContain("heuristic");
    expect(result.details).toBeDefined();
    expect(result.details?.type).toBe("search");
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("heuristic");
    }
  });

  it("falls back to heuristic when LSP returns null references with symbol name", async () => {
    createSourceFile("src/module.ts", "export function target() {}\n");

    const mockService = {
      references: vi.fn().mockResolvedValue(null),
      implementation: vi.fn(),
      workspaceSymbol: vi.fn().mockResolvedValue([
        {
          name: "target",
          kind: 6,
          location: {
            uri: `file://${path.join(tmpDir, "src", "module.ts")}`,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
          },
        },
      ]),
    };

    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: mockService,
    });

    const result = await executeAction({ action: "callers", symbol: "target" }, { cwd: tmpDir });

    expect(result.content).toContain("heuristic");
    expect(result.details).toBeDefined();
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("heuristic");
    }
  });
});

// ── implementations — LSP unavailable ─────────────────────────────────

describe("implementations action — LSP unavailable", () => {
  beforeEach(() => {
    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "unavailable",
      reason: "No LSP in test env",
    });
  });

  it("returns no-data message for anchored target without symbol name", async () => {
    createSourceFile("interface.ts", "export interface MyInterface {}\n");

    const result = await executeAction(
      { action: "implementations", file: "interface.ts", line: 1, character: 1 },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("No implementations found");
    expect(result.details).toBeDefined();
    if (result.details) {
      expect(result.details.type).toBe("search");
      if (result.details.type === "search") {
        expect(result.details.data.confidence).toBe("unavailable");
      }
    }
  });

  it("falls back to heuristic text search when symbol is provided", async () => {
    createSourceFile(
      "shapes.ts",
      [
        "interface Drawable { draw(): void; }",
        "class Circle implements Drawable { draw() {} }",
        "class Square implements Drawable { draw() {} }",
      ].join("\n"),
    );

    const result = await executeAction(
      { action: "implementations", symbol: "Drawable" },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("heuristic");
    expect(result.content).toContain("Drawable");
    expect(result.details).toBeDefined();
    expect(result.details?.type).toBe("search");
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("heuristic");
    }
  });

  it("returns no-matches message with heuristic confidence when heuristic finds nothing", async () => {
    createSourceFile("alone.ts", "interface Lonesome {}\n");

    const result = await executeAction(
      { action: "implementations", symbol: "Lonesome" },
      { cwd: tmpDir },
    );

    // Symbol resolves, but heuristic finds no implements/extends matches
    expect(result.content).toContain("No implementations found");
    // Details ARE returned with heuristic confidence (the heuristic search ran, just found nothing)
    expect(result.details).toBeDefined();
    expect(result.details?.type).toBe("search");
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("heuristic");
    }
  });
});

// ── implementations — LSP available ────────────────────────────────────

describe("implementations action — LSP available", () => {
  it("returns semantic confidence when LSP returns implementation locations", async () => {
    createSourceFile("src/iface.ts", "export interface Drawable { draw(): void; }\n");
    createSourceFile("src/circle.ts", "export class Circle implements Drawable { draw() {} }\n");

    const mockService = {
      references: vi.fn(),
      implementation: vi.fn().mockResolvedValue([
        {
          uri: `file://${path.join(tmpDir, "src", "circle.ts")}`,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
        },
      ]),
    } as { references: ReturnType<typeof vi.fn>; implementation: ReturnType<typeof vi.fn> };

    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: mockService,
    });

    const result = await executeAction(
      { action: "implementations", file: "src/iface.ts", line: 1, character: 1 },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("Implementations");
    expect(result.content).toContain("semantic");
    expect(result.details).toBeDefined();
    expect(result.details?.type).toBe("search");
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("semantic");
      expect(result.details.data.candidateCount).toBe(1);
    }
    expect(mockService.implementation).toHaveBeenCalledTimes(1);
  });

  it("falls through to heuristic when LSP implementation returns empty (with symbol name)", async () => {
    createSourceFile("src/iface.ts", "export interface Solo { run(): void; }\n");

    const mockService: Record<string, ReturnType<typeof vi.fn>> = {
      references: vi.fn(),
      implementation: vi.fn().mockResolvedValue([]),
      workspaceSymbol: vi.fn().mockResolvedValue([
        {
          name: "Solo",
          kind: 11, // Interface
          location: {
            uri: `file://${path.join(tmpDir, "src", "iface.ts")}`,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
          },
        },
      ]),
    };

    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: mockService,
    });

    const result = await executeAction(
      { action: "implementations", symbol: "Solo" },
      { cwd: tmpDir },
    );

    // Content says "No implementations found" (no heuristic label in no-match content)
    // but details carry heuristic confidence
    expect(result.content).toContain("No implementations found");
    expect(result.details).toBeDefined();
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("heuristic");
    }
  });

  it("falls through to heuristic when LSP returns null implementations (with symbol name)", async () => {
    createSourceFile("src/iface.ts", "export interface EmptyIface {}\n");

    const mockService: Record<string, ReturnType<typeof vi.fn>> = {
      references: vi.fn(),
      implementation: vi.fn().mockResolvedValue(null),
      workspaceSymbol: vi.fn().mockResolvedValue([
        {
          name: "EmptyIface",
          kind: 11,
          location: {
            uri: `file://${path.join(tmpDir, "src", "iface.ts")}`,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
          },
        },
      ]),
    };

    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: mockService,
    });

    const result = await executeAction(
      { action: "implementations", symbol: "EmptyIface" },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("No implementations found");
    expect(result.details).toBeDefined();
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("heuristic");
    }
  });

  it("returns no-data for anchored target when LSP returns empty implementations (no name)", async () => {
    createSourceFile("src/iface.ts", "export interface Lonesome {}\n");

    const mockService = {
      references: vi.fn(),
      implementation: vi.fn().mockResolvedValue([]),
    } as { references: ReturnType<typeof vi.fn>; implementation: ReturnType<typeof vi.fn> };

    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: mockService,
    });

    const result = await executeAction(
      { action: "implementations", file: "src/iface.ts", line: 1, character: 1 },
      { cwd: tmpDir },
    );

    // Anchored target has no name → cannot do heuristic fallback
    expect(result.content).toContain("No implementations found");
    expect(result.details).toBeDefined();
    if (result.details) {
      expect(result.details.type).toBe("search");
      if (result.details.type === "search") {
        expect(result.details.data.confidence).toBe("unavailable");
      }
    }
  });
});

// ── Confidence label accuracy ─────────────────────────────────────────

describe("confidence labels never overstated", () => {
  it("callers never reports structural confidence", async () => {
    createSourceFile("test.ts", "export function f() {}\n");

    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "unavailable",
      reason: "No LSP",
    });

    const result = await executeAction({ action: "callers", symbol: "f" }, { cwd: tmpDir });

    if (result.details?.type === "search") {
      // callers has no tree-sitter fallback, so it can never be "structural"
      expect(result.details.data.confidence).not.toBe("structural");
    }
  });

  it("implementations never reports structural confidence", async () => {
    createSourceFile("test.ts", "interface I {}\nclass C implements I {}\n");

    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "unavailable",
      reason: "No LSP",
    });

    const result = await executeAction({ action: "implementations", symbol: "I" }, { cwd: tmpDir });

    if (result.details?.type === "search") {
      // implementations has no tree-sitter fallback
      expect(result.details.data.confidence).not.toBe("structural");
    }
  });
});
