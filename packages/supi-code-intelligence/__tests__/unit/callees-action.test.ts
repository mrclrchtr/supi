import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ActionParams } from "../helpers/execute-action.ts";
import { executeAction } from "../helpers/execute-action.ts";
import { registerMockProvider } from "../helpers/register-mock-runtime.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-graph-callees-"));
  registerMockProvider(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeSource(fileName: string, source: string): void {
  writeFileSync(path.join(tmpDir, fileName), source, "utf-8");
}

describe("code_graph callees relation", () => {
  it("rejects graph without file and without symbol", async () => {
    const result = await executeAction(
      { action: "graph", relations: ["callees"] } as unknown as ActionParams,
      { cwd: tmpDir },
    );
    expect(result.content).toContain("Error");
    expect(result.content).toContain("requires a target");
  });

  it("rejects graph with file but no line/character", async () => {
    writeSource("test.ts", "export const x = 1;");
    const result = await executeAction(
      { action: "graph", file: "test.ts", relations: ["callees"] } as unknown as ActionParams,
      { cwd: tmpDir },
    );
    expect(result.content).toContain("Error");
    expect(result.content).toContain("line");
  });

  it("rejects non-existent file", async () => {
    const result = await executeAction(
      {
        action: "graph",
        file: "nonexistent.ts",
        line: 1,
        character: 1,
        relations: ["callees"],
      } as unknown as ActionParams,
      { cwd: tmpDir },
    );
    expect(result.content).toContain("not found");
  });

  it("reports outgoing calls with structural confidence", async () => {
    writeSource("test.ts", "function foo() { bar(); baz(); }\n");
    registerMockProvider(tmpDir, {
      calleesAt: async (_file, _line, _char) => ({
        kind: "success",
        data: {
          enclosingScope: { name: "foo", startLine: 1, endLine: 1 },
          callees: [
            { name: "bar", startLine: 1, endLine: 1 },
            { name: "baz", startLine: 1, endLine: 1 },
          ],
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
    expect(result.content).toContain("outgoing call");
  });

  it("labels callee results as outgoing calls not callers or callees", async () => {
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
    expect(result.content).toContain("outgoing call");
  });
});
