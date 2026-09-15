import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  completedCodeQuery,
  partialCodeQuery,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
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
  it("asks for a target instead of reporting invalid input for ambiguous names", async () => {
    writeFileSync(path.join(cwd, "other.ts"), "function work() {}\n");
    registerMockProvider(cwd, {
      workspaceSymbols: async () =>
        completedCodeQuery(
          ["test.ts", "other.ts"].map((file) => ({
            name: "work",
            kind: "Function",
            file: path.join(cwd, file),
            declarationAnchor: { line: 1, character: 1 },
            nameAnchor: { line: 1, character: 10 },
          })),
        ),
    });
    const result = await executeGraphTool(
      { target: { symbol: { query: "work" } } },
      makeTestCtx(cwd),
    );
    expect(result.details?.status).toBe("disambiguation");
    expect(render(result, false)).toContain("Choose a target");
    expect(render(result, false)).not.toContain("Invalid input");
    const expanded = render(result, true);
    expect(expanded).toContain("other.ts");
    expect(expanded).not.toContain("This agent text");
  });

  it.each([
    {
      name: "ambiguity",
      target: { symbol: { query: "work" } },
      status: "disambiguation" as const,
      message: "The target is ambiguous.",
      nextQuery:
        "Choose one candidate handle, or narrow the symbol selector with scope or symbolKind",
      contentMarker: "**Target is ambiguous. Choose one candidate handle:**",
    },
    {
      name: "kind mismatch",
      target: { symbol: { query: "work", symbolKind: "class" as const } },
      status: "invalid-input" as const,
      message: "No target matched provider kind class.",
      nextQuery:
        "Retry without symbolKind, use an observed provider kind, or choose a near-match handle",
      contentMarker: "**No target matched provider kind `class`. Near matches:**",
    },
  ])("keeps graph $name content and status while exposing selection guidance", async (case_) => {
    writeFileSync(path.join(cwd, "other.ts"), "function work() {}\n");
    registerMockProvider(cwd, {
      workspaceSymbols: async () =>
        completedCodeQuery(
          ["test.ts", "other.ts"].map((file) => ({
            name: "work",
            kind: "Function",
            file: path.join(cwd, file),
            declarationAnchor: { line: 1, character: 1 },
            nameAnchor: { line: 1, character: 10 },
          })),
        ),
    });
    const result = await executeGraphTool({ target: case_.target }, makeTestCtx(cwd));

    expect(result.content).toContain(case_.contentMarker);
    expect(result.content).not.toContain(case_.nextQuery);
    expect(result.details?.status).toBe(case_.status);
    expect(result.details?.message).toBe(case_.message);
    if (result.details?.type !== "search") throw new Error("Expected search details");
    expect(result.details.data).toMatchObject({
      candidateCount: 2,
      omittedCount: 0,
      nextQueries: [case_.nextQuery],
    });
  });

  it.each([undefined, "class"] as const)(
    "discloses candidate omissions once with maxResults 1 (kind=%s)",
    async (symbolKind) => {
      writeFileSync(path.join(cwd, "other.ts"), "function work() {}\n");
      registerMockProvider(cwd, {
        workspaceSymbols: async () =>
          completedCodeQuery(
            ["test.ts", "other.ts"].map((file) => ({
              name: "work",
              kind: "Function",
              file: path.join(cwd, file),
              declarationAnchor: { line: 1, character: 1 },
              nameAnchor: { line: 1, character: 10 },
            })),
          ),
      });
      const result = await executeGraphTool(
        { target: { symbol: { query: "work", symbolKind } }, maxResults: 1 },
        makeTestCtx(cwd),
      );
      expect(result.details?.displaySections?.[0]).toMatchObject({
        shownCount: 1,
        totalCount: 2,
        omittedCount: 1,
      });
      for (const text of [result.content, render(result, false), render(result, true)]) {
        expect(text).toContain("1 of 2");
        expect(text.match(/1 omitted/g)).toHaveLength(1);
        expect(text).not.toContain("other.ts");
      }
    },
  );

  it("discloses provider-limited candidate omissions in all surfaces", async () => {
    writeFileSync(path.join(cwd, "other.ts"), "function work() {}\n");
    registerMockProvider(cwd, {
      workspaceSymbols: async () =>
        partialCodeQuery(
          ["test.ts", "other.ts"].map((file) => ({
            name: "work",
            kind: "Function",
            file: path.join(cwd, file),
            declarationAnchor: { line: 1, character: 1 },
            nameAnchor: { line: 1, character: 10 },
          })),
          "one workspace-symbol route failed",
        ),
    });
    const result = await executeGraphTool(
      { target: { symbol: { query: "work" } }, maxResults: 1 },
      makeTestCtx(cwd),
    );
    expect(result.details?.displaySections?.[0]).toMatchObject({
      shownCount: 1,
      totalCount: null,
      omittedCount: 1,
      partialReason: "provider-limited",
    });
    for (const text of [result.content, render(result, false), render(result, true)]) {
      expect(text).toContain("1 collected omitted; more may exist — provider-limited");
      expect(text.match(/collected omitted/g)).toHaveLength(1);
      expect(text).not.toContain("other.ts");
    }
  });

  it("keeps the reference provider failure reason in a mixed graph result", async () => {
    const reason = "LSP references failed. Enrollment retry exhausted after 1 retry.";
    registerMockProvider(cwd, {
      references: async () => unavailableCodeQuery(reason),
      implementation: async () => completedCodeQuery([]),
    });
    const result = await execute();
    expect(result.content).toContain(reason);
    expect(render(result, true)).toContain(reason);
    if (result.details?.type !== "graph") throw new Error("Expected graph details");
    expect(result.details.data.sections[0]).toMatchObject({
      rel: "references",
      status: "unavailable",
      message: reason,
    });
  });

  it("keeps the callee failure reason and a next step in both surfaces", async () => {
    const message = "No enclosing function or method found at the given position";
    registerMockProvider(cwd, {
      references: async () => completedCodeQuery([]),
      calleesAt: async () => ({ kind: "runtime-error", message }),
    });
    const result = await execute();
    expect(result.content).toContain(message);
    expect(result.content).toContain("code_inspect");
    expect(render(result, true)).toContain(message);
    expect(render(result, true)).toContain("code_inspect");
    await expect(
      executeGraphTool(
        { target: { anchor: { file: "test.ts", line: 1, character: 10 } }, relations: ["callees"] },
        makeTestCtx(cwd),
      ),
    ).rejects.toThrow(message);
  });

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
