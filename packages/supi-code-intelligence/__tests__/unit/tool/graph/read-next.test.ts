import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { completedCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeGraphTool } from "../../../../src/tool/code_graph/execute.ts";
import { sessionCache } from "../../../helpers/execute-action.ts";
import { clearMockRuntime, registerMockProvider } from "../../../helpers/register-mock-runtime.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-graph-read-next-"));
  writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "graph-ws" }));
});

afterEach(() => {
  clearMockRuntime();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("code_graph read-next guidance", () => {
  it("reads selected references in other files before revisiting the target file", async () => {
    writeFileSync(path.join(tmpDir, "a.ts"), `function foo() {}\n${"foo();\n".repeat(200)}`);
    writeFileSync(path.join(tmpDir, "b.ts"), "foo();\n");
    writeFileSync(path.join(tmpDir, "c.ts"), "foo();\n");
    registerMockProvider(tmpDir, {
      references: async () =>
        completedCodeQuery(
          [
            { file: "a.ts", line: 99 },
            { file: "a.ts", line: 149 },
            { file: "a.ts", line: 199 },
            { file: "b.ts", line: 0 },
            { file: "c.ts", line: 0 },
          ].map(({ file, line }) => ({
            uri: `file://${path.join(tmpDir, file)}`,
            range: { start: { line, character: 0 }, end: { line, character: 3 } },
          })),
        ),
    });

    const result = await executeGraphTool(
      {
        target: { anchor: { file: "a.ts", line: 1, character: 10 } },
        relations: ["references"],
        maxResults: 4,
      },
      { cwd: tmpDir, session: sessionCache.getOrCreate(tmpDir) },
    );
    const expectedReads = [
      { file: "a.ts", startLine: 1, endLine: 41 },
      { file: "b.ts", startLine: 1, endLine: 41 },
      { file: "c.ts", startLine: 1, endLine: 41 },
    ];
    expect(result.structuredContent).toMatchObject({ readNext: expectedReads });
    expect(result.details?.data).toMatchObject({ readNext: expectedReads });
    const guidance = result.content.split("## Read Next")[1];
    expect(guidance?.match(/`a.ts`/g)).toHaveLength(1);
    expect(guidance).toContain("`b.ts` L1–L41");
    expect(guidance).toContain("`c.ts` L1–L41");

    const capped = await executeGraphTool(
      {
        target: { anchor: { file: "a.ts", line: 1, character: 10 } },
        relations: ["references"],
        maxResults: 1,
      },
      { cwd: tmpDir, session: sessionCache.getOrCreate(tmpDir) },
    );
    expect(capped.structuredContent).toMatchObject({
      readNext: [
        { file: "a.ts", startLine: 1, endLine: 41 },
        { file: "a.ts", startLine: 95, endLine: 140 },
      ],
    });
  });

  it("uses neutral guidance when a reference range extends the enclosing scope", async () => {
    writeFileSync(path.join(tmpDir, "index.ts"), "function foo() {\n  bar();\n}\n\nfoo();\n");
    registerMockProvider(tmpDir, {
      references: async () =>
        completedCodeQuery([
          {
            uri: `file://${path.join(tmpDir, "index.ts")}`,
            range: { start: { line: 4, character: 0 }, end: { line: 4, character: 3 } },
          },
        ]),
      calleesAt: async () => ({
        kind: "success",
        data: {
          enclosingScope: { name: "foo", startLine: 1, endLine: 3 },
          callees: [],
          depth: "direct",
        },
      }),
    });
    const result = await executeGraphTool(
      {
        target: { anchor: { file: "index.ts", line: 1, character: 10 } },
        relations: ["references", "callees"],
      },
      { cwd: tmpDir, session: sessionCache.getOrCreate(tmpDir) },
    );
    const guidance = result.content.split("## Read Next")[1];
    expect(guidance).toContain("L1–L45 — inspect related source ranges");
    expect(guidance).not.toContain("inspect the enclosing scope");
    expect(guidance?.match(/`index.ts`/g)).toHaveLength(1);
  });

  it("renders source ranges for the resolved target and relation sites", async () => {
    writeFileSync(
      path.join(tmpDir, "index.ts"),
      "export function foo() { bar(); }\nfunction bar() {}\n",
    );
    writeFileSync(path.join(tmpDir, "consumer.ts"), "import { foo } from './index';\nfoo();\n");

    registerMockProvider(tmpDir, {
      references: async () =>
        completedCodeQuery([
          {
            uri: `file://${path.join(tmpDir, "consumer.ts")}`,
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 3 } },
          },
        ]),
      calleesAt: async () => ({
        kind: "success" as const,
        data: {
          enclosingScope: { name: "foo", startLine: 1, endLine: 1 },
          callees: [{ name: "bar", startLine: 1, startCharacter: 25 }],
          depth: "direct" as const,
        },
      }),
    });

    const result = await executeGraphTool(
      {
        target: { anchor: { file: "index.ts", line: 1, character: 17 } },
        relations: ["references", "callees"],
      },
      { cwd: tmpDir, session: sessionCache.getOrCreate(tmpDir) },
    );

    expect(result.content).toContain("## Read Next");
    expect(result.content).toContain("`index.ts` L1");
    expect(result.content).toContain("inspect the enclosing scope");
    expect(result.content).not.toContain("inspect the resolved target before editing");
    expect(result.content.match(/`index.ts` L1/g)).toHaveLength(1);
    expect(result.content).toContain("`consumer.ts` L1–L42");
    expect(result.content).toContain("inspect a reference site");
    expect(result.content).not.toContain("`read` offset");
    expect(result.details?.data).toMatchObject({
      readNext: expect.arrayContaining([
        expect.objectContaining({ file: "consumer.ts", startLine: 1, endLine: 42 }),
      ]),
    });
  });
});
