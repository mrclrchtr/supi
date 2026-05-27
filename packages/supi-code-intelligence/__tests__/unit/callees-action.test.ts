import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ActionParams } from "../helpers/execute-action.ts";
import { executeAction } from "../helpers/execute-action.ts";
import { registerMockProvider } from "../helpers/register-mock-runtime.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-callees-"));
  registerMockProvider(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeSource(fileName: string, source: string): void {
  writeFileSync(path.join(tmpDir, fileName), source, "utf-8");
}

describe("code_calls behavior", () => {
  it("rejects calls without file", async () => {
    const result = await executeAction({ action: "calls" } as unknown as ActionParams, {
      cwd: tmpDir,
    });
    expect(result.content).toContain("Error");
    expect(result.content).toContain("requires a file");
  });

  it("rejects calls with file but no line/character", async () => {
    writeSource("test.ts", "export const x = 1;");
    const result = await executeAction(
      { action: "calls", file: "test.ts" } as unknown as ActionParams,
      { cwd: tmpDir },
    );
    expect(result.content).toContain("Error");
    expect(result.content).toContain("line");
  });

  it("rejects non-existent file", async () => {
    const result = await executeAction(
      {
        action: "calls",
        file: "nonexistent.ts",
        line: 1,
        character: 1,
      } as unknown as ActionParams,
      { cwd: tmpDir },
    );
    expect(result.content).toContain("not found");
  });

  it("returns unavailable for HTML files", async () => {
    writeSource("test.html", "<html><body><p>hello</p></body></html>");

    const result = await executeAction(
      { action: "calls", file: "test.html", line: 1, character: 5 } as unknown as ActionParams,
      { cwd: tmpDir },
    );

    expect(result.content).toContain("outgoing call");
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
      { action: "calls", file: "test.ts", line: 1, character: 1 } as unknown as ActionParams,
      { cwd: tmpDir },
    );
    expect(result.content).toContain("outgoing call");
    expect(result.details?.type).toBe("search");
    if (result.details?.type === "search") {
      expect(result.details.data.confidence).toBe("structural");
      expect(result.details.data.candidateCount).toBe(2);
    }
  });

  it("labels results as outgoing calls not callers or callees", async () => {
    // Note: this test will fail (RED) until Task 4 implements the new rendering
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
      { action: "calls", file: "test.ts", line: 1, character: 1 } as unknown as ActionParams,
      { cwd: tmpDir },
    );
    expect(result.content).toContain("outgoing call");
    expect(result.content).not.toContain("callee");
  });
});
