// biome-ignore-all lint/style/noExcessiveLinesPerFile: strict code_find contract scenarios are kept together for this focused tool test
/**
 * Tests for the code_find tool.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter/api";
import { createTreeSitterProvider } from "@mrclrchtr/supi-tree-sitter/provider/tree-sitter-provider";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../src/code-intelligence.ts";
import { clearMockRuntime, registerMockProvider } from "../helpers/register-mock-runtime.ts";

interface TextToolResult {
  content: Array<{ type: string; text: string }>;
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

  it("has query as a required parameter", () => {
    const tool = getCodeFindTool() as {
      parameters?: { required?: string[]; properties?: Record<string, unknown> };
    };

    const props = tool.parameters?.properties;
    expect(props).toBeDefined();
    expect(props).toHaveProperty("query");
    expect(props).toHaveProperty("scope");
    expect(props).toHaveProperty("mode");
    expect(props).toHaveProperty("kind");
    expect(props).toHaveProperty("contextLines");
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

  it("returns an error result when scope is missing", async () => {
    const tool = getCodeFindTool();

    const result = (await tool.execute(
      "test-scope-missing",
      { query: "something", scope: "nonexistent/dir" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as TextToolResult;

    expect(result.content[0].text).toContain("Error");
    expect(result.content[0].text).toContain("Scope");
  });

  describe("strict mode-kind contract", () => {
    it("fails when kind is provided without mode", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "const foo = 1;\n");
      const tool = getCodeFindTool();

      await expect(
        tool.execute(
          "test-kind-without-mode",
          { query: "foo", kind: "definition" },
          undefined,
          undefined,
          makeCtx({ cwd: tmpDir }),
        ),
      ).rejects.toThrow(/code_find/i);
    });

    it("fails when kind is provided in text mode", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "const foo = 1;\n");
      const tool = getCodeFindTool();

      await expect(
        tool.execute(
          "test-kind-in-text-mode",
          { query: "foo", mode: "text", kind: "definition" },
          undefined,
          undefined,
          makeCtx({ cwd: tmpDir }),
        ),
      ).rejects.toThrow(/code_find/i);
    });

    it("fails when kind is provided in regex mode", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "const fooBar = 1;\n");
      const tool = getCodeFindTool();

      await expect(
        tool.execute(
          "test-kind-in-regex-mode",
          { query: "foo[A-Z]", mode: "regex", kind: "definition" },
          undefined,
          undefined,
          makeCtx({ cwd: tmpDir }),
        ),
      ).rejects.toThrow(/code_find/i);
    });

    it("fails when kind is provided in semantic mode", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "const foo = 1;\n");
      const tool = getCodeFindTool();

      await expect(
        tool.execute(
          "test-kind-in-semantic-mode",
          { query: "foo", mode: "semantic", kind: "definition" },
          undefined,
          undefined,
          makeCtx({ cwd: tmpDir }),
        ),
      ).rejects.toThrow(/code_find/i);
    });

    it("fails when ast mode omits kind", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), 'export const foo = "hello";\n');
      const tool = getCodeFindTool();

      await expect(
        tool.execute(
          "test-ast-without-kind",
          { query: "foo", mode: "ast" },
          undefined,
          undefined,
          makeCtx({ cwd: tmpDir }),
        ),
      ).rejects.toThrow(/supported AST kinds|definition.*import.*export.*call/i);
    });

    it.each(["test"] as const)("fails when ast mode uses unsupported kind %s", async (kind) => {
      writeFileSync(path.join(tmpDir, "a.ts"), "function foo() {}\n");
      const tool = getCodeFindTool();

      await expect(
        tool.execute(
          `test-ast-unsupported-${kind}`,
          { query: "foo", mode: "ast", kind },
          undefined,
          undefined,
          makeCtx({ cwd: tmpDir }),
        ),
      ).rejects.toThrow(/code_find/i);
    });
  });

  describe("mode: text and regex", () => {
    it("returns literal matches for a default text query", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "const foo = 1;\nconst bar = 2;");
      writeFileSync(path.join(tmpDir, "b.ts"), "const foo = 3;");
      writeFileSync(path.join(tmpDir, "c.ts"), "const baz = 4;");
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-text-mode",
        { query: "foo" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult;

      const text = result.content[0].text;
      expect(text).toContain("foo");
      expect(text).toContain("a.ts");
      expect(text).toContain("b.ts");
      expect(text).not.toContain("c.ts");
    });

    it("returns regex matches in regex mode", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "const fooBar = 1;\nconst fooBaz = 2;");
      writeFileSync(path.join(tmpDir, "b.ts"), "const barOnly = 3;");
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-regex-mode",
        { query: "foo[A-Z]", mode: "regex" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult;

      const text = result.content[0].text;
      expect(text).toContain("fooBar");
      expect(text).toContain("fooBaz");
      expect(text).not.toContain("barOnly");
    });
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
      )) as TextToolResult;

      expect(result.content[0].text).toContain("foo");
      expect(result.content[0].text).toContain("a.ts");
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

      expect(result.content[0].text).toContain("obj.method");
      expect(result.content[0].text).toContain("a.ts");
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
          { query: "params.query.trim", mode: "ast", kind: "call", scope: "src" },
          undefined,
          undefined,
          makeCtx({ cwd: tmpDir }),
        )) as TextToolResult;

        expect(result.content[0].text).toContain("params.query.trim");
        expect(result.content[0].text).toContain("src/target.ts");
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
        workspaceSymbols: async () => [],
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
      expect(text).toContain("No semantic results found");
      expect(text).not.toContain("fell back to text search");
      expect(text).not.toContain("a.ts");
    });

    it("returns workspace symbols when a semantic provider is available", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "export function myFunc() {}\n");
      registerMockProvider(tmpDir, {
        workspaceSymbols: async () => [
          {
            name: "myFunc",
            kind: "function",
            file: path.join(tmpDir, "a.ts"),
            line: 1,
            character: 17,
          },
        ],
      });
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-semantic-symbols",
        { query: "myFunc", mode: "semantic" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult;

      const text = result.content[0].text;
      expect(text).toContain("myFunc");
      expect(text).toContain("a.ts");
    });

    it("respects scope in semantic mode and normalizes leading @", async () => {
      mkdirSync(path.join(tmpDir, "src"), { recursive: true });
      mkdirSync(path.join(tmpDir, "other"), { recursive: true });
      writeFileSync(path.join(tmpDir, "src/a.ts"), "export function scopedFunc() {}\n");
      writeFileSync(path.join(tmpDir, "other/a.ts"), "export function scopedFunc() {}\n");
      registerMockProvider(tmpDir, {
        workspaceSymbols: async () => [
          {
            name: "scopedFunc",
            kind: "function",
            file: path.join(tmpDir, "src/a.ts"),
            line: 1,
            character: 17,
          },
          {
            name: "scopedFunc",
            kind: "function",
            file: path.join(tmpDir, "other/a.ts"),
            line: 1,
            character: 17,
          },
        ],
      });
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-semantic-scope-filter",
        { query: "scopedFunc", mode: "semantic", scope: "@src" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult;

      const text = result.content[0].text;
      expect(text).toContain("src/a.ts");
      expect(text).not.toContain("other/a.ts");
    });
  });

  describe("mode: scope filtering", () => {
    it("respects the scope parameter in text mode", async () => {
      const subDir = path.join(tmpDir, "sub");
      const { mkdirSync } = await import("node:fs");
      mkdirSync(subDir, { recursive: true });
      writeFileSync(path.join(tmpDir, "root.ts"), "const foo = 1;");
      writeFileSync(path.join(subDir, "nested.ts"), "const bar = 2;");
      const tool = getCodeFindTool();

      const result = (await tool.execute(
        "test-scope-filter",
        { query: "bar", scope: "sub" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as TextToolResult;

      const text = result.content[0].text;
      expect(text).toContain("bar");
      expect(text).toContain("nested.ts");
    });
  });
});
