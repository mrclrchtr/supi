import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeAction } from "../helpers/execute-action.ts";

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

function mockReadyService(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  mockLspFns.getSessionLspService.mockReturnValue({
    kind: "ready",
    service: {
      workspaceSymbol: vi.fn().mockResolvedValue([]),
      documentSymbols: vi.fn().mockResolvedValue(null),
      references: vi.fn().mockResolvedValue(null),
      implementation: vi.fn().mockResolvedValue(null),
      getOutstandingDiagnosticSummary: vi.fn().mockReturnValue([]),
      ...overrides,
    },
  });
}

describe("callers action without heuristic fallback", () => {
  it("returns unavailable details when symbol discovery lacks active LSP", async () => {
    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "unavailable",
      reason: "No LSP in test env",
    });

    const result = await executeAction({ action: "callers", symbol: "myFunc" }, { cwd: tmpDir });

    expect(result.content).toContain("requires active LSP");
    expect(result.content).not.toContain("heuristic");
    expect(result.details?.type).toBe("search");
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("unavailable");
      expect(result.details.data.candidateCount).toBe(0);
    }
  });

  it("returns semantic confidence when LSP returns caller references", async () => {
    const sourcePath = createSourceFile("src/module.ts", "export function target() {}\n");
    createSourceFile("src/caller.ts", "import { target } from './module';\ntarget();\n");

    mockReadyService({
      references: vi.fn().mockResolvedValue([
        {
          uri: `file://${sourcePath}`,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
        },
        {
          uri: `file://${path.join(tmpDir, "src", "caller.ts")}`,
          range: { start: { line: 1, character: 0 }, end: { line: 1, character: 6 } },
        },
      ]),
    });

    const result = await executeAction(
      { action: "callers", file: "src/module.ts", line: 1, character: 1 },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("semantic");
    expect(result.details?.type).toBe("search");
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("semantic");
      expect(result.details.data.candidateCount).toBe(1);
    }
  });

  it("does not fall back to heuristic when semantic caller lookup finds no refs", async () => {
    const sourcePath = createSourceFile("src/module.ts", "export function target() {}\n");

    mockReadyService({
      workspaceSymbol: vi.fn().mockResolvedValue([
        {
          name: "target",
          kind: 6,
          location: {
            uri: `file://${sourcePath}`,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
          },
        },
      ]),
      references: vi.fn().mockResolvedValue([]),
    });

    const result = await executeAction({ action: "callers", symbol: "target" }, { cwd: tmpDir });

    expect(result.content).toContain("No references found for `target` (semantic)");
    expect(result.content).not.toContain("heuristic");
    expect(result.details?.type).toBe("search");
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("semantic");
      expect(result.details.data.candidateCount).toBe(0);
    }
  });
});

describe("implementations action without heuristic fallback", () => {
  it("returns unavailable details when symbol discovery lacks active LSP", async () => {
    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "inactive",
      service: {
        workspaceSymbol: vi.fn(),
        implementation: vi.fn(),
      },
    });

    const result = await executeAction(
      { action: "implementations", symbol: "Drawable" },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("requires active LSP");
    expect(result.content).not.toContain("heuristic");
    expect(result.details?.type).toBe("search");
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("unavailable");
    }
  });

  it("returns semantic confidence when LSP returns implementation locations", async () => {
    const ifacePath = createSourceFile("src/iface.ts", "export interface Drawable {}\n");
    createSourceFile("src/circle.ts", "export class Circle implements Drawable {}\n");

    mockReadyService({
      implementation: vi.fn().mockResolvedValue([
        {
          uri: `file://${path.join(tmpDir, "src", "circle.ts")}`,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
        },
      ]),
    });

    const result = await executeAction(
      { action: "implementations", file: path.relative(tmpDir, ifacePath), line: 1, character: 1 },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("semantic");
    expect(result.details?.type).toBe("search");
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("semantic");
      expect(result.details.data.candidateCount).toBe(1);
    }
  });

  it("keeps semantic confidence when implementation lookup returns no matches", async () => {
    const ifacePath = createSourceFile("src/iface.ts", "export interface Solo {}\n");

    mockReadyService({
      workspaceSymbol: vi.fn().mockResolvedValue([
        {
          name: "Solo",
          kind: 11,
          location: {
            uri: `file://${ifacePath}`,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
          },
        },
      ]),
      implementation: vi.fn().mockResolvedValue([]),
    });

    const result = await executeAction(
      { action: "implementations", symbol: "Solo" },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("No implementations found for `Solo`.");
    expect(result.content).not.toContain("heuristic");
    expect(result.details?.type).toBe("search");
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("semantic");
      expect(result.details.data.candidateCount).toBe(0);
    }
  });
});

describe("affected action without heuristic fallback", () => {
  it("returns unavailable details when symbol discovery lacks active LSP", async () => {
    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "unavailable",
      reason: "No LSP in test env",
    });

    const result = await executeAction({ action: "affected", symbol: "Widget" }, { cwd: tmpDir });

    expect(result.content).toContain("requires active LSP");
    expect(result.content).not.toContain("heuristic");
    expect(result.details?.type).toBe("affected");
    if (result.details?.type === "affected") {
      expect(result.details.data.confidence).toBe("unavailable");
      expect(result.details.data.directCount).toBe(0);
    }
  });

  it("keeps semantic confidence when affected reference gathering finds no refs", async () => {
    const targetPath = createSourceFile("src/widget.ts", "export interface Widget {}\n");

    mockReadyService({
      workspaceSymbol: vi.fn().mockResolvedValue([
        {
          name: "Widget",
          kind: 11,
          location: {
            uri: `file://${targetPath}`,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
          },
        },
      ]),
      references: vi.fn().mockResolvedValue([]),
    });

    const result = await executeAction({ action: "affected", symbol: "Widget" }, { cwd: tmpDir });

    expect(result.content).toContain("(semantic)");
    expect(result.content).not.toContain("heuristic");
    expect(result.details?.type).toBe("affected");
    if (result.details?.type === "affected") {
      expect(result.details.data.confidence).toBe("semantic");
      expect(result.details.data.directCount).toBe(0);
    }
  });
});
