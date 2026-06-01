/**
 * Tests for the code_find tool.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../src/code-intelligence.ts";
import { clearMockRuntime, registerMockProvider } from "../helpers/register-mock-runtime.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-find-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  clearMockRuntime();
});

describe("code_find tool", () => {
  it("is registered as an active public tool", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_find");

    expect(tool).toBeDefined();
    expect(tool.name).toBe("code_find");
    expect(typeof tool.execute).toBe("function");
    expect(tool.parameters).toBeDefined();
  });

  it("has query as a required parameter", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_find") as {
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

  it("rejects empty query with an error", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_find");

    const result = (await tool.execute(
      "test-empty-query",
      { query: "" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("Error");
    expect(result.content[0].text).toContain("query");
  });

  it("returns error for scope not found", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_find");

    const result = (await tool.execute(
      "test-scope-missing",
      { query: "something", scope: "nonexistent/dir" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("Error");
    expect(result.content[0].text).toContain("Scope");
  });

  describe("mode: text (default)", () => {
    it("returns literal matches for a query", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "const foo = 1;\nconst bar = 2;");
      writeFileSync(path.join(tmpDir, "b.ts"), "const foo = 3;");
      writeFileSync(path.join(tmpDir, "c.ts"), "const baz = 4;");

      const pi = createPiMock();
      codeIntelligenceExtension(pi as never);
      const tool = getTool(pi, "code_find");

      const result = (await tool.execute(
        "test-text-mode",
        { query: "foo" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as {
        content: Array<{ type: string; text: string }>;
      };

      const text = result.content[0].text;
      expect(text).toContain("foo");
      expect(text).toContain("a.ts");
      expect(text).toContain("b.ts");
      // c.ts does not contain foo
      expect(text).not.toContain("c.ts");
    });

    it("appends advisory note when kind is set in text mode", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "const foo = 1;");

      const pi = createPiMock();
      codeIntelligenceExtension(pi as never);
      const tool = getTool(pi, "code_find");

      const result = (await tool.execute(
        "test-text-kind",
        { query: "foo", kind: "definition" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as {
        content: Array<{ type: string; text: string }>;
      };

      const text = result.content[0].text;
      // Should still return matches
      expect(text).toContain("foo");
      expect(text).toContain("a.ts");
      // Should include advisory-only note
      expect(text).toContain("advisory-only");
    });
  });

  describe("mode: regex", () => {
    it("returns regex matches", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "const fooBar = 1;\nconst fooBaz = 2;");
      writeFileSync(path.join(tmpDir, "b.ts"), "const barOnly = 3;");

      const pi = createPiMock();
      codeIntelligenceExtension(pi as never);
      const tool = getTool(pi, "code_find");

      const result = (await tool.execute(
        "test-regex-mode",
        { query: "foo[A-Z]", mode: "regex" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as {
        content: Array<{ type: string; text: string }>;
      };

      const text = result.content[0].text;
      expect(text).toContain("fooBar");
      expect(text).toContain("fooBaz");
      expect(text).not.toContain("barOnly");
    });

    it("does not match when query has no regex chars in text mode", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "const fooBar = 1;");

      const pi = createPiMock();
      codeIntelligenceExtension(pi as never);
      const tool = getTool(pi, "code_find");

      // In default text mode, "foo[A-Z]" is a literal search
      const result = (await tool.execute(
        "test-text-literal-regex",
        { query: "foo[A-Z]" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as {
        content: Array<{ type: string; text: string }>;
      };

      const text = result.content[0].text;
      // Literal search for "foo[A-Z]" should not match "fooBar"
      expect(text).toContain("No matches found");
      expect(text).toContain("regex");
    });
  });

  describe("mode: ast", () => {
    it("returns unavailable when no structural provider", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), 'export const foo = "hello";');

      const pi = createPiMock();
      codeIntelligenceExtension(pi as never);
      const tool = getTool(pi, "code_find");

      const result = (await tool.execute(
        "test-ast-no-provider",
        { query: "foo", mode: "ast", kind: "definition" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as {
        content: Array<{ type: string; text: string }>;
      };

      const text = result.content[0].text;
      expect(text).toContain("Error");
    });

    it("finds call sites for kind call in ast mode", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "function foo() {}\nconst x = foo();\n");

      const pi = createPiMock();
      codeIntelligenceExtension(pi as never);
      const tool = getTool(pi, "code_find");

      const result = (await tool.execute(
        "test-ast-kind-call",
        { query: "foo", mode: "ast", kind: "call" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as {
        content: Array<{ type: string; text: string }>;
      };

      const text = result.content[0].text;
      // Should find the call site: `foo()` on line 2
      expect(text).not.toContain("Not yet implemented");
      expect(text).toContain("foo");
    });

    it("does not match declarations as call sites", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "function foo() {}\n");

      const pi = createPiMock();
      codeIntelligenceExtension(pi as never);
      const tool = getTool(pi, "code_find");

      const result = (await tool.execute(
        "test-ast-call-no-sites",
        { query: "foo", mode: "ast", kind: "call" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as {
        content: Array<{ type: string; text: string }>;
      };

      const text = result.content[0].text;
      // No call sites — should report no matches
      expect(text).toContain("No"); // "No matches" or similar
    });

    it("returns not-yet-implemented for kind type in ast mode", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "type Foo = string;\n");

      const pi = createPiMock();
      codeIntelligenceExtension(pi as never);
      const tool = getTool(pi, "code_find");

      const result = (await tool.execute(
        "test-ast-kind-type",
        { query: "Foo", mode: "ast", kind: "type" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as {
        content: Array<{ type: string; text: string }>;
      };

      const text = result.content[0].text;
      expect(text).toContain("Not yet implemented");
      expect(text).toContain("type");
    });

    it("returns not-yet-implemented for kind test in ast mode", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "function testFoo() {}\n");

      const pi = createPiMock();
      codeIntelligenceExtension(pi as never);
      const tool = getTool(pi, "code_find");

      const result = (await tool.execute(
        "test-ast-kind-test",
        { query: "test", mode: "ast", kind: "test" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as {
        content: Array<{ type: string; text: string }>;
      };

      const text = result.content[0].text;
      expect(text).toContain("Not yet implemented");
      expect(text).toContain("test");
    });
  });

  describe("mode: semantic", () => {
    it("falls back to text search when no LSP provider", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "const foo = 1;");

      const pi = createPiMock();
      codeIntelligenceExtension(pi as never);
      const tool = getTool(pi, "code_find");

      const result = (await tool.execute(
        "test-semantic-fallback",
        { query: "foo", mode: "semantic" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as {
        content: Array<{ type: string; text: string }>;
      };

      const text = result.content[0].text;
      // Should fall back to text search
      expect(text).toContain("foo");
      expect(text).toContain("a.ts");
      // Should include fallback note
      expect(text).toContain("fell back to text search");
    });

    it("returns workspace symbols when LSP provider is available", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "export function myFunc() {}");

      const pi = createPiMock();
      codeIntelligenceExtension(pi as never);

      // Register a mock semantic provider with workspaceSymbols
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

      const tool = getTool(pi, "code_find");

      const result = (await tool.execute(
        "test-semantic-symbols",
        { query: "myFunc", mode: "semantic" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as {
        content: Array<{ type: string; text: string }>;
      };

      const text = result.content[0].text;
      // Should show the symbol result
      expect(text).toContain("myFunc");
    });

    it("does not error for kind call in semantic mode (falls back to text)", async () => {
      writeFileSync(path.join(tmpDir, "a.ts"), "const foo = 1;\n");

      const pi = createPiMock();
      codeIntelligenceExtension(pi as never);
      const tool = getTool(pi, "code_find");

      const result = (await tool.execute(
        "test-semantic-kind-call",
        { query: "foo", mode: "semantic", kind: "call" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as {
        content: Array<{ type: string; text: string }>;
      };

      const text = result.content[0].text;
      expect(text).not.toContain("not yet implemented");
      expect(text).toContain("fell back to text search");
    });
  });

  describe("mode: scope filtering", () => {
    it("respects the scope parameter in text mode", async () => {
      const subDir = path.join(tmpDir, "sub");
      const { mkdirSync } = await import("node:fs");
      mkdirSync(subDir, { recursive: true });
      writeFileSync(path.join(tmpDir, "root.ts"), "const foo = 1;");
      writeFileSync(path.join(subDir, "nested.ts"), "const bar = 2;");

      const pi = createPiMock();
      codeIntelligenceExtension(pi as never);
      const tool = getTool(pi, "code_find");

      const result = (await tool.execute(
        "test-scope-filter",
        { query: "bar", scope: "sub" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as {
        content: Array<{ type: string; text: string }>;
      };

      const text = result.content[0].text;
      expect(text).toContain("bar");
      expect(text).toContain("nested.ts");
    });
  });
});
