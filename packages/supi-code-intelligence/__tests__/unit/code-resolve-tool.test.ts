/**
 * RED tests for the code_resolve tool.
 *
 * These tests will fail during Phase 1 RED because:
 * - The stub executor returns a generic "not implemented" error instead of real validation
 * - The resolve service does not exist yet
 * - No real resolution yields target IDs
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../src/code-intelligence.ts";
import { executeImpactTool } from "../../src/tool/execute-impact.ts";
import { executeRefactorPlanTool } from "../../src/tool/execute-refactor-plan.ts";
import { clearMockRuntime, registerMockProvider } from "../helpers/register-mock-runtime.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-resolve-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  clearMockRuntime();
});

describe("code_resolve tool", () => {
  it("is registered as an active public tool", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_resolve");

    expect(tool).toBeDefined();
    expect(tool.name).toBe("code_resolve");
    expect(typeof tool.execute).toBe("function");
    expect(tool.parameters).toBeDefined();
  });

  it("rejects missing both query and file with a validation error", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_resolve");

    const result = (await tool.execute(
      "test-1",
      {},
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // Will fail: stub returns "not implemented" error, not validation error
    expect(result.content[0].text).toContain("requires either");
    expect(result.content[0].text).toContain("query");
    expect(result.content[0].text).toContain("file");
  });

  it("rejects line without character with a validation error", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_resolve");

    const result = (await tool.execute(
      "test-2",
      { file: "index.ts", line: 1 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // Will fail: stub returns "not implemented" error
    expect(result.content[0].text).toContain("character");
    expect(result.content[0].text).toContain("line");
  });

  it("rejects character without line with a validation error", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_resolve");

    const result = (await tool.execute(
      "test-3",
      { file: "index.ts", character: 1 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // Will fail: stub returns "not implemented" error
    expect(result.content[0].text).toContain("line");
  });

  it("rejects line/character without file with a validation error", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_resolve");

    const result = (await tool.execute(
      "test-4",
      { line: 1, character: 1 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // When neither query nor file is provided, validation reports
    // "requires either query or file" first.
    expect(result.content[0].text).toContain("requires either");
    expect(result.content[0].text).toContain("query");
    expect(result.content[0].text).toContain("file");
  });

  it("resolves anchored file + line + character to one target with targetId and spanId", async () => {
    writeFileSync(path.join(tmpDir, "index.ts"), "export const foo = 1;\n");

    registerMockProvider(tmpDir);
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_resolve");

    const result = (await tool.execute(
      "test-5",
      { file: "index.ts", line: 1, character: 14 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain("Target ID:");
    expect(result.content[0].text).toContain("Span ID:");
    expect(result.content[0].text).toContain("index.ts");
    expect(result.content[0].text).not.toContain("Next steps");
  });

  it("resolves file-only request to exported targets with target IDs", async () => {
    writeFileSync(
      path.join(tmpDir, "index.ts"),
      ["export const foo = 1;", "export function bar() {}", "export class Baz {}"].join("\n"),
    );

    registerMockProvider(tmpDir, {
      exports: async (_file) => ({
        kind: "success" as const,
        data: [
          {
            name: "foo",
            kind: "const",
            startLine: 1,
            startCharacter: 14,
            endLine: 1,
            endCharacter: 17,
          },
          {
            name: "bar",
            kind: "function",
            startLine: 2,
            startCharacter: 20,
            endLine: 2,
            endCharacter: 23,
          },
          {
            name: "Baz",
            kind: "class",
            startLine: 3,
            startCharacter: 14,
            endLine: 3,
            endCharacter: 17,
          },
        ],
      }),
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_resolve");

    const result = (await tool.execute(
      "test-6",
      { file: "index.ts" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    // Will fail: stub doesn't resolve anything
    expect(result.content[0].text).toContain("foo");
    expect(result.content[0].text).toContain("bar");
    expect(result.content[0].text).toContain("Baz");
    expect(result.content[0].text).toContain("tg-");
  });

  it("prefers semantic document symbols over structural exports for file-only resolve", async () => {
    writeFileSync(
      path.join(tmpDir, "lib.ts"),
      ["export const alpha = 1;", "export function beta() {}"].join("\n"),
    );

    // Structural exports (lower-fidelity — different name so we can tell them apart)
    const structuralExports = [
      {
        name: "alpha_structural",
        kind: "const",
        startLine: 1,
        startCharacter: 14,
        endLine: 1,
        endCharacter: 19,
      },
      {
        name: "beta_structural",
        kind: "function",
        startLine: 2,
        startCharacter: 20,
        endLine: 2,
        endCharacter: 24,
      },
    ];

    // Semantic document symbols (higher-fidelity — real names)
    const semanticSymbols = [
      {
        name: "alpha",
        kind: "Variable",
        file: path.join(tmpDir, "lib.ts"),
        declarationAnchor: { line: 1, character: 14 },
        container: null,
      },
      {
        name: "beta",
        kind: "Function",
        file: path.join(tmpDir, "lib.ts"),
        declarationAnchor: { line: 2, character: 20 },
        container: null,
      },
    ];

    registerMockProvider(tmpDir, {
      exports: async (_file) => ({
        kind: "success" as const,
        data: structuralExports,
      }),
      documentSymbols: async (_file) => semanticSymbols,
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_resolve");

    const result = (await tool.execute(
      "test-6b",
      { file: "lib.ts" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    // Semantic names should appear (not structural ones)
    expect(result.content[0].text).toContain("alpha");
    expect(result.content[0].text).toContain("beta");
    // Structural names with _structural suffix should NOT appear
    expect(result.content[0].text).not.toContain("alpha_structural");
    expect(result.content[0].text).not.toContain("beta_structural");
  });

  it("resolves query-based input via semantic workspace symbols", async () => {
    registerMockProvider(tmpDir, {
      workspaceSymbols: async (_query) => [
        {
          name: "Widget",
          kind: "Class" as const,
          file: path.join(tmpDir, "src/widget.ts"),
          declarationAnchor: { line: 5, character: 1 },
          container: null,
        },
      ],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_resolve");

    const result = (await tool.execute(
      "test-7",
      { query: "Widget" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    // Will fail: stub doesn't resolve anything
    expect(result.content[0].text).toContain("Widget");
    expect(result.content[0].text).toContain("Target ID");
  });

  it("normalizes leading @ in query scope", async () => {
    mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    mkdirSync(path.join(tmpDir, "other"), { recursive: true });
    writeFileSync(path.join(tmpDir, "src/widget.ts"), "export class Widget {}\n");
    writeFileSync(path.join(tmpDir, "other/widget.ts"), "export class Widget {}\n");

    registerMockProvider(tmpDir, {
      workspaceSymbols: async (_query) => [
        {
          name: "Widget",
          kind: "Class" as const,
          file: path.join(tmpDir, "src/widget.ts"),
          declarationAnchor: { line: 5, character: 1 },
          container: null,
        },
        {
          name: "Widget",
          kind: "Class" as const,
          file: path.join(tmpDir, "other/widget.ts"),
          declarationAnchor: { line: 5, character: 1 },
          container: null,
        },
      ],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_resolve");

    const result = (await tool.execute(
      "test-scope-at-prefix",
      { query: "Widget", scope: "@src" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain("src/widget.ts");
    expect(result.content[0].text).not.toContain("other/widget.ts");
    expect(result.content[0].text).toContain("Target ID");
  });

  it("rejects a missing query scope with a hard scope-path error", async () => {
    registerMockProvider(tmpDir, {
      workspaceSymbols: async (_query) => [
        {
          name: "Widget",
          kind: "Class" as const,
          file: path.join(tmpDir, "src/widget.ts"),
          declarationAnchor: { line: 5, character: 1 },
          container: null,
        },
      ],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_resolve");

    const result = (await tool.execute(
      "test-missing-scope",
      { query: "Widget", scope: "missing-dir" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain("Scope path not found");
    expect(result.content[0].text).not.toContain("Symbol not found");
  });

  it("keeps scope as a hard filter instead of surfacing a redundant scope-match ranking label", async () => {
    mkdirSync(path.join(tmpDir, "src/a"), { recursive: true });
    mkdirSync(path.join(tmpDir, "src/b"), { recursive: true });
    mkdirSync(path.join(tmpDir, "other"), { recursive: true });
    writeFileSync(path.join(tmpDir, "src/a/widget.ts"), "export class Widget {}\n");
    writeFileSync(path.join(tmpDir, "src/b/widget.ts"), "export interface Widget {}\n");
    writeFileSync(path.join(tmpDir, "other/widget.ts"), "export class Widget {}\n");

    registerMockProvider(tmpDir, {
      workspaceSymbols: async (_query) => [
        {
          name: "Widget",
          kind: "Class" as const,
          file: path.join(tmpDir, "src/a/widget.ts"),
          declarationAnchor: { line: 5, character: 1 },
          container: null,
        },
        {
          name: "Widget",
          kind: "Interface" as const,
          file: path.join(tmpDir, "src/b/widget.ts"),
          declarationAnchor: { line: 1, character: 1 },
          container: null,
        },
        {
          name: "Widget",
          kind: "Class" as const,
          file: path.join(tmpDir, "other/widget.ts"),
          declarationAnchor: { line: 2, character: 1 },
          container: null,
        },
      ],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_resolve");

    const result = (await tool.execute(
      "test-scope-hard-filter",
      { query: "Widget", scope: "src" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: {
        type: string;
        data: { candidates?: Array<{ file: string; reason: string }> };
      };
    };

    expect(result.content[0].text).toContain("src/a/widget.ts");
    expect(result.content[0].text).toContain("src/b/widget.ts");
    expect(result.content[0].text).not.toContain("other/widget.ts");
    for (const candidate of result.details?.data.candidates ?? []) {
      expect(candidate.reason).not.toContain("scope match");
    }
  });

  it("returns disambiguation candidates with target IDs for ambiguous queries", async () => {
    registerMockProvider(tmpDir, {
      workspaceSymbols: async (_query) => [
        {
          name: "Widget",
          kind: "Class" as const,
          file: path.join(tmpDir, "src/a/widget.ts"),
          declarationAnchor: { line: 5, character: 1 },
          container: null,
        },
        {
          name: "Widget",
          kind: "Interface" as const,
          file: path.join(tmpDir, "src/b/widget.ts"),
          declarationAnchor: { line: 1, character: 1 },
          container: null,
        },
      ],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_resolve");

    const result = (await tool.execute(
      "test-8",
      { query: "Widget" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    // Should not claim a single match when ambiguous
    expect(result.content[0].text).not.toContain("Resolved");
    expect(result.content[0].text).toContain("tg-");
  });

  it("does not fall back to text search for missing semantic query results", async () => {
    registerMockProvider(tmpDir, {
      workspaceSymbols: async (_query) => [],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_resolve");

    const result = (await tool.execute(
      "test-9",
      { query: "NonExistentSymbol" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    // Will fail: stub returns generic error, not a no-fallback message
    expect(result.content[0].text).toContain("not found");
    expect(result.content[0].text).not.toContain("search");
    // Should not mention ripgrep or text search
    expect(result.content[0].text).not.toContain("rg");
    expect(result.content[0].text).not.toContain("ripgrep");
  });

  // ── kind mapping ────────────────────────────────────────────────

  it("resolves with kind: 'symbol' (no filter — allows any LSP kind)", async () => {
    registerMockProvider(tmpDir, {
      workspaceSymbols: async (_query) => [
        {
          name: "myFunc",
          kind: "Function" as const,
          file: path.join(tmpDir, "src/utils.ts"),
          declarationAnchor: { line: 10, character: 1 },
          container: null,
        },
      ],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_resolve");

    const result = (await tool.execute(
      "kind-symbol",
      { query: "myFunc", kind: "symbol" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    // kind: "symbol" must NOT filter out Function-kind results
    expect(result.content[0].text).toContain("myFunc");
    expect(result.content[0].text).toContain("Target ID:");
  });

  it("resolves with kind: 'class' only matches class symbols", async () => {
    registerMockProvider(tmpDir, {
      workspaceSymbols: async (_query) => [
        {
          name: "MyClass",
          kind: "Class" as const,
          file: path.join(tmpDir, "src/cls.ts"),
          declarationAnchor: { line: 3, character: 1 },
          container: null,
        },
        {
          name: "myFunc",
          kind: "Function" as const,
          file: path.join(tmpDir, "src/func.ts"),
          declarationAnchor: { line: 5, character: 1 },
          container: null,
        },
      ],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_resolve");

    const result = (await tool.execute(
      "kind-class",
      { query: "My", kind: "class" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    // class filter should keep MyClass, drop myFunc
    expect(result.content[0].text).toContain("MyClass");
    expect(result.content[0].text).not.toContain("myFunc");
  });

  it("rejects kind: 'command' with an unsupported-kind error", async () => {
    registerMockProvider(tmpDir);

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_resolve");

    const result = (await tool.execute(
      "kind-cmd",
      { query: "anything", kind: "command" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain("Unsupported `kind`");
    expect(result.content[0].text).toContain("command");
  });

  it("rejects kind: 'setting' with an unsupported-kind error", async () => {
    registerMockProvider(tmpDir);

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_resolve");

    const result = (await tool.execute(
      "kind-setting",
      { query: "anything", kind: "setting" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain("Unsupported `kind`");
    expect(result.content[0].text).toContain("setting");
  });

  // ── maxResults with disambiguation ─────────────────────────────────

  // biome-ignore lint/security/noSecrets: false positive on test description string
  it("respects maxResults for disambiguation (maxResults=1)", async () => {
    registerMockProvider(tmpDir, {
      workspaceSymbols: async (_query) => [
        {
          name: "A",
          kind: "Class" as const,
          file: path.join(tmpDir, "a.ts"),
          declarationAnchor: { line: 1, character: 1 },
          container: null,
        },
        {
          name: "A",
          kind: "Class" as const,
          file: path.join(tmpDir, "b.ts"),
          declarationAnchor: { line: 1, character: 1 },
          container: null,
        },
        {
          name: "A",
          kind: "Class" as const,
          file: path.join(tmpDir, "c.ts"),
          declarationAnchor: { line: 1, character: 1 },
          container: null,
        },
      ],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_resolve");

    const result = (await tool.execute(
      "mr-1",
      { query: "A", maxResults: 1 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    // Should be disambiguation (3 ambiguous matches, narrowed to 1)
    expect(result.content[0].text).toContain("Multiple matches");
    // Count the candidate entries: should have exactly 1, not all 3
    const lines = result.content[0].text.split("\n");
    const targetIdLines = lines.filter((l) => l.includes("Target ID:"));
    expect(targetIdLines.length).toBe(1);
  });

  it("respects maxResults for disambiguation (maxResults=3 returns up to 3)", async () => {
    registerMockProvider(tmpDir, {
      workspaceSymbols: async (_query) => [
        {
          name: "B",
          kind: "Class" as const,
          file: path.join(tmpDir, "x.ts"),
          declarationAnchor: { line: 1, character: 1 },
          container: null,
        },
        {
          name: "B",
          kind: "Class" as const,
          file: path.join(tmpDir, "y.ts"),
          declarationAnchor: { line: 1, character: 1 },
          container: null,
        },
        {
          name: "B",
          kind: "Class" as const,
          file: path.join(tmpDir, "z.ts"),
          declarationAnchor: { line: 1, character: 1 },
          container: null,
        },
        {
          name: "B",
          kind: "Class" as const,
          file: path.join(tmpDir, "w.ts"),
          declarationAnchor: { line: 1, character: 1 },
          container: null,
        },
      ],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_resolve");

    const result = (await tool.execute(
      "mr-2",
      { query: "B", maxResults: 3 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    const lines = result.content[0].text.split("\n");
    const targetIdLines = lines.filter((l) => l.includes("Target ID:"));
    expect(targetIdLines.length).toBeLessThanOrEqual(3);
  });
});

describe("code_resolve targetId follow-up", () => {
  it("rejects an unknown targetId with a clear error", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_graph");

    const result = (await tool.execute(
      "fup-1",
      { targetId: "tg-nonexistent" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    // Unknown targetId: workspace has no stored targets
    expect(result.content[0].text).toContain("No targets registered");
    expect(result.content[0].text).toContain("workspace");
  });

  it("resolves and follows up with code_graph using targetId", async () => {
    writeFileSync(path.join(tmpDir, "index.ts"), "export const foo = 1;\n");
    registerMockProvider(tmpDir, {
      exports: async (_file) => ({
        kind: "success" as const,
        data: [
          {
            name: "foo",
            kind: "const",
            startLine: 1,
            startCharacter: 14,
            endLine: 1,
            endCharacter: 17,
          },
        ],
      }),
      references: async (_file, _pos) => [
        {
          uri: `file://${path.join(tmpDir, "index.ts")}`,
          range: {
            start: { line: _pos.line, character: _pos.character },
            end: { line: _pos.line, character: _pos.character + 3 },
          },
        },
      ],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    // Step 1: resolve
    const resolveTool = getTool(pi, "code_resolve");
    const resolveResult = (await resolveTool.execute(
      "fup-2",
      { file: "index.ts", line: 1, character: 14 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: {
        type: string;
        data: { targets: Array<{ targetId: string }> };
      };
    };

    expect(resolveResult.content[0].text).toContain("Target ID:");
    expect(resolveResult.content[0].text).toContain("Span ID:");
    const targetId = resolveResult.details?.data?.targets?.[0]?.targetId;
    expect(targetId).toBeDefined();
    if (!targetId) return;

    // Step 2: use targetId with code_graph — should not error
    const refTool = getTool(pi, "code_graph");
    const refResult = (await refTool.execute(
      "fup-3",
      { targetId },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    // targetId was expanded; no "error" prefix in result
    expect(refResult.content[0].text).not.toContain("**Error");
  });

  it("uses a symbol-resolved targetId for callee follow-up without losing the stronger anchor or symbol name", async () => {
    writeFileSync(
      path.join(tmpDir, "index.ts"),
      ["function foo() { bar(); }", "function bar() {}"].join("\n"),
    );
    registerMockProvider(tmpDir, {
      workspaceSymbols: async () => [
        {
          name: "foo",
          kind: "Function",
          file: path.join(tmpDir, "index.ts"),
          declarationAnchor: { line: 1, character: 1 },
          container: null,
        },
      ],
      documentSymbols: async () => [
        {
          name: "foo",
          kind: "Function",
          file: path.join(tmpDir, "index.ts"),
          declarationAnchor: { line: 1, character: 10 },
          container: null,
        },
      ],
      calleesAt: async (_file, line, character) => {
        if (line === 1 && character === 10) {
          return {
            kind: "success" as const,
            data: {
              enclosingScope: { name: "foo", startLine: 1, endLine: 1 },
              callees: [{ name: "bar", startLine: 1, endLine: 1 }],
            },
          };
        }
        return {
          kind: "unsupported-language" as const,
          file: _file,
          message: `no callees at ${line}:${character}`,
        };
      },
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const graphTool = getTool(pi, "code_graph");

    const anchoredResult = (await graphTool.execute(
      "fup-anchored",
      { file: "index.ts", line: 1, character: 10, relations: ["callees"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    expect(anchoredResult.content[0].text).toContain("bar");
    expect(anchoredResult.content[0].text).not.toContain("Unavailable");

    const resolveTool = getTool(pi, "code_resolve");
    const resolveResult = (await resolveTool.execute(
      "fup-2b",
      { query: "foo", kind: "function" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      details?: {
        data: { targets: Array<{ targetId: string }> };
      };
    };

    const targetId = resolveResult.details?.data?.targets?.[0]?.targetId;
    expect(targetId).toBeDefined();
    if (!targetId) return;

    const targetIdResult = (await graphTool.execute(
      "fup-2c",
      { targetId, relations: ["callees"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    expect(targetIdResult.content[0].text).toContain("bar");
    expect(targetIdResult.content[0].text).toContain("foo");
    expect(targetIdResult.content[0].text).not.toContain("symbol at");
  });

  it("resolves and follows up with the internal affected executor using targetId", async () => {
    writeFileSync(path.join(tmpDir, "index.ts"), "export const foo = 1;\n");
    registerMockProvider(tmpDir, {
      exports: async (_file) => ({
        kind: "success" as const,
        data: [
          {
            name: "foo",
            kind: "const",
            startLine: 1,
            startCharacter: 14,
            endLine: 1,
            endCharacter: 17,
          },
        ],
      }),
      references: async (_file, _pos) => [],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const resolveTool = getTool(pi, "code_resolve");
    const resolveResult = (await resolveTool.execute(
      "fup-4",
      { file: "index.ts", line: 1, character: 14 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { details?: { data: { targets: Array<{ targetId: string }> } } };

    const targetId = resolveResult.details?.data?.targets?.[0]?.targetId;
    expect(targetId).toBeDefined();
    if (!targetId) return;

    const impactResult = await executeImpactTool({ targetId }, { cwd: tmpDir });

    // targetId was expanded; no "Error" prefix
    expect(impactResult.content).not.toContain("**Error");
    expect(impactResult.content).toContain("Impact");
  });

  it("resolves and follows up with the internal refactor-plan executor using targetId", async () => {
    writeFileSync(path.join(tmpDir, "index.ts"), "export const foo = 1;\n");
    registerMockProvider(tmpDir, {
      exports: async (_file) => ({
        kind: "success" as const,
        data: [
          {
            name: "foo",
            kind: "const",
            startLine: 1,
            startCharacter: 14,
            endLine: 1,
            endCharacter: 17,
          },
        ],
      }),
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const resolveTool = getTool(pi, "code_resolve");
    const resolveResult = (await resolveTool.execute(
      "fup-6",
      { file: "index.ts", line: 1, character: 14 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { details?: { data: { targets: Array<{ targetId: string }> } } };

    const targetId = resolveResult.details?.data?.targets?.[0]?.targetId;
    expect(targetId).toBeDefined();
    if (!targetId) return;

    const refPlanResult = await executeRefactorPlanTool(
      { targetId, operation: "rename", newName: "bar" },
      { cwd: tmpDir },
    );

    // Expected: only no LSP provider available, not a targetId error
    expect(refPlanResult.content).toContain("provider");
    expect(refPlanResult.content).not.toContain("not found");
  });
});
