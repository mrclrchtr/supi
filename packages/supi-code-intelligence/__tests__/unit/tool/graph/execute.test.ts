import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { completedCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeGraphTool } from "../../../../src/tool/graph/execute.ts";
import { executeAction, makeTestCtx } from "../../../helpers/execute-action.ts";
import { registerMockProvider } from "../../../helpers/register-mock-runtime.ts";

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

describe("code_graph workflow", () => {
  it("uses semantic references by default and discloses truncation", async () => {
    writeSource("test.ts", "export function foo() { return 1; }\n");
    writeSource("consumer-a.ts", "foo();\n");
    writeSource("consumer-b.ts", "foo();\n");
    registerMockProvider(tmpDir, {
      references: async () =>
        completedCodeQuery([
          {
            uri: `file://${tmpDir}/consumer-a.ts`,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
          },
          {
            uri: `file://${tmpDir}/consumer-b.ts`,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
          },
        ]),
    });

    const result = await executeGraphTool(
      {
        target: { anchor: { file: "test.ts", line: 1, character: 17 } },
        maxResults: 1,
      },
      makeTestCtx(tmpDir),
    );

    expect(result.content).toContain("Graph of");
    expect(result.content).toContain("consumer-a.ts");
    expect(result.content).not.toContain("consumer-b.ts");
    expect(result.content).toContain("showing 1 of 2; 1 omitted");
    expect(result.details?.type).toBe("search");
    if (result.details?.type !== "search") return;
    expect(result.details.data.evidenceLists).toContainEqual({
      key: "references.locations",
      totalCount: 2,
      shownCount: 1,
      omittedCount: 1,
      partialReason: null,
    });
  });

  it("labels callees as structural source-shape evidence", async () => {
    writeSource("test.ts", "function foo() { bar(); }\n");
    registerMockProvider(tmpDir, {
      calleesAt: async () => ({
        kind: "success",
        data: {
          enclosingScope: { name: "foo", startLine: 1, endLine: 1 },
          callees: [{ name: "bar", startLine: 1, endLine: 1 }],
          depth: "direct" as const,
        },
      }),
    });

    const result = await executeGraphTool(
      {
        target: { anchor: { file: "test.ts", line: 1, character: 10 } },
        relations: ["callees"],
      },
      makeTestCtx(tmpDir),
    );

    expect(result.content).toContain("Direct structural calls from `foo`");
    expect(result.content).toContain("Structural only");
    expect(result.content).toContain("`bar` (L1)");
  });

  it("reports provider-backed implementations", async () => {
    writeSource("test.ts", "interface Service { run(): void }\n");
    writeSource("impl.ts", "class A implements Service { run() {} }\n");
    registerMockProvider(tmpDir, {
      implementation: async () =>
        completedCodeQuery([
          {
            uri: `file://${tmpDir}/impl.ts`,
            range: { start: { line: 0, character: 6 }, end: { line: 0, character: 7 } },
          },
        ]),
    });

    const result = await executeGraphTool(
      {
        target: { anchor: { file: "test.ts", line: 1, character: 11 } },
        relations: ["implements"],
      },
      makeTestCtx(tmpDir),
    );

    expect(result.content).toContain("Implementations of `Service`");
    expect(result.content).toContain("impl.ts");
  });

  it("expands all to exactly references, callees, and implements", async () => {
    writeSource("test.ts", "function foo() { bar(); }\n");
    registerMockProvider(tmpDir, {
      references: async () => completedCodeQuery([]),
      implementation: async () => completedCodeQuery([]),
      calleesAt: async () => ({
        kind: "success",
        data: {
          enclosingScope: { name: "foo", startLine: 1, endLine: 1 },
          callees: [],
          depth: "direct" as const,
        },
      }),
    });

    const result = await executeGraphTool(
      {
        target: { anchor: { file: "test.ts", line: 1, character: 10 } },
        relations: ["all"],
      },
      makeTestCtx(tmpDir),
    );

    expect(result.content).toContain("references");
    expect(result.content).toContain("callees");
    expect(result.content).toContain("implements");
    expect(result.content).not.toContain("imports");
    expect(result.content).not.toContain("exports");
    expect(result.content).not.toContain("Tests");
  });

  it("rejects all combined with a named relation", async () => {
    writeSource("test.ts", "function foo() {}\n");
    const result = await executeAction(
      {
        action: "graph",
        file: "test.ts",
        line: 1,
        character: 10,
        relations: ["all", "references"],
      },
      { cwd: tmpDir },
    );
    expect(result.content).toContain("cannot be combined");
  });
});
