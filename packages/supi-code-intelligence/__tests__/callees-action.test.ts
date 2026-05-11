import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ActionParams } from "../src/tool-actions.ts";
import { executeAction } from "../src/tool-actions.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-callees-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeSource(fileName: string, source: string): void {
  writeFileSync(path.join(tmpDir, fileName), source, "utf-8");
}

describe("code_intel callees action", () => {
  it("rejects callees without file", async () => {
    const result = await executeAction({ action: "callees" } as unknown as ActionParams, {
      cwd: tmpDir,
    });
    expect(result.content).toContain("Error");
    expect(result.content).toContain("anchored coordinates");
  });

  it("rejects callees with file but no line/character", async () => {
    writeSource("test.ts", "export const x = 1;");
    const result = await executeAction(
      { action: "callees", file: "test.ts" } as unknown as ActionParams,
      { cwd: tmpDir },
    );
    expect(result.content).toContain("Error");
    expect(result.content).toContain("line");
  });

  it("rejects non-existent file", async () => {
    const result = await executeAction(
      {
        action: "callees",
        file: "nonexistent.ts",
        line: 1,
        character: 1,
      } as unknown as ActionParams,
      { cwd: tmpDir },
    );
    expect(result.content).toContain("not found");
  });

  it("returns callees for a TypeScript function", async () => {
    writeSource(
      "test.ts",
      [
        "export function myFunction() {",
        "  doSomething();",
        // biome-ignore lint/security/noSecrets: test fixture code
        "  doSomethingElse(42);",
        "  return 0;",
        "}",
      ].join("\n"),
    );

    const result = await executeAction(
      { action: "callees", file: "test.ts", line: 1, character: 22 } as unknown as ActionParams,
      { cwd: tmpDir },
    );

    expect(result.content).toContain("Callees");
    expect(result.content).toContain("myFunction");
    expect(result.content).toContain("doSomething");
    expect(result.content).toContain("doSomethingElse");
  });

  it("returns callees for a Python function", async () => {
    writeSource(
      "test.py",
      ["def my_function():", "    process_data()", "    save_result(42)"].join("\n"),
    );

    const result = await executeAction(
      { action: "callees", file: "test.py", line: 1, character: 10 } as unknown as ActionParams,
      { cwd: tmpDir },
    );

    expect(result.content).toContain("Callees");
    expect(result.content).toContain("process_data");
    expect(result.content).toContain("save_result");
  });

  it("returns no-callees message for HTML files", async () => {
    writeSource("test.html", "<html><body><p>hello</p></body></html>");

    const result = await executeAction(
      { action: "callees", file: "test.html", line: 1, character: 5 } as unknown as ActionParams,
      { cwd: tmpDir },
    );

    expect(result.content).toContain("No callee data");
  });
});
