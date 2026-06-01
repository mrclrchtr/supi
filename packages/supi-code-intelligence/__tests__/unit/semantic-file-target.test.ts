import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeImpactTool } from "../../src/tool/execute-impact.ts";
import { executeAction } from "../helpers/execute-action.ts";
import { registerMockProvider } from "../helpers/register-mock-runtime.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-file-target-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeJson(dir: string, file: string, data: unknown) {
  writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2));
}

describe("file-level semantic targets", () => {
  it("expands file-only references requests across exported symbols when semantic refs are available", async () => {
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

    registerMockProvider(tmpDir, {
      documentSymbols: async () => null,
      exports: async (_file) => ({
        kind: "success",
        data: [
          {
            name: "foo",
            kind: "const",
            startLine: 1,
            startCharacter: 14,
            endLine: 1,
            endCharacter: 17,
          },
          {
            name: "bar",
            kind: "function",
            startLine: 2,
            startCharacter: 16,
            endLine: 4,
            endCharacter: 1,
          },
        ],
      }),
      references: async (_file, position) => {
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
      },
    });

    const result = await executeAction(
      { action: "graph", file: "index.ts", line: 1, character: 14 },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("Graph of");
    expect(result.content).toContain("index.ts");
    expect(result.content).toContain("consumer.ts");
    expect(result.content).not.toContain("require `line`");
    expect(result.details?.type).toBe("search");
  });

  it("rejects file-only graph requests with a clear error", async () => {
    writeJson(tmpDir, "package.json", { name: "test-proj" });
    writeFileSync(path.join(tmpDir, "index.ts"), "export const foo = 1;\n");

    registerMockProvider(tmpDir, {
      exports: async (_file) => ({
        kind: "success",
        data: [
          {
            name: "foo",
            kind: "const",
            startLine: 1,
            startCharacter: 14,
            endLine: 1,
            endCharacter: 17,
          },
        ],
      }),
    });

    const result = await executeAction({ action: "graph", file: "index.ts" }, { cwd: tmpDir });

    expect(result.content).toContain("requires a precise target");
  });

  it("runs impact analysis from an anchored target when semantic refs are available", async () => {
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

    registerMockProvider(tmpDir, {
      exports: async (_file) => ({
        kind: "success",
        data: [
          {
            name: "foo",
            kind: "const",
            startLine: 1,
            startCharacter: 14,
            endLine: 1,
            endCharacter: 17,
          },
          {
            name: "bar",
            kind: "function",
            startLine: 2,
            startCharacter: 16,
            endLine: 4,
            endCharacter: 1,
          },
        ],
      }),
      references: async (_file, position) => {
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
      },
    });

    const result = await executeImpactTool(
      { file: "index.ts", line: 1, character: 14 },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("Impact");
    expect(result.content).toContain("consumer.ts");
    expect(result.details?.type).toBe("impact");
  });

  it("returns an explicit unsupported message when file-level target discovery is unavailable", async () => {
    writeJson(tmpDir, "package.json", { name: "test-proj" });
    writeFileSync(path.join(tmpDir, "internal.py"), "def helper():\n    return 1\n");

    // Register a mock provider that can't do anything with .py files
    registerMockProvider(tmpDir);
    const result = await executeAction({ action: "graph", file: "internal.py" }, { cwd: tmpDir });

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

    registerMockProvider(tmpDir, {
      exports: async (_file) => ({
        kind: "success",
        data: [
          {
            name: "foo",
            kind: "const",
            startLine: 1,
            startCharacter: 14,
            endLine: 1,
            endCharacter: 17,
          },
        ],
      }),
      references: async () => {
        const refs = [
          {
            uri: `file://${indexPath}`,
            range: { start: { line: 0, character: 13 }, end: { line: 0, character: 16 } },
          },
          ...files.map((file, index) => ({
            uri: `file://${path.join(tmpDir, file)}`,
            range: { start: { line: 1, character: index }, end: { line: 1, character: index + 3 } },
          })),
        ];
        return refs;
      },
    });

    const result = await executeImpactTool(
      { file: "index.ts", line: 1, character: 14, maxResults: 1 },
      { cwd: tmpDir },
    );

    expect(result.details?.type).toBe("impact");
    if (result.details?.type === "impact") {
      expect(result.details.data.omittedCount).toBe(2);
    }
  });
});
