import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { completedCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeGraphTool } from "../../../../src/tool/code_graph/execute.ts";
import { makeTestCtx } from "../../../helpers/execute-action.ts";
import { clearMockRuntime, registerMockProvider } from "../../../helpers/register-mock-runtime.ts";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "graph-output-"));
  writeFileSync(path.join(cwd, "test.ts"), "function foo() {\n  bar(); bar();\n  bar();\n}\n");
  writeFileSync(path.join(cwd, "consumer.ts"), "foo(); foo();\n");
  registerMockProvider(cwd, {
    references: async () =>
      completedCodeQuery([
        location("consumer.ts", 0),
        location("consumer.ts", 7),
        location("consumer.ts", 0),
      ]),
    implementation: async () => completedCodeQuery([]),
    calleesAt: async () => ({
      kind: "success",
      data: {
        enclosingScope: { name: "foo", startLine: 1, endLine: 4 },
        callees: [
          { name: "bar", startLine: 2, startCharacter: 3 },
          { name: "bar", startLine: 2, startCharacter: 10 },
          { name: "bar", startLine: 3, startCharacter: 3 },
        ],
        depth: "direct",
      },
    }),
  });
});

afterEach(() => {
  clearMockRuntime();
  rmSync(cwd, { recursive: true, force: true });
});

function location(file: string, character: number) {
  return {
    uri: `file://${path.join(cwd, file)}`,
    range: { start: { line: 0, character }, end: { line: 0, character: character + 3 } },
  };
}

function execute(maxResults?: number) {
  return executeGraphTool(
    {
      target: { anchor: { file: "test.ts", line: 1, character: 10 } },
      relations: ["all"],
      maxResults,
    },
    makeTestCtx(cwd),
  );
}

describe("code_graph agent output", () => {
  it("bounds call sites before grouping repeated names", async () => {
    const { content } = await execute(2);
    expect(content).toContain("2 of 3 call sites shown; 1 omitted");
    expect(content.match(/`bar`/g)).toHaveLength(1);
    expect(content).toContain("L2:3, L2:10");
    expect(content).not.toContain("L3:3");
  });

  it("bounds long call labels and quotes embedded backticks without losing coordinates", async () => {
    registerMockProvider(cwd, {
      calleesAt: async () => ({
        kind: "success",
        data: {
          enclosingScope: { name: "foo", startLine: 1, endLine: 4 },
          callees: [
            { name: "registry[`key`].run", startLine: 2, startCharacter: 3 },
            { name: `factory(${"argument".repeat(200)}).run`, startLine: 3, startCharacter: 3 },
          ],
          depth: "direct",
        },
      }),
    });
    const result = await execute();
    expect(result.content).toContain("``registry[`key`].run`` — L2:3");
    expect(result.content).toContain("L3:3");
    expect(result.content).toContain("…");
    expect(result.content).not.toContain("argument".repeat(20));
    expect(result.content.length).toBeLessThan(1200);
    const callRows = result.details?.displaySections?.find(
      (section) => section.key === "graph.callees",
    )?.lines;
    expect(callRows?.[1]).toContain("test.ts:L3:3");
  });

  it("merges overlapping read suggestions and includes implementation guidance", async () => {
    registerMockProvider(cwd, {
      references: async () =>
        completedCodeQuery([location("consumer.ts", 0), location("consumer.ts", 7)]),
      implementation: async () => completedCodeQuery([location("implementation.ts", 6)]),
    });
    const { content } = await execute();
    const guidance = content.split("## Read Next")[1];
    expect(guidance?.match(/`consumer.ts`/g)).toHaveLength(1);
    expect(guidance).toContain("implementation.ts");
    expect(guidance).toContain("inspect an implementation site");
  });

  it("reports each relation once and groups repeated labels without removing call sites", async () => {
    const { content } = await execute();
    expect(content.match(/`foo`/g)).toHaveLength(1);
    expect(content.match(/^## references/gm)).toHaveLength(1);
    expect(content.match(/^## callees/gm)).toHaveLength(1);
    expect(content.match(/^## implements/gm)).toHaveLength(1);
    expect(content.match(/3 call sites/g)).toHaveLength(1);
    expect(content.match(/`bar`/g)).toHaveLength(1);
    expect(content).toContain("L2:3, L2:10, L3:3");
    expect(content).toContain("L1:1, L1:8");
    expect(content).not.toContain("L1:1, L1:1");
  });
});
