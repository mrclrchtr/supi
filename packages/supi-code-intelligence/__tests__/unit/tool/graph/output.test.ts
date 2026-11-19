import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { completedCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeGraphTool } from "../../../../src/tool/code_graph/execute.ts";
import type { structuredGraphResult } from "../../../../src/tool/code_graph/structured.ts";
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

function location(file: string, character: number, line = 0) {
  return {
    uri: `file://${path.join(cwd, file)}`,
    range: { start: { line, character }, end: { line, character: character + 3 } },
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
  it("distributes capped references across files consistently in all result representations", async () => {
    writeFileSync(path.join(cwd, "a.ts"), "foo();\n".repeat(40));
    writeFileSync(path.join(cwd, "b.ts"), "foo();\n");
    writeFileSync(path.join(cwd, "c.ts"), "foo();\n");
    registerMockProvider(cwd, {
      references: async () =>
        completedCodeQuery([
          ...Array.from({ length: 40 }, (_, line) => location("a.ts", 0, line)),
          location("b.ts", 0),
          location("c.ts", 0),
        ]),
    });

    const result = await execute(5);
    expect(result.structuredContent).toMatchObject({
      kind: "completed",
      sections: expect.arrayContaining([
        expect.objectContaining({
          relation: "references",
          items: [
            { file: "a.ts", line: 1, character: 1, name: "foo", text: "foo();" },
            { file: "a.ts", line: 2, character: 1, name: "foo", text: "foo();" },
            { file: "a.ts", line: 3, character: 1, name: "foo", text: "foo();" },
            { file: "b.ts", line: 1, character: 1, name: "foo", text: "foo();" },
            { file: "c.ts", line: 1, character: 1, name: "foo", text: "foo();" },
          ],
          evidence: {
            key: "references.locations",
            completeness: "capped",
            totalCount: 42,
            shownCount: 5,
            omittedCount: 37,
            partialReason: null,
          },
        }),
      ]),
    });
    expect(result.content).toContain(
      "5 of 42 locations; 37 omitted — Selection: one site per file per round.",
    );
    expect(result.content).toContain(
      "- `a.ts`\n  - L1:1 — `foo();`\n  - L2:1 — `foo();`\n  - L3:1 — `foo();`\n",
    );
    expect(result.content).toContain(
      "- `b.ts`\n  - L1:1 — `foo();`\n- `c.ts`\n  - L1:1 — `foo();`",
    );
    expect(result.details?.data).toMatchObject({
      sections: expect.arrayContaining([
        expect.objectContaining({
          rel: "references",
          fileGroups: [
            { file: "a.ts", count: 3 },
            { file: "b.ts", count: 1 },
            { file: "c.ts", count: 1 },
          ],
        }),
      ]),
    });
    expect(
      result.details?.displaySections?.find((section) => section.key === "graph.references")?.lines,
    ).toEqual([
      "L1:1 — foo();",
      "L2:1 — foo();",
      "L3:1 — foo();",
      "L1:1 — foo();",
      "L1:1 — foo();",
    ]);
  });

  it("expands file coverage monotonically without changing implementation selection", async () => {
    const locations = [
      location("c.ts", 0, 5),
      location("a.ts", 0, 9),
      location("a.ts", 0),
      location("b.ts", 0, 1),
      location("c.ts", 0),
      location("a.ts", 0, 4),
    ];
    registerMockProvider(cwd, {
      references: async () => completedCodeQuery(locations),
      implementation: async () => completedCodeQuery(locations),
    });
    const cases = [
      { limit: 1, expected: ["a.ts:1"] },
      { limit: 2, expected: ["a.ts:1", "b.ts:2"] },
      { limit: 3, expected: ["a.ts:1", "b.ts:2", "c.ts:1"] },
      { limit: 4, expected: ["a.ts:1", "a.ts:5", "b.ts:2", "c.ts:1"] },
      { limit: 5, expected: ["a.ts:1", "a.ts:5", "b.ts:2", "c.ts:1", "c.ts:6"] },
      { limit: 6, expected: ["a.ts:1", "a.ts:5", "a.ts:10", "b.ts:2", "c.ts:1", "c.ts:6"] },
      { limit: 8, expected: ["a.ts:1", "a.ts:5", "a.ts:10", "b.ts:2", "c.ts:1", "c.ts:6"] },
    ];
    for (const { limit, expected } of cases) {
      const result = await execute(limit);
      const native = result.structuredContent as ReturnType<typeof structuredGraphResult>;
      expect(native.kind).toBe("completed");
      const references = native.sections.find((section) => section.relation === "references");
      expect(references?.items.map((item) => `${item.file}:${item.line}`)).toEqual(expected);
      expect(references?.evidence).toMatchObject({
        totalCount: 6,
        shownCount: expected.length,
        omittedCount: 6 - expected.length,
        partialReason: null,
      });
      expect(
        native.sections
          .find((section) => section.relation === "implements")
          ?.items.map((item) => `${item.file}:${item.line}`),
      ).toEqual(["a.ts:1", "a.ts:5", "a.ts:10", "b.ts:2", "c.ts:1", "c.ts:6"].slice(0, limit));
      expect(result.content.includes("Selection: one site per file per round.")).toBe(limit < 6);
    }
  });

  it.each([0, 2])(
    "does not explain file distribution for %s collected single-file references",
    async (count) => {
      registerMockProvider(cwd, {
        references: async () =>
          completedCodeQuery(
            [location("consumer.ts", 0), location("consumer.ts", 7)].slice(0, count),
          ),
      });
      const result = await execute(1);
      expect(result.structuredContent).toMatchObject({
        kind: "completed",
        sections: expect.arrayContaining([
          expect.objectContaining({
            relation: "references",
            items:
              count === 0
                ? []
                : [
                    {
                      file: "consumer.ts",
                      line: 1,
                      character: 1,
                      name: "foo",
                      text: "foo(); foo();",
                    },
                  ],
            evidence: expect.objectContaining({
              totalCount: count,
              shownCount: count === 0 ? 0 : 1,
            }),
          }),
        ]),
      });
      expect(result.content).not.toContain("Selection:");
    },
  );

  it("bounds call sites before grouping repeated names", async () => {
    const { content } = await execute(2);
    expect(content).toContain("2 of 3 call sites; 1 omitted");
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
    expect(callRows?.[1]).toContain("L3:3");
    if (result.details?.type !== "graph") throw new Error("Expected graph details");
    expect(
      result.details.data.sections.find((section) => section.rel === "callees")?.fileGroups,
    ).toEqual([{ file: "test.ts", count: 2 }]);
  });

  it("merges overlapping read suggestions and includes implementation guidance", async () => {
    registerMockProvider(cwd, {
      references: async () =>
        completedCodeQuery([location("consumer.ts", 0), location("consumer.ts", 7)]),
      implementation: async () => completedCodeQuery([location("implementation.ts", 6)]),
    });
    const { content } = await execute();
    // A site whose file cannot be read keeps the compact row without source text.
    expect(content).toContain("- `implementation.ts`: L1:7");
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
    // Sites on one source line share a row and its text.
    expect(content).toContain("- `consumer.ts`\n  - L1:1, L1:8 — `foo(); foo();`");
    expect(content).not.toContain("L1:1, L1:1");
  });
});
