// biome-ignore-all lint/style/noExcessiveLinesPerFile: strict code_find contract scenarios are kept together for this focused tool test
/**
 * Tests for the code_find tool.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { completedCodeQuery, getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter/api";
import { createTreeSitterProvider } from "@mrclrchtr/supi-tree-sitter/provider/tree-sitter-provider";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../../../src/extension.ts";
import { clearMockRuntime, registerMockProvider } from "../../../helpers/register-mock-runtime.ts";

interface TextToolResult {
  content: Array<{ type: string; text: string }>;
}

function completedQuery<T>(data: T) {
  return async () => completedCodeQuery(data);
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-find-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  clearMockRuntime();
});

function getCodeFindTool() {
  const pi = createPiMock();
  codeIntelligenceExtension(pi as never);
  return getTool(pi, "code_find");
}

describe("code_find tool", () => {
  it("is registered as an active public tool", () => {
    const tool = getCodeFindTool();

    expect(tool).toBeDefined();
    expect(tool.name).toBe("code_find");
    expect(typeof tool.execute).toBe("function");
    expect(tool.parameters).toBeDefined();
  });

  it("requires a code-aware mode and exposes no text-search fields", () => {
    const tool = getCodeFindTool() as {
      parameters?: { required?: string[]; properties?: Record<string, unknown> };
    };

    const props = tool.parameters?.properties;
    expect(props).toBeDefined();
    expect(tool.parameters?.required).toEqual(expect.arrayContaining(["query", "mode"]));
    expect(props).toHaveProperty("query");
    expect(props).toHaveProperty("scope");
    expect(props).toHaveProperty("mode");
    expect(props).toHaveProperty("kind");
    expect(props).not.toHaveProperty("contextLines");
    expect(props).toHaveProperty("maxResults");
  });

  it("rejects empty query with an error result", async () => {
    const tool = getCodeFindTool();

    const result = (await tool.execute(
      "test-empty-query",
      { query: "" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as TextToolResult;

    expect(result.content[0].text).toContain("Error");
    expect(result.content[0].text).toContain("query");
  });

  it("rejects an all-whitespace query with an error result", async () => {
    const tool = getCodeFindTool();

    const result = (await tool.execute(
      "test-whitespace-query",
      { query: " \t " },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as TextToolResult;

    expect(result.content[0].text).toContain("Error");
    expect(result.content[0].text).toContain("query");
  });

  it("returns an error result when scope is missing", async () => {
    const tool = getCodeFindTool();

    const result = (await tool.execute(
      "test-scope-missing",
      { query: "something", mode: "semantic", scope: ["nonexistent/dir"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as TextToolResult;

    expect(result.content[0].text).toContain("Error");
    expect(result.content[0].text).toContain("Scope");
  });

  describe("strict mode-kind contract", () => {
    it("returns error text when mode is omitted", async () => {
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-mode-omitted",
        { query: "foo", kind: "definition" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult;

      expect(result.content[0].text).toContain("mode is required");
    });

    it.each(["text", "regex"] as const)("rejects removed %s mode", async (mode) => {
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        `test-removed-${mode}-mode`,
        { query: "foo", mode },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult;

      expect(result.content[0].text).toContain("mode is required");
      expect(result.content[0].text).toContain("ast or semantic");
    });

    it("rejects the removed contextLines field", async () => {
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-removed-context-lines",
        { query: "foo", mode: "semantic", contextLines: 1 },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult;

      expect(result.content[0].text).toContain("unsupported field");
      expect(result.content[0].text).toContain("contextLines");
    });

    it("returns error text when kind is provided in semantic mode", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "const foo = 1;\n");
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-kind-in-semantic-mode",
        { query: "foo", mode: "semantic", kind: "definition" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult;

      expect(result.content[0].text).toContain("kind is not valid");
      expect(result.content[0].text).toContain('mode "semantic"');
    });

    it("returns error text when ast mode omits kind", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), 'export const foo = "hello";\n');
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-ast-without-kind",
        { query: "foo", mode: "ast" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult;

      expect(result.content[0].text).toContain('mode "ast" requires kind');
    });

    it.each(["namespace", "test"] as const)(
      "returns invalid-input for an unsupported kind when TypeBox is bypassed",
      async (kind) => {
        // PI's TypeBox schema normally rejects this before execution. The
        // session parser must return the same agent-correctable failure when a
        // direct call bypasses that adapter validation.
        writeFileSync(path.join(tmpDir, "a.ts"), "function foo() {}\n");
        const tool = getCodeFindTool();

        const result = (await tool.execute(
          `test-ast-unsupported-${kind}`,
          { query: "foo", mode: "ast", kind },
          undefined,
          undefined,
          makeCtx({ cwd: tmpDir }),
        )) as TextToolResult;
        expect(result.content[0].text).toContain("Unsupported AST kind");
      },
    );
  });

  describe("mode: ast", () => {
    it("fails when no structural provider is available", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), 'export const foo = "hello";');
      const tool = getCodeFindTool();

      await expect(
        tool.execute(
          "test-ast-no-provider",
          { query: "foo", mode: "ast", kind: "definition" },
          undefined,
          undefined,
          makeCtx({ cwd: tmpDir }),
        ),
      ).rejects.toThrow(/tree-sitter|structural|code_find/i);
    });

    it("finds definitions when structural support is available", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), 'export const foo = "hello";\n');
      registerMockProvider(tmpDir, {
        outline: async () => ({
          kind: "success" as const,
          data: [
            {
              name: "foo",
              kind: "variable",
              startLine: 1,
              startCharacter: 14,
              endLine: 1,
              endCharacter: 17,
              children: [],
            },
          ],
        }),
      });
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-ast-definition",
        { query: "foo", mode: "ast", kind: "definition" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult & {
        details?: { type: "search"; data: { confidence: string } };
      };

      expect(result.content[0].text).toContain("foo");
      expect(result.content[0].text).toContain("a.ts");
      expect(result.content[0].text).toContain("**Confidence:** `structural`");
      expect(result.details?.data.confidence).toBe("structural");
    });

    it("finds exports when structural support is available", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), 'export const foo = "hello";\n');
      registerMockProvider(tmpDir, {
        exports: async () => ({
          kind: "success" as const,
          data: [
            {
              name: "foo",
              kind: "variable",
              startLine: 1,
              startCharacter: 14,
              endLine: 1,
              endCharacter: 17,
            },
          ],
        }),
      });
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-ast-export",
        { query: "foo", mode: "ast", kind: "export" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult;

      expect(result.content[0].text).toContain("foo");
      expect(result.content[0].text).toContain("a.ts");
    });

    it("finds imports when structural support is available", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), 'import { foo } from "./foo.ts";\n');
      registerMockProvider(tmpDir, {
        imports: async () => ({
          kind: "success" as const,
          data: [
            {
              moduleSpecifier: "./foo.ts",
              startLine: 1,
              startCharacter: 1,
              endLine: 1,
              endCharacter: 29,
            },
          ],
        }),
      });
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-ast-import",
        { query: "./foo.ts", mode: "ast", kind: "import" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult;

      expect(result.content[0].text).toContain("./foo.ts");
      expect(result.content[0].text).toContain("a.ts");
    });

    it("finds type-like declarations when structural support is available", async () => {
      writeFileSync(
        path.join(tmpDir, "a.ts"),
        "interface Foo { value: string }\ntype FooId = string;\n",
      );
      registerMockProvider(tmpDir, {
        outline: async () => ({
          kind: "success" as const,
          data: [
            {
              name: "Foo",
              kind: "interface",
              startLine: 1,
              startCharacter: 11,
              endLine: 1,
              endCharacter: 14,
              children: [],
            },
            {
              name: "FooId",
              kind: "type",
              startLine: 2,
              startCharacter: 6,
              endLine: 2,
              endCharacter: 11,
              children: [],
            },
          ],
        }),
      });
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-ast-type",
        { query: "Foo", mode: "ast", kind: "type" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult;

      expect(result.content[0].text).toContain("Foo");
      expect(result.content[0].text).toContain("FooId");
      expect(result.content[0].text).toContain("Types");
    });

    it("finds interface declarations when structural support is available", async () => {
      writeFileSync(
        path.join(tmpDir, "a.ts"),
        "interface Foo { value: string }\ntype FooId = string;\n",
      );
      registerMockProvider(tmpDir, {
        outline: async () => ({
          kind: "success" as const,
          data: [
            {
              name: "Foo",
              kind: "interface",
              startLine: 1,
              startCharacter: 11,
              endLine: 1,
              endCharacter: 14,
              children: [],
            },
            {
              name: "FooId",
              kind: "type",
              startLine: 2,
              startCharacter: 6,
              endLine: 2,
              endCharacter: 11,
              children: [],
            },
          ],
        }),
      });
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-ast-interface",
        { query: "Foo", mode: "ast", kind: "interface" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult;

      expect(result.content[0].text).toContain("Foo");
      expect(result.content[0].text).not.toContain("FooId");
      expect(result.content[0].text).toContain("Interfaces");
    });

    it.each([
      ["class", "Widget", "class"],
      ["method", "render", "method"],
      ["enum", "Status", "enum"],
    ] as const)("finds %s declarations", async (astKind, name, providerKind) => {
      writeFileSync(path.join(tmpDir, "a.ts"), `export ${providerKind} ${name} {}\n`);
      registerMockProvider(tmpDir, {
        outline: async () => ({
          kind: "success" as const,
          data: [
            {
              name,
              kind: providerKind,
              startLine: 1,
              startCharacter: 1,
              endLine: 1,
              endCharacter: name.length + 1,
              children: [],
            },
          ],
        }),
      });
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        `test-ast-${astKind}`,
        { query: name, mode: "ast", kind: astKind },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult;

      expect(result.content[0].text).toContain(`\`${name}\` (${providerKind})`);
    });

    it("finds call sites when structural support is available (mocked)", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "const x = obj.method();\n");
      registerMockProvider(tmpDir, {
        callSites: async () => ({
          kind: "success" as const,
          data: [
            {
              name: "obj.method",
              startLine: 1,
            },
          ],
        }),
      });
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-ast-call-mocked",
        { query: "obj.method", mode: "ast", kind: "call" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult;

      const text = result.content[0].text;
      expect(text).toContain("obj.method");
      expect(text).toContain("a.ts");
      expect(text).toContain("AST call results are name-based");
      expect(text).toContain("not symbol-identity-aware");
    });

    it("routes AST call nextQueries to code_graph and emits no stale summary hint", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "const x = obj.method();\n");
      registerMockProvider(tmpDir, {
        callSites: async () => ({
          kind: "success" as const,
          data: [{ name: "obj.method", startLine: 1 }],
        }),
      });
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-ast-call-nextqueries",
        { query: "obj.method", mode: "ast", kind: "call" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult & {
        details?: { type: "search"; data: { nextQueries: string[] } };
      };

      const nextQueries = result.details?.data.nextQueries ?? [];
      expect(nextQueries).toEqual(
        expect.arrayContaining([
          expect.stringContaining("code_graph"),
          expect.stringContaining("symbol-identity"),
        ]),
      );
      expect(nextQueries.some((q) => q.includes("summary"))).toBe(false);
    });

    it("discloses truncated AST matches in markdown and details", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "export const alpha = 1;\n");
      writeFileSync(path.join(tmpDir, "b.ts"), "export const beta = 2;\n");
      registerMockProvider(tmpDir, {
        outline: async (file) => ({
          kind: "success" as const,
          data: file.endsWith("a.ts")
            ? [
                {
                  name: "alpha",
                  kind: "variable",
                  startLine: 1,
                  startCharacter: 14,
                  endLine: 1,
                  endCharacter: 19,
                  children: [],
                },
              ]
            : [
                {
                  name: "beta",
                  kind: "variable",
                  startLine: 1,
                  startCharacter: 14,
                  endLine: 1,
                  endCharacter: 18,
                  children: [],
                },
              ],
        }),
      });
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-ast-truncation",
        { query: "a", mode: "ast", kind: "definition", maxResults: 1 },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult & {
        details?: {
          type: "search";
          data: {
            omittedCount: number;
            evidenceLists?: Array<{
              key: string;
              totalCount: number | null;
              shownCount: number;
              omittedCount: number | null;
            }>;
          };
        };
      };

      const text = result.content[0].text;
      expect(text).toContain("**2 matches** across **2 files**");
      expect(text).toContain("alpha");
      expect(text).not.toContain("beta");
      expect(text).toContain("_(showing 1 of 2; 1 omitted)_");
      expect(result.details?.data.evidenceLists).toContainEqual({
        key: "find.astMatches",
        totalCount: 2,
        shownCount: 1,
        omittedCount: 1,
        partialReason: null,
      });
    });

    it("finds full-expression call sites with a real tree-sitter provider", async () => {
      const srcDir = path.join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(
        path.join(srcDir, "target.ts"),
        [
          "interface Query { trim(): string }",
          "interface Params { query: Query }",
          "function process(params: Params) {",
          "  const result = params.query.trim();",
          "  return result;",
          "}",
          "",
        ].join("\n"),
      );

      const session = createTreeSitterSession(tmpDir);
      getDefaultWorkspaceRuntime().registerStructural(tmpDir, createTreeSitterProvider(session));
      const tool = getCodeFindTool();

      try {
        const result = (await tool.execute(
          "test-ast-call-integration",
          { query: "params.query.trim", mode: "ast", kind: "call", scope: ["src"] },
          undefined,
          undefined,
          makeCtx({ cwd: tmpDir }),
        )) as TextToolResult;

        const text = result.content[0].text;
        expect(text).toContain("params.query.trim");
        expect(text).toContain("src/target.ts");
        expect(text).toContain("AST call results are name-based");
      } finally {
        session.dispose();
      }
    });

    it("does not match a call name that appears only inside another call's arguments", async () => {
      const srcDir = path.join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(
        path.join(srcDir, "target.ts"),
        [
          "declare const values: string[];",
          "declare function canonicalDeclarationKind(value: string): string;",
          "const selected = values",
          "  .filter((value) => canonicalDeclarationKind(value))",
          "  .sort();",
          // biome-ignore lint/security/noSecrets: source fixture exercises a nested string argument
          'const joined = [canonicalDeclarationKind("x")].join(",");',
          "void selected;",
          "void joined;",
          "",
        ].join("\n"),
      );

      const session = createTreeSitterSession(tmpDir);
      getDefaultWorkspaceRuntime().registerStructural(tmpDir, createTreeSitterProvider(session));
      const tool = getCodeFindTool();

      try {
        const result = (await tool.execute(
          "test-ast-call-argument-name",
          {
            query: "canonicalDeclarationKind",
            mode: "ast",
            kind: "call",
            scope: ["src"],
          },
          undefined,
          undefined,
          makeCtx({ cwd: tmpDir }),
        )) as TextToolResult;

        const text = result.content[0].text;
        expect(text).toContain("`canonicalDeclarationKind` (call)");
        expect(text).not.toContain("values .filter");
        expect(text).not.toContain("].join");
      } finally {
        session.dispose();
      }
    });
  });

  describe("mode: semantic", () => {
    it("fails when no semantic provider is available", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "const foo = 1;\n");
      const tool = getCodeFindTool();

      await expect(
        tool.execute(
          "test-semantic-no-provider",
          { query: "foo", mode: "semantic" },
          undefined,
          undefined,
          makeCtx({ cwd: tmpDir }),
        ),
      ).rejects.toThrow(/semantic|lsp|code_find/i);
    });

    it("returns a semantic no-results result without text fallback", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "const ghost = 1;\n");
      registerMockProvider(tmpDir, {
        workspaceSymbols: async () => completedCodeQuery([]),
      });
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-semantic-no-results",
        { query: "ghost", mode: "semantic" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult;

      const text = result.content[0].text;
      expect(text).toContain("No LSP workspace-symbol results found");
      expect(text).toContain("Document-level semantic symbols can differ from the workspace index");
      expect(text).toContain("use code_resolve with a file selector");
      expect(text).not.toContain("fell back to text search");
      expect(text).not.toContain("a.ts");
      const details = result as TextToolResult & {
        details?: { type: "search"; data: { nextQueries: string[] } };
      };
      expect(details.details?.data.nextQueries).toContain(
        "If you know the file, use code_resolve with a file selector to enumerate document declarations",
      );
    });

    it("discloses an empty partial semantic collection", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "const ghost = 1;\n");
      registerMockProvider(tmpDir, {
        workspaceSymbols: async () => ({
          kind: "partial",
          data: [],
          reason: "One project server did not respond.",
        }),
      });
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-semantic-partial-empty",
        { query: "ghost", mode: "semantic" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult;

      const text = result.content[0].text;
      expect(text).toContain("No LSP workspace-symbol results were collected");
      expect(text).toContain("more may exist — provider-limited");
      expect(text).not.toContain("No LSP workspace-symbol results found");
      expect(text).not.toContain("One project server did not respond");
      const details = result as TextToolResult & {
        details?: {
          type: "search";
          data: {
            evidenceLists?: Array<{
              key: string;
              totalCount: number | null;
              partialReason: string | null;
            }>;
          };
        };
      };
      expect(details.details?.data.evidenceLists).toContainEqual(
        expect.objectContaining({
          key: "find.semanticSymbols",
          totalCount: null,
          partialReason: "provider-limited",
        }),
      );
    });

    it("returns workspace symbols when a semantic provider is available", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "export function myFunc() {}\n");
      registerMockProvider(tmpDir, {
        workspaceSymbols: completedQuery([
          {
            name: "myFunc",
            kind: "function",
            file: path.join(tmpDir, "a.ts"),
            declarationAnchor: { line: 1, character: 17 },
          },
        ]),
      });
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-semantic-symbols",
        { query: "myFunc", mode: "semantic" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult & {
        details?: { type: "search"; data: { confidence: string } };
      };

      const text = result.content[0].text;
      expect(text).toContain("myFunc");
      expect(text).toContain("a.ts");
      expect(text).toContain("**Confidence:** `semantic`");
      expect(result.details?.data.confidence).toBe("semantic");
    });

    it("discloses truncated semantic symbols in markdown and details", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "export function one() {}\n");
      writeFileSync(path.join(tmpDir, "b.ts"), "export function two() {}\n");
      registerMockProvider(tmpDir, {
        workspaceSymbols: completedQuery([
          {
            name: "one",
            kind: "function",
            file: path.join(tmpDir, "a.ts"),
            declarationAnchor: { line: 1, character: 17 },
          },
          {
            name: "two",
            kind: "function",
            file: path.join(tmpDir, "b.ts"),
            declarationAnchor: { line: 1, character: 17 },
          },
        ]),
      });
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-semantic-truncation",
        { query: "o", mode: "semantic", maxResults: 1 },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult & {
        details?: {
          type: "search";
          data: {
            omittedCount: number;
            evidenceLists?: Array<{
              key: string;
              totalCount: number | null;
              shownCount: number;
              omittedCount: number | null;
            }>;
          };
        };
      };

      const text = result.content[0].text;
      expect(text).toContain("one");
      expect(text).not.toContain("two");
      expect(text).toContain("_(showing 1 of 2; 1 omitted)_");
      expect(result.details?.data.omittedCount).toBe(1);
      expect(result.details?.data.evidenceLists).toContainEqual({
        key: "find.semanticSymbols",
        totalCount: 2,
        shownCount: 1,
        omittedCount: 1,
        partialReason: null,
      });
    });

    it("respects scope in semantic mode and normalizes leading @", async () => {
      mkdirSync(path.join(tmpDir, "src"), { recursive: true });
      mkdirSync(path.join(tmpDir, "other"), { recursive: true });
      writeFileSync(path.join(tmpDir, "src/a.ts"), "export function scopedFunc() {}\n");
      writeFileSync(path.join(tmpDir, "other/a.ts"), "export function scopedFunc() {}\n");
      registerMockProvider(tmpDir, {
        workspaceSymbols: completedQuery([
          {
            name: "scopedFunc",
            kind: "function",
            file: path.join(tmpDir, "src/a.ts"),
            declarationAnchor: { line: 1, character: 17 },
          },
          {
            name: "scopedFunc",
            kind: "function",
            file: path.join(tmpDir, "other/a.ts"),
            declarationAnchor: { line: 1, character: 17 },
          },
        ]),
      });
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-semantic-scope-filter",
        { query: "scopedFunc", mode: "semantic", scope: ["@src"] },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult;

      const text = result.content[0].text;
      expect(text).toContain("src/a.ts");
      expect(text).not.toContain("other/a.ts");
    });

    it("filters semantic results across multiple scopes", async () => {
      mkdirSync(path.join(tmpDir, "src"), { recursive: true });
      mkdirSync(path.join(tmpDir, "docs"), { recursive: true });
      mkdirSync(path.join(tmpDir, "other"), { recursive: true });
      registerMockProvider(tmpDir, {
        workspaceSymbols: completedQuery([
          {
            name: "multiScoped",
            kind: "function",
            file: path.join(tmpDir, "src/a.ts"),
            declarationAnchor: { line: 1, character: 17 },
          },
          {
            name: "multiScoped",
            kind: "function",
            file: path.join(tmpDir, "docs/a.ts"),
            declarationAnchor: { line: 1, character: 17 },
          },
          {
            name: "multiScoped",
            kind: "function",
            file: path.join(tmpDir, "other/a.ts"),
            declarationAnchor: { line: 1, character: 17 },
          },
        ]),
      });
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-semantic-multiple-scope-filter",
        { query: "multiScoped", mode: "semantic", scope: ["src", "docs"] },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult & { details?: { type: "search"; data: { scope: string | null } } };

      const text = result.content[0].text;
      expect(text).toContain("src/a.ts");
      expect(text).toContain("docs/a.ts");
      expect(text).not.toContain("other/a.ts");
      expect(result.details?.data.scope).toBe("src, docs");
    });
  });

  describe("AST Scan scope policy", () => {
    it("prunes node_modules by default but honors an explicit supported file", async () => {
      mkdirSync(path.join(tmpDir, "node_modules/pkg"), { recursive: true });
      writeFileSync(path.join(tmpDir, "workspace.ts"), "export const workspaceTarget = true;\n");
      writeFileSync(
        path.join(tmpDir, "node_modules/pkg/index.js"),
        "export const dependencyTarget = true;\n",
      );
      registerMockProvider(tmpDir, {
        outline: async (file) => ({
          kind: "success" as const,
          data: [
            {
              name: file.includes("node_modules") ? "dependencyTarget" : "workspaceTarget",
              kind: "variable",
              startLine: 1,
              startCharacter: 14,
              endLine: 1,
              endCharacter: 30,
              children: [],
            },
          ],
        }),
      });
      const tool = getCodeFindTool();

      const defaultResult = (await tool.execute(
        "test-default-prunes-dependencies",
        { query: "Target", mode: "ast", kind: "definition" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult & {
        details?: {
          type: "search";
          data: { scan?: { exclusions: Array<{ reason: string; pathCount: number }> } };
        };
      };
      expect(defaultResult.content[0].text).toContain("workspaceTarget");
      expect(defaultResult.content[0].text).not.toContain("dependencyTarget");
      expect(defaultResult.details?.data.scan?.exclusions).toContainEqual(
        expect.objectContaining({ reason: "excluded-directory", pathCount: 1 }),
      );

      const explicitResult = (await tool.execute(
        "test-explicit-dependency-file",
        {
          query: "dependencyTarget",
          mode: "ast",
          kind: "definition",
          scope: ["node_modules/pkg/index.js"],
        },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult & {
        details?: { type: "search"; data: { scan?: { complete: boolean; roots: string[] } } };
      };
      expect(explicitResult.content[0].text).toContain("dependencyTarget");
      expect(explicitResult.content[0].text).toContain("node_modules/pkg/index.js");
      expect(explicitResult.details?.data.scan).toMatchObject({
        complete: true,
        roots: ["node_modules/pkg/index.js"],
      });
    });
  });
});
