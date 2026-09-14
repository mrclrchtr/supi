import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { completedCodeQuery, partialCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeGraphTool } from "../../../src/tool/code_graph/execute.ts";
import { renderGraphResult } from "../../../src/tool/code_graph/tui.ts";
import type { CodeIntelResult } from "../../../src/types/index.ts";
import type { ToolResult } from "../../../src/ui/tui/common.ts";
import { makeTestCtx } from "../../helpers/execute-action.ts";
import { clearMockRuntime, registerMockProvider } from "../../helpers/register-mock-runtime.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;
let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "graph-tui-"));
  writeFileSync(path.join(cwd, "test.ts"), "function work() { run(); }\n");
});

afterEach(() => {
  clearMockRuntime();
  rmSync(cwd, { recursive: true, force: true });
});

function render(result: CodeIntelResult, expanded: boolean): string {
  const toolResult = {
    ...result,
    content: [{ type: "text", text: "This agent text must not appear in the TUI." }],
  } as unknown as ToolResult;
  return renderGraphResult(toolResult, { expanded, isPartial: false }, theme, undefined)
    .render(160)
    .join("\n");
}

function execute(maxResults?: number) {
  return executeGraphTool(
    {
      target: { anchor: { file: "test.ts", line: 1, character: 10 } },
      relations: ["all"],
      calleeDepth: "deep",
      maxResults,
    },
    makeTestCtx(cwd),
  );
}

describe("code_graph human output", () => {
  it("uses the TUI row cap without claiming that hidden rows are shown", async () => {
    registerMockProvider(cwd, {
      references: async () =>
        completedCodeQuery(
          Array.from({ length: 25 }, (_, index) => ({
            uri: `file://${path.join(cwd, "test.ts")}`,
            range: {
              start: { line: 1, character: index * 6 },
              end: { line: 1, character: index * 6 + 4 },
            },
          })),
        ),
    });
    const result = await execute(30);
    expect(render(result, true)).toContain("20 of 25 locations shown; 5 omitted");
    expect(render(result, false)).toContain("20 of 25 locations shown; 5 omitted");
    expect(render(result, true)).not.toContain("L2:145");
    expect(result.content).toContain("L2:145");
  });

  it.each([undefined, { sections: [null, {}, { rel: {} }], targetName: 42 }])(
    "handles missing or malformed persisted details",
    (data) => {
      const result = { content: [], details: data ? { type: "graph", data } : undefined };
      expect(() =>
        renderGraphResult(result, { expanded: true, isPartial: false }, theme, undefined).render(
          40,
        ),
      ).not.toThrow();
    },
  );

  it("uses PI state for progress and execution failures", () => {
    expect(
      renderGraphResult({ content: [] }, { expanded: false, isPartial: true }, theme, undefined)
        .render(80)
        .join("\n"),
    ).toContain("Collecting relations");
    expect(
      renderGraphResult({ content: [] }, { expanded: true, isPartial: false }, theme, {
        isError: true,
      })
        .render(80)
        .join("\n"),
    ).toContain("code_graph failed");
  });

  it.each([false, true])(
    "keeps target, relation types, and unavailable status when expanded=%s",
    async (expanded) => {
      registerMockProvider(cwd, {
        implementation: async () => completedCodeQuery([]),
        calleesAt: async () => ({
          kind: "success",
          data: {
            enclosingScope: { name: "work", startLine: 1, endLine: 1 },
            callees: [{ name: "run", startLine: 1, startCharacter: 19 }],
            depth: "deep",
          },
        }),
      });
      const result = await execute();
      const text = render(result, expanded);
      expect(text).toContain("work");
      expect(text).toContain("test.ts");
      expect(text).toMatch(/references \(semantic\).*unavailable/i);
      expect(text).toContain("callees (structural, deep)");
      expect(text.match(/1 call site/g)).toHaveLength(1);
      expect(text).not.toContain("confidence semantic");
      expect(text).not.toContain("raw markdown");
      expect(text).not.toContain("This agent text");
      if (expanded) expect(text).toContain("L1:19");
    },
  );

  it.each([false, true])(
    "discloses provider-limited empty results when expanded=%s",
    async (expanded) => {
      registerMockProvider(cwd, {
        references: async () => partialCodeQuery([], "Provider stopped early"),
        implementation: async () => completedCodeQuery([]),
      });
      const text = render(await execute(), expanded);
      expect(text).toContain("more may exist");
      expect(text).toContain("provider-limited");
    },
  );
});
