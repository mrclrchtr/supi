import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeAction } from "../helpers/execute-action.ts";

const mockLspFns = vi.hoisted(() => ({
  getSessionLspService: vi.fn<(cwd: string) => unknown>(),
}));

const mockStructuralFns = vi.hoisted(() => ({
  getSessionTreeSitterService: vi.fn(),
  createTreeSitterSession: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-lsp/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-lsp/api")>();
  return {
    ...actual,
    getSessionLspService: mockLspFns.getSessionLspService,
  };
});

vi.mock("@mrclrchtr/supi-tree-sitter/api", () => ({
  getSessionTreeSitterService: mockStructuralFns.getSessionTreeSitterService,
  createTreeSitterSession: mockStructuralFns.createTreeSitterSession,
}));

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-file-target-"));
  const dispose = vi.fn();
  const mockSession = {
    exports: async (file: string) => getMockExportsResult(tmpDir, file),
    outline: vi.fn(),
    imports: vi.fn(),
    nodeAt: vi.fn(),
    calleesAt: vi.fn(),
    dispose,
  };
  mockStructuralFns.getSessionTreeSitterService.mockReturnValue({
    kind: "unavailable",
    reason: "No tree-sitter session",
  });
  mockStructuralFns.createTreeSitterSession.mockReturnValue(mockSession);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeJson(dir: string, file: string, data: unknown) {
  writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2));
}

