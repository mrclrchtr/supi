import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

      expect(result.content).toContain("tests");
      expect(result.content).toContain("__tests__/test.test.ts");
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

      expect(result.content).toContain("tests");
      expect(result.content).toContain("__tests__/code-find-tool.test.ts");
    });
  });
});
