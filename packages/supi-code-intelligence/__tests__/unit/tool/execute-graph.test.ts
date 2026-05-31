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

  describe("not-implemented relations", () => {
    it("returns not-implemented note for imports", async () => {
      writeSource("test.ts", "export function foo() { return 1; }\n");

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

      expect(result.content).toContain("Not yet implemented");
      expect(result.content).toContain("imports");
    });

    it("returns not-implemented note for exports", async () => {
      writeSource("test.ts", "export function foo() { return 1; }\n");

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

      expect(result.content).toContain("Not yet implemented");
      expect(result.content).toContain("exports");
    });

    it("returns not-implemented note for tests", async () => {
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

      expect(result.content).toContain("Not yet implemented");
      expect(result.content).toContain("tests");
    });
  });
});