function getMockExportsResult(cwd: string, file: string) {
  if (
    !file.endsWith(".ts") &&
    !file.endsWith(".tsx") &&
    !file.endsWith(".js") &&
    !file.endsWith(".jsx")
  ) {
    return {
      kind: "unsupported-language" as const,
      file,
      message: `exports is not supported for ${path.extname(file) || "unknown"} files`,
    };
  }

  const absolutePath = path.join(cwd, file);
  const source = readFileSync(absolutePath, "utf-8");
  const data = source.split(/\r?\n/).flatMap((line, index) => {
    const match = line.match(
      /export\s+(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/,
    );
    if (!match) return [];
    const symbolStart = line.indexOf(match[1]);
    return [
      {
        name: match[1],
        kind: "export",
        range: {
          startLine: index + 1,
          startCharacter: symbolStart + 1,
          endLine: index + 1,
          endCharacter: symbolStart + match[1].length + 1,
        },
      },
    ];
  });

  return { kind: "success" as const, data };
}

describe("file-level semantic targets", () => {
  it("expands file-only callers requests across exported symbols when semantic refs are available", async () => {
    writeJson(tmpDir, "package.json", { name: "test-proj" });
    const indexPath = path.join(tmpDir, "index.ts");
    writeFileSync(
      indexPath,
      ["export const foo = 1;", "export function bar() {", "  return foo;", "}"].join("\n"),
    );
    const consumerPath = path.join(tmpDir, "consumer.ts");
    writeFileSync(
      consumerPath,
      ['import { foo, bar } from "./index";', "console.log(foo);", "bar();"].join("\n"),
    );

    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: {
        documentSymbols: vi.fn().mockResolvedValue(null),
        references: vi
          .fn()
          .mockImplementation(async (_file: string, position: { line: number }) => {
            if (position.line === 0) {
              return [
                {
                  uri: `file://${indexPath}`,
                  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
                },
                {
                  uri: `file://${consumerPath}`,
                  range: { start: { line: 1, character: 12 }, end: { line: 1, character: 15 } },
                },
              ];
            }

            return [
              {
                uri: `file://${indexPath}`,
                range: { start: { line: 1, character: 16 }, end: { line: 1, character: 19 } },
              },
              {
                uri: `file://${consumerPath}`,
                range: { start: { line: 2, character: 0 }, end: { line: 2, character: 3 } },
              },
            ];
          }),
      },
    });

    const result = await executeAction({ action: "callers", file: "index.ts" }, { cwd: tmpDir });

    expect(result.content).toContain("Callers in `index.ts`");
    expect(result.content).toContain("`foo`");
    expect(result.content).toContain("`bar`");
    expect(result.content).toContain("consumer.ts");
    expect(result.content).not.toContain("require `line` and `character`");
    expect(result.details?.type).toBe("search");
  });

  it("returns unavailable caller details when file-level expansion lacks semantic refs", async () => {
    writeJson(tmpDir, "package.json", { name: "test-proj" });
    writeFileSync(path.join(tmpDir, "index.ts"), "export const foo = 1;\n");

    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "unavailable",
      reason: "No LSP in test env",
    });

    const result = await executeAction({ action: "callers", file: "index.ts" }, { cwd: tmpDir });

    expect(result.content).toContain("No caller references found");
    expect(result.content).not.toContain("heuristic");
    expect(result.details?.type).toBe("search");
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("unavailable");
    }
  });

  it("expands file-only affected requests across exported symbols when semantic refs are available", async () => {
    writeJson(tmpDir, "package.json", { name: "test-proj" });
    const indexPath = path.join(tmpDir, "index.ts");
    writeFileSync(
      indexPath,
      ["export const foo = 1;", "export function bar() {", "  return foo;", "}"].join("\n"),
    );
    const consumerPath = path.join(tmpDir, "consumer.ts");
    writeFileSync(
      consumerPath,
      ['import { foo, bar } from "./index";', "console.log(foo);", "bar();"].join("\n"),
    );

    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: {
        documentSymbols: vi.fn().mockResolvedValue(null),
        references: vi
          .fn()
          .mockImplementation(async (_file: string, position: { line: number }) => {
            if (position.line === 0) {
              return [
                {
                  uri: `file://${indexPath}`,
                  range: { start: { line: 0, character: 13 }, end: { line: 0, character: 16 } },
                },
                {
                  uri: `file://${consumerPath}`,
                  range: { start: { line: 1, character: 12 }, end: { line: 1, character: 15 } },
                },
              ];
            }

            return [
              {
                uri: `file://${indexPath}`,
                range: { start: { line: 1, character: 16 }, end: { line: 1, character: 19 } },
              },
              {
                uri: `file://${consumerPath}`,
                range: { start: { line: 2, character: 0 }, end: { line: 2, character: 3 } },
              },
            ];
          }),
        getOutstandingDiagnosticSummary: vi.fn().mockReturnValue([]),
      },
    });

    const result = await executeAction({ action: "affected", file: "index.ts" }, { cwd: tmpDir });

    expect(result.content).toContain("Affected: `index.ts`");
    expect(result.content).toContain("`foo`");
    expect(result.content).toContain("`bar`");
    expect(result.content).toContain("consumer.ts");
    expect(result.content).not.toContain("require `line` and `character`");
    expect(result.details?.type).toBe("affected");
  });

  it("returns an explicit unsupported message when file-level target discovery is unavailable", async () => {
    writeJson(tmpDir, "package.json", { name: "test-proj" });
    writeFileSync(path.join(tmpDir, "internal.py"), "def helper():\n    return 1\n");

    const result = await executeAction({ action: "callers", file: "internal.py" }, { cwd: tmpDir });

    expect(result.content).toContain("File-level semantic exploration is not available");
    expect(result.content).toContain("Provide `line` and `character`");
  });

  it("reports precise omitted counts for file-level affected results", async () => {
    writeJson(tmpDir, "package.json", { name: "test-proj" });
    const indexPath = path.join(tmpDir, "index.ts");
    writeFileSync(indexPath, "export const foo = 1;\n");
    const files = ["a.ts", "b.ts", "c.ts"];
    for (const file of files) {
      writeFileSync(path.join(tmpDir, file), 'import { foo } from "./index";\nconsole.log(foo);\n');
    }

    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: {
        documentSymbols: vi.fn().mockResolvedValue(null),
        references: vi.fn().mockResolvedValue([
          {
            uri: `file://${indexPath}`,
            range: { start: { line: 0, character: 13 }, end: { line: 0, character: 16 } },
          },
          ...files.map((file, index) => ({
            uri: `file://${path.join(tmpDir, file)}`,
            range: { start: { line: 1, character: index }, end: { line: 1, character: index + 3 } },
          })),
        ]),
        getOutstandingDiagnosticSummary: vi.fn().mockReturnValue([]),
      },
    });

    const result = await executeAction(
      { action: "affected", file: "index.ts", maxResults: 1 },
      { cwd: tmpDir },
    );

    expect(result.details?.type).toBe("affected");
    if (result.details?.type === "affected") {
      expect(result.details.data.omittedCount).toBe(2);
    }
  });
});
