import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeAction } from "../helpers/execute-action.ts";
import { clearMockRuntime, registerMockProvider } from "../helpers/register-mock-runtime.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-fallback-"));
});

afterEach(() => {
  clearMockRuntime();
  rmSync(tmpDir, { recursive: true, force: true });
});

function createSourceFile(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

describe("callers action without heuristic fallback", () => {
  it("returns unavailable details when symbol discovery lacks active LSP", async () => {
    // No provider registered — getCodeProvider returns unavailable
    const result = await executeAction({ action: "callers", symbol: "myFunc" }, { cwd: tmpDir });

    expect(result.content).toContain("No semantic analysis provider");
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

    // Register a provider that returns caller references
    const refResult = [
      {
        uri: `file://${sourcePath}`,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
      },
      {
        uri: `file://${path.join(tmpDir, "src", "caller.ts")}`,
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 6 } },
      },
    ];

    registerMockProvider(tmpDir, {
      references: async () => refResult,
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

    registerMockProvider(tmpDir, {
      workspaceSymbols: async () => [
        {
          name: "target",
          kind: "Function",
          file: sourcePath,
          line: 1,
          character: 1,
        },
      ],
      references: async () => [],
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
    const result = await executeAction(
      { action: "implementations", symbol: "Drawable" },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("No semantic analysis provider");
    expect(result.content).not.toContain("heuristic");
    expect(result.details?.type).toBe("search");
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("unavailable");
    }
  });

  it("returns semantic confidence when LSP returns implementation locations", async () => {
    const ifacePath = createSourceFile("src/iface.ts", "export interface Drawable {}\n");
    createSourceFile("src/circle.ts", "export class Circle implements Drawable {}\n");

    registerMockProvider(tmpDir, {
      implementation: async () => [
        {
          uri: `file://${path.join(tmpDir, "src", "circle.ts")}`,
          targetUri: `file://${path.join(tmpDir, "src", "circle.ts")}`,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
        },
      ],
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

    registerMockProvider(tmpDir, {
      workspaceSymbols: async () => [
        {
          name: "Solo",
          kind: "Interface",
          file: ifacePath,
          line: 1,
          character: 1,
        },
      ],
      implementation: async () => [],
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
    const result = await executeAction({ action: "affected", symbol: "Widget" }, { cwd: tmpDir });

    expect(result.content).toContain("No semantic analysis provider is available");
    expect(result.content).not.toContain("heuristic");
    expect(result.details?.type).toBe("affected");
    if (result.details?.type === "affected") {
      expect(result.details.data.confidence).toBe("unavailable");
      expect(result.details.data.directCount).toBe(0);
    }
  });

  it("keeps semantic confidence when affected reference gathering finds no refs", async () => {
    const targetPath = createSourceFile("src/widget.ts", "export interface Widget {}\n");

    registerMockProvider(tmpDir, {
      workspaceSymbols: async () => [
        {
          name: "Widget",
          kind: "Interface",
          file: targetPath,
          line: 1,
          character: 1,
        },
      ],
      references: async () => [],
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
