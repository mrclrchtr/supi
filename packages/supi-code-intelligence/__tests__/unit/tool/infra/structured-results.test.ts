import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { completedCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerCodeIntelligenceTools } from "../../../../src/tool/register.ts";
import { sessionCache } from "../../../helpers/execute-action.ts";
import { clearMockRuntime, registerMockProvider } from "../../../helpers/register-mock-runtime.ts";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "code-structured-"));
  writeFileSync(join(cwd, "index.ts"), "export function widget() {}\n");
  registerMockProvider(cwd);
});

afterEach(() => {
  clearMockRuntime();
  rmSync(cwd, { recursive: true, force: true });
});

interface StructuredTool {
  outputSchema: TSchema;
  execute: (...args: unknown[]) => Promise<{
    content: Array<{ text: string }>;
    structuredContent: Record<string, unknown>;
  }>;
}

describe("structured navigation results", () => {
  it("returns reusable resolve handles without leaking target-store internals", async () => {
    const pi = createPiMock();
    registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate);
    const tool = getTool(pi, "code_resolve") as unknown as StructuredTool;
    const result = await tool.execute(
      "resolve",
      { target: { anchor: { file: "index.ts", line: 1, character: 17 } } },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );

    expect(result.structuredContent).toMatchObject({
      kind: "resolved",
      targets: [
        {
          name: "widget",
          file: "index.ts",
          line: 1,
          character: 17,
          anchorKind: "name",
          resolution: {
            requested: { line: 1, character: 17 },
            resolved: { line: 1, character: 17 },
            snapped: false,
          },
        },
      ],
      evidenceLists: [{ totalCount: 1, shownCount: 1, omittedCount: 0 }],
    });
    expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
    const handle = (result.structuredContent.targets as Array<{ handle: string }>)[0]?.handle;
    expect(handle).toMatch(/^tg-/);
    expect(result.content[0]?.text).toContain(handle);
    expect(JSON.stringify(result.structuredContent)).not.toMatch(
      /spanId|fileFingerprint|operationId/,
    );
  });

  it.each([
    ["code_resolve", { target: { file: "missing.ts" } }],
    ["code_find", { query: "", mode: "semantic" }],
    ["code_graph", { target: { handle: "tg-missing" } }],
  ])("returns schema-valid recovery data for %s invalid input", async (name, params) => {
    const pi = createPiMock();
    registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate);
    const tool = getTool(pi, name as string) as unknown as StructuredTool;
    const result = await tool.execute("invalid", params, undefined, undefined, makeCtx({ cwd }));
    expect(result.structuredContent).toMatchObject({
      kind: "invalid-input",
      message: expect.any(String),
    });
    expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
  });

  it.each(["code_resolve", "code_graph"])(
    "retains candidate handles and kind-mismatch evidence for %s",
    async (name) => {
      writeFileSync(
        join(cwd, "index.ts"),
        "export function widget() {}\nexport function widgetOther() {}\n",
      );
      registerMockProvider(cwd, {
        workspaceSymbols: async () =>
          completedCodeQuery([
            {
              name: "widget",
              kind: "Function",
              file: join(cwd, "index.ts"),
              declarationAnchor: { line: 1, character: 1 },
              nameAnchor: { line: 1, character: 17 },
            },
            {
              name: "widgetOther",
              kind: "Function",
              file: join(cwd, "index.ts"),
              declarationAnchor: { line: 2, character: 1 },
              nameAnchor: { line: 2, character: 17 },
            },
          ]),
      });
      const pi = createPiMock();
      registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate);
      const tool = getTool(pi, name) as unknown as StructuredTool;
      for (const symbolKind of [undefined, "class"]) {
        const symbol = { query: "widget", ...(symbolKind ? { symbolKind } : {}) };
        const result = await tool.execute(
          "candidates",
          { target: { symbol }, maxResults: 1 },
          undefined,
          undefined,
          makeCtx({ cwd }),
        );
        expect(result.structuredContent).toMatchObject({
          kind: symbolKind ? "kind-mismatch" : "disambiguation",
          targets: [{ handle: expect.stringMatching(/^tg-/), name: "widget" }],
          evidenceLists: [{ totalCount: 2, shownCount: 1, omittedCount: 1 }],
        });
        expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
      }
    },
  );

  it("preserves AST scan exclusions separately from complete match evidence", async () => {
    writeFileSync(join(cwd, "notes.md"), "Not a source file.\n");
    registerMockProvider(cwd, {
      outline: async () => ({
        kind: "success",
        data: [
          {
            name: "widget",
            kind: "function",
            startLine: 1,
            startCharacter: 17,
            endLine: 1,
            endCharacter: 23,
            children: [],
          },
        ],
      }),
    });
    const pi = createPiMock();
    registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate);
    const tool = getTool(pi, "code_find") as unknown as StructuredTool;
    const result = await tool.execute(
      "ast",
      { query: "widget", mode: "ast", kind: "definition" },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );
    expect(result.structuredContent).toMatchObject({
      kind: "completed",
      mode: "ast",
      matches: [
        { name: "widget", file: "index.ts", line: 1, character: 17, endLine: 1, endCharacter: 23 },
      ],
      scan: {
        universe: "structural-operation-supported-files",
        complete: true,
        eligibleFileCount: 1,
        analyzedFileCount: 1,
        exclusions: [{ scopeRoot: ".", reason: "unsupported-extension", pathCount: 1 }],
      },
      evidenceLists: [{ totalCount: 1, partialReason: null }],
    });
    expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
    const missingScope = structuredClone(result.structuredContent);
    const exclusions = (missingScope.scan as { exclusions: Array<{ scopeRoot?: string }> })
      .exclusions;
    delete exclusions[0]?.scopeRoot;
    expect(Value.Check(tool.outputSchema, missingScope)).toBe(false);
  });

  it("does not turn a completed partial empty search into complete absence", async () => {
    registerMockProvider(cwd, {
      workspaceSymbols: async () => ({
        kind: "partial",
        data: [],
        reason: "Index warming",
        metadata: { automaticPathExclusion: { excludedCount: 2, examples: ["build/index.ts"] } },
      }),
    });
    const pi = createPiMock();
    registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate);
    const tool = getTool(pi, "code_find") as unknown as StructuredTool;
    const result = await tool.execute(
      "partial",
      { query: "widget", mode: "semantic" },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );
    expect(result.structuredContent).toMatchObject({
      kind: "completed",
      matches: [],
      partialReason: "Index warming",
      evidenceLists: [{ totalCount: null, partialReason: "provider-limited" }],
      automaticPathExclusion: { excludedCount: 2, examples: ["build/index.ts"] },
    });
    expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
  });

  it("bounds model text without truncating codemode evidence", async () => {
    const name = `widget${"LongName".repeat(1500)}`;
    registerMockProvider(cwd, {
      workspaceSymbols: async () =>
        completedCodeQuery([
          {
            name,
            kind: "Function",
            file: join(cwd, "index.ts"),
            declarationAnchor: { line: 1, character: 1 },
          },
        ]),
    });
    const pi = createPiMock();
    registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate);
    const tool = getTool(pi, "code_find") as unknown as StructuredTool;
    const result = await tool.execute(
      "large",
      { query: "widget", mode: "semantic" },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );
    const text = result.content[0].text;
    const snapshot = text.match(/Full output saved to: `([^`]+)`/)?.[1];
    expect(snapshot).toBeDefined();
    try {
      expect(text.length).toBeLessThanOrEqual(8000);
      expect(text).toContain("returned=1, total=1, cap-omitted=0");
      expect(result.structuredContent).toMatchObject({
        matches: [{ name }],
        evidenceLists: [{ shownCount: 1, totalCount: 1 }],
      });
      expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
      expect(readFileSync(snapshot as string, "utf8")).toContain(name);
    } finally {
      if (snapshot) rmSync(dirname(snapshot), { recursive: true, force: true });
    }
  });

  it("returns capped semantic matches with their anchor type and exact totals", async () => {
    registerMockProvider(cwd, {
      workspaceSymbols: async () =>
        completedCodeQuery([
          {
            name: "widget",
            kind: "Function",
            file: join(cwd, "index.ts"),
            declarationAnchor: { line: 1, character: 1 },
            nameAnchor: { line: 1, character: 17 },
          },
          {
            name: "widgetOther",
            kind: "Function",
            file: join(cwd, "index.ts"),
            declarationAnchor: { line: 3, character: 1 },
          },
        ]),
    });
    const pi = createPiMock();
    registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate);
    const tool = getTool(pi, "code_find") as unknown as StructuredTool;
    const result = await tool.execute(
      "find",
      { query: "widget", mode: "semantic", maxResults: 1 },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );
    expect(result.structuredContent).toMatchObject({
      kind: "completed",
      mode: "semantic",
      matches: [{ name: "widget", file: "index.ts", line: 1, character: 17, anchorKind: "name" }],
      evidenceLists: [{ totalCount: 2, shownCount: 1, omittedCount: 1 }],
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain("widgetOther");
    expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
  });

  it("chains resolve into a bounded graph with explicit unavailable relations", async () => {
    registerMockProvider(cwd, {
      references: async () =>
        completedCodeQuery([
          {
            uri: `file://${join(cwd, "use.ts")}`,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
          },
          {
            uri: `file://${join(cwd, "use.ts")}`,
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 6 } },
          },
        ]),
    });
    const pi = createPiMock();
    registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate);
    const resolve = getTool(pi, "code_resolve") as unknown as StructuredTool;
    const resolved = await resolve.execute(
      "resolve",
      { target: { file: "index.ts" } },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );
    const handle = (resolved.structuredContent.targets as Array<{ handle: string }>)[0]?.handle;
    const graph = getTool(pi, "code_graph") as unknown as StructuredTool;
    const result = await graph.execute(
      "graph",
      { target: { handle }, relations: ["references", "implements"], maxResults: 1 },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );

    expect(result.structuredContent).toMatchObject({
      kind: "completed",
      target: { name: "widget", file: "index.ts" },
      sections: [
        {
          relation: "references",
          source: "semantic",
          status: "partial",
          items: [{ file: "use.ts", line: 1, character: 1 }],
          evidence: { totalCount: 2, shownCount: 1, omittedCount: 1 },
        },
        { relation: "implements", status: "unavailable", items: [], message: expect.any(String) },
      ],
    });
    expect(Value.Check(graph.outputSchema, result.structuredContent)).toBe(true);
    expect(result.content[0]?.text).toContain("1 omitted");
    expect(JSON.stringify(result.structuredContent)).not.toContain(cwd);
  });
});
