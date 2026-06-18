import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionParams } from "../../helpers/execute-action.ts";
import { executeAction } from "../../helpers/execute-action.ts";
import { registerMockProvider } from "../../helpers/register-mock-runtime.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-graph-"));
  registerMockProvider(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeSource(fileName: string, source: string): void {
  writeFileSync(path.join(tmpDir, fileName), source, "utf-8");
}

describe("execute-graph (code_graph tool)", () => {
  describe("validation", () => {
    it("rejects graph without targetId, file, or symbol", async () => {
      const result = await executeAction({ action: "graph" } as unknown as ActionParams, {
        cwd: tmpDir,
      });
      expect(result.content).toContain("Error");
      expect(result.content).toContain("requires a target");
    });

    it("rejects non-existent file", async () => {
      const result = await executeAction(
        {
          action: "graph",
          file: "nonexistent.ts",
          line: 1,
          character: 1,
        } as unknown as ActionParams,
        { cwd: tmpDir },
      );
      expect(result.content).toContain("not found");
    });
  });

  describe("default relations (references)", () => {
    it("uses references relation by default", async () => {
      writeSource("test.ts", "export function foo() { return 1; }\n");
      registerMockProvider(tmpDir, {
        references: async () => [
          {
            uri: `file://${tmpDir}/test.ts`,
            range: {
              start: { line: 0, character: 17 },
              end: { line: 0, character: 20 },
            },
          },
        ],
      });

      const result = await executeAction(
        { action: "graph", file: "test.ts", line: 1, character: 18 } as unknown as ActionParams,
        { cwd: tmpDir },
      );

      expect(result.content).toContain("Graph of");
      expect(result.content).toContain("reference");
    });
  });

  describe("callees relation", () => {
    it("reports outgoing calls", async () => {
      writeSource("test.ts", "function foo() { bar(); }\n");
      registerMockProvider(tmpDir, {
        calleesAt: async (_file, _line, _char) => ({
          kind: "success",
          data: {
            enclosingScope: { name: "foo", startLine: 1, endLine: 1 },
            callees: [{ name: "bar", startLine: 1, endLine: 1 }],
          },
        }),
      });

      const result = await executeAction(
        {
          action: "graph",
          file: "test.ts",
          line: 1,
          character: 1,
          relations: ["callees"],
        } as unknown as ActionParams,
        { cwd: tmpDir },
      );

      expect(result.content).toContain("Graph of");
      expect(result.content).toContain("_File: `test.ts`_");
      expect(result.content).toContain("outgoing call");
      expect(result.content).toContain("`bar` (L1)");
      expect(result.content).not.toContain("L0");
      expect(result.content).toContain("callees");
    });
  });

  describe("multiple relations", () => {
    it("returns combined output for references and callees", async () => {
      writeSource("test.ts", "function foo() { bar(); }\n");
      registerMockProvider(tmpDir, {
        references: async () => [
          {
            uri: `file://${tmpDir}/test.ts`,
            range: {
              start: { line: 0, character: 17 },
              end: { line: 0, character: 20 },
            },
          },
        ],
        calleesAt: async (_file, _line, _char) => ({
          kind: "success",
          data: {
            enclosingScope: { name: "foo", startLine: 1, endLine: 1 },
            callees: [{ name: "bar", startLine: 1, endLine: 1 }],
          },
        }),
      });

      const result = await executeAction(
        {
          action: "graph",
          file: "test.ts",
          line: 1,
          character: 1,
          relations: ["references", "callees"],
        } as unknown as ActionParams,
        { cwd: tmpDir },
      );

      expect(result.content).toContain("Graph of");
      expect(result.content).toContain("references");
      expect(result.content).toContain("callees");
    });
  });

  describe("imports and exports relations", () => {
    it("reports file imports", async () => {
      writeSource(
        "test.ts",
        "import { foo } from './other';\nexport function bar() { return foo(); }\n",
      );
      registerMockProvider(tmpDir, {
        imports: async (_file) => ({
          kind: "success",
          data: [
            {
              moduleSpecifier: "./other",
              startLine: 1,
              startCharacter: 1,
              endLine: 1,
              endCharacter: 24,
            },
          ],
        }),
      });

      const result = await executeAction(
        {
          action: "graph",
          file: "test.ts",
          line: 1,
          character: 1,
          relations: ["imports"],
        } as unknown as ActionParams,
        { cwd: tmpDir },
      );

      expect(result.content).toContain("Graph of");
      expect(result.content).toContain("Imports");
      expect(result.content).toContain("./other");
      expect(result.content).toContain("import");
      expect(result.content).not.toContain("Not yet implemented");
    });

    it("reports file exports", async () => {
      writeSource("test.ts", "export function foo() { return 1; }\nexport const bar = 2;\n");
      registerMockProvider(tmpDir, {
        exports: async (_file) => ({
          kind: "success",
          data: [
            {
              name: "foo",
              kind: "function",
              startLine: 1,
              startCharacter: 1,
              endLine: 1,
              endCharacter: 32,
            },
            {
              name: "bar",
              kind: "const",
              startLine: 2,
              startCharacter: 1,
              endLine: 2,
              endCharacter: 18,
            },
          ],
        }),
      });

      const result = await executeAction(
        {
          action: "graph",
          file: "test.ts",
          line: 1,
          character: 1,
          relations: ["exports"],
        } as unknown as ActionParams,
        { cwd: tmpDir },
      );

      expect(result.content).toContain("Graph of");
      expect(result.content).toContain("Exports");
      expect(result.content).toContain("`foo`");
      expect(result.content).toContain("`bar`");
      expect(result.content).toContain("export");
      expect(result.content).not.toContain("Not yet implemented");
    });

    it("reports unavailable when imports provider returns non-success", async () => {
      writeSource("test.ts", "import { x } from './y';\n");
      // Default mock returns unsupported-language, so this tests the unavailable path
      const result = await executeAction(
        {
          action: "graph",
          file: "test.ts",
          line: 1,
          character: 1,
          relations: ["imports"],
        } as unknown as ActionParams,
        { cwd: tmpDir },
      );

      expect(result.content).toContain("Unavailable");
      expect(result.content).toContain("imports");
    });

    it("reports unavailable when exports provider returns non-success", async () => {
      writeSource("test.ts", "export const x = 1;\n");
      // Default mock returns unsupported-language, so this tests the unavailable path
      const result = await executeAction(
        {
          action: "graph",
          file: "test.ts",
          line: 1,
          character: 1,
          relations: ["exports"],
        } as unknown as ActionParams,
        { cwd: tmpDir },
      );

      expect(result.content).toContain("Unavailable");
      expect(result.content).toContain("exports");
    });

    it("resolves symbol to file for file-level relations", async () => {
      writeSource("test.ts", "export function foo() { return 1; }\nexport const bar = 2;\n");
      registerMockProvider(tmpDir, {
        workspaceSymbols: async () => [
          {
            name: "foo",
            kind: "function",
            file: `${tmpDir}/test.ts`,
            line: 1,
            character: 17,
          },
        ],
        exports: async (_file) => ({
          kind: "success",
          data: [
            {
              name: "foo",
              kind: "function",
              startLine: 1,
              startCharacter: 1,
              endLine: 1,
              endCharacter: 32,
            },
            {
              name: "bar",
              kind: "const",
              startLine: 2,
              startCharacter: 1,
              endLine: 2,
              endCharacter: 18,
            },
          ],
        }),
      });

      const result = await executeAction(
        {
          action: "graph",
          symbol: "foo",
          relations: ["exports"],
        } as unknown as ActionParams,
        { cwd: tmpDir },
      );

      expect(result.content).toContain("Graph of");
      expect(result.content).toContain("Exports");
      expect(result.content).toContain("`foo`");
      expect(result.content).toContain("`bar`");
      // Display name should be file path, not "symbol at ..."
      expect(result.content).not.toContain("symbol at");
    });

    it("rejects scope-only queries for file-level relations", async () => {
      const result = await executeAction(
        {
          action: "graph",
          path: "src/",
          relations: ["exports"],
        } as unknown as ActionParams,
        { cwd: tmpDir },
      );

      expect(result.content).toContain("Error");
      expect(result.content).toContain("require a `file` or `symbol`");
    });
  });

  describe("tests relation", () => {
    it("reports no companion test files when none exist", async () => {
      writeSource("test.ts", "export function foo() { return 1; }\n");

      const result = await executeAction(
        {
          action: "graph",
          file: "test.ts",
          line: 1,
          character: 1,
          relations: ["tests"],
        } as unknown as ActionParams,
        { cwd: tmpDir },
      );

      expect(result.content).toContain("no companion test files found");
    });

    it("finds companion test files via import analysis", async () => {
      writeSource("test.ts", "export function foo() { return 1; }\n");
      const { mkdirSync } = await import("node:fs");
      const testDir = path.join(tmpDir, "__tests__");
      mkdirSync(testDir, { recursive: true });
      writeSource("__tests__/test.test.ts", "import { foo } from '../test';\nvoid foo;\n");

      registerMockProvider(tmpDir, {
        references: async () => [
          {
            uri: `file://${tmpDir}/__tests__/test.test.ts`,
            range: {
              start: { line: 0, character: 17 },
              end: { line: 0, character: 20 },
            },
          },
        ],
      });

      const result = (await executeAction(
        {
          action: "graph",
          file: "test.ts",
          line: 1,
          character: 1,
          relations: ["tests"],
        } as unknown as ActionParams,
        { cwd: tmpDir },
      )) as {
        content: string;
        details?: {
          type: string;
          data?: {
            tests?: {
              provenance?: string;
              status?: string;
              files?: Array<{ file: string; labelStatus: string; labels: string[] }>;
            };
          };
        };
      };

      expect(result.content).toContain("tests");
      expect(result.content).toContain("__tests__/test.test.ts");
      expect(result.content).toContain("semantic+conventions");
      expect(result.details?.type).toBe("search");
      if (result.details?.type === "search") {
        expect(result.details.data?.tests?.provenance).toBe("semantic+conventions");
        expect(result.details.data?.tests?.status).toBe("found");
        expect(result.details.data?.tests?.files?.[0]?.file).toBe("__tests__/test.test.ts");
      }
    });

    it("finds package-layout test without semantic references (regression for audit failure)", async () => {
      // Package layout: source at src/tool/execute-graph.ts
      // Test at __tests__/unit/tool/execute-graph.test.ts
      // No semantic reference from test to source is established.
      const srcDir = path.join(tmpDir, "src", "tool");
      mkdirSync(srcDir, { recursive: true });
      writeSource("src/tool/execute-graph.ts", "export function executeGraph() { return 1; }\n");
      const testDir = path.join(tmpDir, "__tests__", "unit", "tool");
      mkdirSync(testDir, { recursive: true });
      writeSource(
        "__tests__/unit/tool/execute-graph.test.ts",
        "import { executeGraph } from '../../../src/tool/execute-graph';\n",
      );
      // Write package.json to mimic a package root (beforeEach doesn't write one for this file)
      writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "test-pkg" }));

      // Register mock provider with references returning empty
      registerMockProvider(tmpDir, {
        references: async () => [],
      });

      const result = (await executeAction(
        {
          action: "graph",
          file: "src/tool/execute-graph.ts",
          line: 1,
          character: 1,
          relations: ["tests"],
        } as unknown as ActionParams,
        { cwd: tmpDir },
      )) as {
        content: string;
        details?: { type: string; data?: { confidence?: string } };
      };

      expect(result.content).not.toContain("no companion test files found");
      expect(result.content).toContain("__tests__/unit/tool/execute-graph.test.ts");
      expect(result.details?.type).toBe("search");
      if (result.details?.type === "search") {
        expect(result.details.data?.confidence).toBe("structural");
      }
    });

    it("extracts obvious test-call labels when outline data is unavailable", async () => {
      const srcDir = path.join(tmpDir, "src", "tool");
      mkdirSync(srcDir, { recursive: true });
      writeSource("src/tool/execute-graph.ts", "export function executeGraph() { return 1; }\n");
      const testDir = path.join(tmpDir, "__tests__", "unit", "tool");
      mkdirSync(testDir, { recursive: true });
      writeSource(
        "__tests__/unit/tool/execute-graph.test.ts",
        [
          "import { executeGraph } from '../../../src/tool/execute-graph';",
          // biome-ignore lint/security/noSecrets: test fixture label is intentional
          "describe('executeGraph', () => {",
          "  it('returns 1', () => {",
          "    expect(executeGraph()).toBe(1);",
          "  });",
          "});",
        ].join("\n"),
      );
      writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "test-pkg" }));

      registerMockProvider(tmpDir, {
        references: async () => [],
      });

      const result = await executeAction(
        {
          action: "graph",
          file: "src/tool/execute-graph.ts",
          line: 1,
          character: 1,
          relations: ["tests"],
        } as unknown as ActionParams,
        { cwd: tmpDir },
      );

      // biome-ignore lint/security/noSecrets: assertion label is intentional
      const describeLabel = ["describe", "('executeGraph')"].join("");
      const itLabel = ["it", "('returns 1')"].join("");

      expect(result.content).toContain(describeLabel);
      expect(result.content).toContain(itLabel);
      expect(result.content).not.toContain("_(no recognized test blocks)_");
      expect(result.content.indexOf(itLabel)).toBeLessThan(result.content.indexOf(describeLabel));
    });

    it("renders no recognized test blocks instead of helper fallback names", async () => {
      const srcDir = path.join(tmpDir, "src", "tool");
      mkdirSync(srcDir, { recursive: true });
      writeSource("src/tool/execute-graph.ts", "export function executeGraph() { return 1; }\n");
      const testDir = path.join(tmpDir, "__tests__", "unit", "tool");
      mkdirSync(testDir, { recursive: true });
      writeSource(
        "__tests__/unit/tool/execute-graph.test.ts",
        "import { executeGraph } from '../../../src/tool/execute-graph';\n",
      );
      writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "test-pkg" }));

      const outlineSpy = vi.fn(async () => ({
        kind: "success" as const,
        data: [
          {
            name: "tmpDir",
            kind: "const",
            startLine: 1,
            startCharacter: 1,
            endLine: 1,
            endCharacter: 10,
          },
          {
            name: "writeSource",
            kind: "function",
            startLine: 2,
            startCharacter: 1,
            endLine: 2,
            endCharacter: 12,
          },
          {
            name: "result",
            kind: "const",
            startLine: 3,
            startCharacter: 1,
            endLine: 3,
            endCharacter: 7,
          },
        ],
      }));

      registerMockProvider(tmpDir, {
        references: async () => [],
        outline: outlineSpy,
      });

      const result = await executeAction(
        {
          action: "graph",
          file: "src/tool/execute-graph.ts",
          line: 1,
          character: 1,
          relations: ["tests"],
        } as unknown as ActionParams,
        { cwd: tmpDir },
      );

      expect(result.content).toContain("__tests__/unit/tool/execute-graph.test.ts");
      expect(result.content).toContain("_(no recognized test blocks)_");
      expect(result.content).toContain("conventions-only");
      expect(result.content).not.toContain("no LSP/TS");
      expect(result.content).not.toContain("tmpDir");
      expect(result.content).not.toContain("writeSource");
      expect(result.content).not.toContain("`result`");
    });

    it("discovers named-different tool test via conventions-only", async () => {
      // Source src/tool/execute-find.ts, test __tests__/unit/code-find-tool.test.ts
      mkdirSync(path.join(tmpDir, "src", "tool"), { recursive: true });
      writeSource("src/tool/execute-find.ts", "export function executeFind() { return 1; }\n");
      mkdirSync(path.join(tmpDir, "__tests__", "unit"), { recursive: true });
      writeSource(
        "__tests__/unit/code-find-tool.test.ts",
        "import { executeFind } from '../../src/tool/execute-find';\n",
      );
      writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "test-pkg" }));

      registerMockProvider(tmpDir, {
        references: async () => [],
      });

      const result = await executeAction(
        {
          action: "graph",
          file: "src/tool/execute-find.ts",
          line: 1,
          character: 1,
          relations: ["tests"],
        } as unknown as ActionParams,
        { cwd: tmpDir },
      );

      // After bounded discovery, this should not say "no companion test files found"
      // and should list __tests__/unit/code-find-tool.test.ts.
      expect(result.content).not.toContain("no companion test files found");
      expect(result.content).toContain("__tests__/unit/code-find-tool.test.ts");
    });

    it("finds test via import analysis when naming conventions differ", async () => {
      // source file
      const { mkdirSync } = await import("node:fs");
      const srcDir = path.join(tmpDir, "src", "tool");
      mkdirSync(srcDir, { recursive: true });
      writeSource("src/tool/execute-find.ts", "export function executeFind() { return 1; }\n");

      // test file with a different name that imports the source
      const testDir = path.join(tmpDir, "__tests__");
      mkdirSync(testDir, { recursive: true });
      writeSource(
        "__tests__/code-find-tool.test.ts",
        "import { executeFind } from '../src/tool/execute-find';\nvoid executeFind;\n",
      );

      registerMockProvider(tmpDir, {
        references: async () => [
          {
            uri: `file://${tmpDir}/__tests__/code-find-tool.test.ts`,
            range: {
              start: { line: 0, character: 17 },
              end: { line: 0, character: 28 },
            },
          },
        ],
      });

      const result = (await executeAction(
        {
          action: "graph",
          file: "src/tool/execute-find.ts",
          line: 1,
          character: 1,
          relations: ["tests"],
        } as unknown as ActionParams,
        { cwd: tmpDir },
      )) as {
        content: string;
        details?: {
          type: string;
          data?: {
            tests?: {
              provenance?: string;
              files?: Array<{ file: string }>;
            };
          };
        };
      };

      expect(result.content).toContain("tests");
      expect(result.content).toContain("__tests__/code-find-tool.test.ts");
      expect(result.content).toContain("semantic+conventions");
      expect(result.details?.type).toBe("search");
      if (result.details?.type === "search") {
        expect(result.details.data?.tests?.provenance).toBe("semantic+conventions");
        expect(result.details.data?.tests?.files?.[0]?.file).toBe(
          "__tests__/code-find-tool.test.ts",
        );
      }
    });
  });

  describe("reference line deduplication", () => {
    it("deduplicates same-line references in grouped output", async () => {
      // Two semantic references on the same line should render as one line number.
      writeSource("test.ts", "export function foo() { return 1; }\n");

      registerMockProvider(tmpDir, {
        references: async () => [
          {
            uri: `file://${tmpDir}/test.ts`,
            range: {
              start: { line: 0, character: 17 },
              end: { line: 0, character: 20 },
            },
          },
          {
            uri: `file://${tmpDir}/test.ts`,
            range: {
              start: { line: 0, character: 21 },
              end: { line: 0, character: 24 },
            },
          },
        ],
      });

      const result = await executeAction(
        {
          action: "graph",
          file: "test.ts",
          line: 1,
          character: 18,
        } as unknown as ActionParams,
        { cwd: tmpDir },
      );

      // Same line should appear once, not "L1, L1"
      expect(result.content).not.toContain("L1, L1");
      expect(result.content).toContain("L1");
      const l1Matches = result.content.match(/\bL1\b/g);
      expect(l1Matches?.length).toBe(1);
    });

    it("still compacts consecutive lines alongside deduplication", async () => {
      // Three references: two on line 9, one on line 10 → "L9-L10"
      writeSource("test.ts", "export function bar() { return 2; }\n");

      registerMockProvider(tmpDir, {
        references: async () => [
          {
            uri: `file://${tmpDir}/test.ts`,
            range: {
              start: { line: 8, character: 3 },
              end: { line: 8, character: 6 },
            },
          },
          {
            uri: `file://${tmpDir}/test.ts`,
            range: {
              start: { line: 8, character: 17 },
              end: { line: 8, character: 20 },
            },
          },
          {
            uri: `file://${tmpDir}/test.ts`,
            range: {
              start: { line: 9, character: 5 },
              end: { line: 9, character: 8 },
            },
          },
        ],
      });

      const result = await executeAction(
        {
          action: "graph",
          file: "test.ts",
          line: 1,
          character: 18,
        } as unknown as ActionParams,
        { cwd: tmpDir },
      );

      // Should be "L9-L10", not "L9, L9, L10"
      expect(result.content).not.toContain("L9, L9");
      expect(result.content).toContain("L9-L10");
    });
  });
});
