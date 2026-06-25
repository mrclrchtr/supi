import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createPiMock, getTool, getTools, makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../src/code-intelligence.ts";
import { CODE_INTELLIGENCE_TOOL_SPECS } from "../../src/tool/tool-specs.ts";
import { WORKFLOW_CODE_TOOL_NAMES } from "../../src/workflow/index.ts";
import { clearMockRuntime, registerMockProvider } from "../helpers/register-mock-runtime.ts";

describe("focused code intelligence tool registration", () => {
  it("registers the focused tool set from shared specs", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tools = getTools(pi);
    // code_* surface + read/write/edit overrides
    expect(tools.length).toBeGreaterThanOrEqual(CODE_INTELLIGENCE_TOOL_SPECS.length);
    // All code_* tools are present
    for (const spec of CODE_INTELLIGENCE_TOOL_SPECS) {
      expect(tools.find((t) => t.name === spec.name)).toBeDefined();
    }
  });

  it("registers the code_graph tool with correct parameter shape", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_graph");
    expect(tool).toBeDefined();
    expect(tool.name).toBe("code_graph");
    expect(typeof tool.execute).toBe("function");

    const props = (tool as { parameters?: { properties?: Record<string, unknown> } }).parameters
      ?.properties;
    expect(props).toBeDefined();
    expect(props).toHaveProperty("targetId");
    expect(props).toHaveProperty("relations");
    expect(JSON.stringify(props?.relations)).toContain("all");
    expect(props).toHaveProperty("file");
    expect(props).toHaveProperty("maxResults");
    // Phase 6: unimplemented no-op params removed from schema
    expect(props).not.toHaveProperty("direction");
    expect(props).not.toHaveProperty("depth");
    expect(props).not.toHaveProperty("maxNodes");
  });

  it("no longer registers code_references, code_calls, or code_implementations", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const names = getTools(pi).map((t: { name: string }) => t.name);
    expect(names).not.toContain("code_references");
    expect(names).not.toContain("code_calls");
    expect(names).not.toContain("code_implementations");
  });

  it("no longer registers code_relations", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const names = getTools(pi).map((t: { name: string }) => t.name);
    expect(names).not.toContain("code_relations");
  });

  it("registers code_resolve as the first active V2 workflow tool", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_resolve");
    expect(tool).toBeDefined();
    expect(tool.name).toBe("code_resolve");
    expect(typeof tool.execute).toBe("function");

    // Schema shape: line/character have minimum: 1, kind is a StringEnum
    const props = (tool as { parameters?: { properties?: Record<string, unknown> } }).parameters
      ?.properties;
    expect(props).toBeDefined();
    const lineParam = props?.line as { minimum?: number } | undefined;
    expect(lineParam?.minimum).toBe(1);
    const charParam = props?.character as { minimum?: number } | undefined;
    expect(charParam?.minimum).toBe(1);
    const kindParam = props?.kind as { enum?: string[] } | undefined;
    expect(kindParam?.enum).toBeDefined();
    expect(kindParam?.enum).toContain("symbol");
    expect(kindParam?.enum).not.toContain("command");
    expect(kindParam?.enum).not.toContain("setting");
  });

  it("registers code_find with the strict runtime contract and aligned metadata", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_find") as {
      name: string;
      execute?: unknown;
      description?: string;
      promptGuidelines?: string[];
      parameters?: { properties?: Record<string, { description?: string; enum?: string[] }> };
    };
    expect(tool).toBeDefined();
    expect(tool.name).toBe("code_find");
    expect(typeof tool.execute).toBe("function");

    const props = tool.parameters?.properties;
    expect(props).toBeDefined();
    expect(props).toHaveProperty("query");
    expect(props).toHaveProperty("scope");
    expect(props).toHaveProperty("mode");
    expect(props).toHaveProperty("kind");
    expect(props).toHaveProperty("contextLines");
    expect(props).toHaveProperty("maxResults");

    const modeParam = props?.mode;
    expect(modeParam?.enum).toBeDefined();
    expect(modeParam?.enum).toEqual(expect.arrayContaining(["text", "regex", "ast", "semantic"]));

    const kindParam = props?.kind;
    expect(tool.description).toContain('mode: "ast"');
    expect(tool.description).toContain("requires `kind`");
    expect(tool.description).toContain("definition");
    expect(tool.description).toContain("import");
    expect(tool.description).toContain("export");
    expect(tool.description).toContain("call");
    expect(tool.description).toContain("does not silently fall back");
    expect(tool.description).toContain("not by symbol identity");
    expect(tool.description).not.toContain("advisory-only");

    const guidanceText = tool.promptGuidelines?.join("\n") ?? "";
    expect(guidanceText).toContain('code_find with `mode: "ast"` requires `kind`');
    expect(guidanceText).toContain('code_find with `mode: "semantic"` does not fall back');
    expect(guidanceText).toContain(
      'code_find with `mode: "text"`, `mode: "regex"`, or `mode: "semantic"` does not accept `kind`',
    );
    expect(guidanceText).toContain("symbol-identity-aware callers");
    expect(guidanceText).not.toContain("kind is ignored");
    expect(guidanceText).not.toContain("call-site matching via ripgrep");

    expect(modeParam?.description).toContain('mode: "ast" requires `kind`');
    expect(kindParam?.description).toContain('Only valid with `mode: "ast"`');
    expect(kindParam?.description).toContain("definition");
    expect(kindParam?.description).toContain("import");
    expect(kindParam?.description).toContain("export");
    expect(kindParam?.description).toContain("call");
    expect(kindParam?.description).toContain("type");
    expect(kindParam?.description).toContain("interface");
    expect(kindParam?.description).toContain("not by symbol identity");

    expect(kindParam?.enum).toBeDefined();
    expect(kindParam?.enum).toEqual([
      "definition",
      "import",
      "export",
      "call",
      "type",
      "interface",
      "class",
      "method",
      "enum",
      "test",
    ]);
  });

  it("registers code_inspect as the factual point-inspection tool", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_inspect");
    expect(tool).toBeDefined();
    expect(tool.name).toBe("code_inspect");
    expect(typeof tool.execute).toBe("function");

    const props = (tool as { parameters?: { properties?: Record<string, unknown> } }).parameters
      ?.properties;
    expect(props).toBeDefined();
    expect(props).toHaveProperty("file");
    expect(props).toHaveProperty("line");
    expect(props).toHaveProperty("character");
    expect(props).toHaveProperty("maxResults");
    expect(props).not.toHaveProperty("targetId");
    expect(props).not.toHaveProperty("symbol");
    expect(props).not.toHaveProperty("path");
  });

  it("registers code_orientation with the workflow schema shape (code_brief removed from public surface)", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const contextTool = getTool(pi, "code_orientation");

    expect(contextTool).toBeDefined();
    expect(contextTool.name).toBe("code_orientation");
    expect(typeof contextTool.execute).toBe("function");

    // code_brief should NOT be registered on the public surface
    const toolNames = getTools(pi).map((t: { name: string }) => t.name);
    expect(toolNames).not.toContain("code_brief");

    const props = (contextTool as { parameters?: { properties?: Record<string, unknown> } })
      .parameters?.properties;
    expect(props).toBeDefined();
    expect(props).toHaveProperty("focus");
    expect(props).toHaveProperty("targetId");
    expect(props).toHaveProperty("line");
    expect(props).toHaveProperty("character");
    expect(props).toHaveProperty("maxResults");
    expect(props).not.toHaveProperty("task");
    expect(props).not.toHaveProperty("scope");
    expect(props).not.toHaveProperty("budget");
    expect(props).not.toHaveProperty("include");
  });

  it("registers code_impact as the active workflow impact tool", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const impactTool = getTool(pi, "code_impact");

    expect(impactTool).toBeDefined();
    expect(impactTool.name).toBe("code_impact");
    expect(typeof impactTool.execute).toBe("function");

    const props = (impactTool as { parameters?: { properties?: Record<string, unknown> } })
      .parameters?.properties;
    expect(props).toBeDefined();
    expect(props).toHaveProperty("targetId");
    expect(props).toHaveProperty("change");
    expect(props).toHaveProperty("changeSetFiles");
    expect(props).toHaveProperty("includeTests");
    expect(props).toHaveProperty("maxResults");

    const includeTestsParam = props?.includeTests as { description?: string } | undefined;
    expect(includeTestsParam?.description).toContain(
      "changeSetFiles analysis uses semantic references",
    );
    expect(includeTestsParam?.description).not.toContain("no LSP/TS");
  });

  it("registers all workflow tool names on the public surface", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const names = getTools(pi).map((t: { name: string }) => t.name);
    for (const name of WORKFLOW_CODE_TOOL_NAMES) {
      expect(names).toContain(name);
    }
    expect(names).toContain("code_inspect");
  });

  it("does not register public compatibility aliases or substrate tools", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const names = getTools(pi).map((t: { name: string }) => t.name);
    expect(names).not.toContain("code_affected");

    const substratePrefixes = ["lsp_", "tree_sitter_"];
    const substrateTools = names.filter((n) =>
      substratePrefixes.some((prefix) => n.startsWith(prefix)),
    );
    expect(substrateTools).toEqual([]);
  });

  it("registers code_health tool", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_health") as {
      name: string;
      execute?: unknown;
      description?: string;
      promptSnippet?: string;
      promptGuidelines?: string[];
      parameters?: { properties?: Record<string, unknown> };
    };
    expect(tool).toBeDefined();
    expect(tool.name).toBe("code_health");
    expect(typeof tool.execute).toBe("function");

    const props = tool.parameters?.properties;
    expect(props).toBeDefined();
    expect(props).toHaveProperty("scope");
    expect(props).toHaveProperty("refresh");
    expect(props).toHaveProperty("include");
    expect(props).toHaveProperty("level");

    expect(tool.description).toContain("coverage");
    expect(tool.description).toContain("unused");
    expect(tool.promptSnippet).toContain("coverage");
    expect(tool.promptGuidelines?.join("\n")).toContain("coverage");
    expect(tool.promptGuidelines?.join("\n")).toContain("unused");
  });

  it("registers refactor workflow tools with correct parameter shapes", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const workflowRefactorTool = getTool(pi, "code_refactor_plan") as {
      parameters?: { properties?: Record<string, unknown> };
    };
    expect(workflowRefactorTool).toBeDefined();
    expect(workflowRefactorTool.parameters?.properties).toHaveProperty("operation");
    expect(workflowRefactorTool.parameters?.properties).toHaveProperty("targetId");
    expect(workflowRefactorTool.parameters?.properties).toHaveProperty("file");
    expect(workflowRefactorTool.parameters?.properties).toHaveProperty("line");
    expect(workflowRefactorTool.parameters?.properties).toHaveProperty("character");
    expect(workflowRefactorTool.parameters?.properties).toHaveProperty("range");
    expect(workflowRefactorTool.parameters?.properties).toHaveProperty("newName");
    expect(workflowRefactorTool.parameters?.properties).not.toHaveProperty("preview");

    const workflowOperationParam = workflowRefactorTool.parameters?.properties?.operation as
      | { enum?: string[] }
      | undefined;
    expect(workflowOperationParam?.enum).toEqual([
      "rename",
      "rename_symbol",
      "extract_function",
      "extract_variable",
    ]);

    const workflowApplyTool = getTool(pi, "code_refactor_apply") as {
      parameters?: { properties?: Record<string, unknown> };
    };
    expect(workflowApplyTool).toBeDefined();
    expect(workflowApplyTool.parameters?.properties).toHaveProperty("planId");
    expect(workflowApplyTool.parameters?.properties).not.toHaveProperty("mode");
  });

  it("registered-tool smoke test covers graph all, resolve missing scope, and renamed refactor tools", async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "ci-registration-"));
    writeFileSync(path.join(tmpDir, "test.ts"), "export function foo() { return 1; }\n");
    registerMockProvider(tmpDir, {
      references: async () => [
        {
          uri: `file://${path.join(tmpDir, "test.ts")}`,
          range: {
            start: { line: 0, character: 16 },
            end: { line: 0, character: 19 },
          },
        },
      ],
    });

    try {
      const pi = createPiMock();
      codeIntelligenceExtension(pi as never);

      const graphTool = getTool(pi, "code_graph") as {
        parameters?: { properties?: Record<string, unknown> };
        execute: (...args: unknown[]) => Promise<{ content: Array<{ text: string }> }>;
      };
      const resolveTool = getTool(pi, "code_resolve") as {
        execute: (...args: unknown[]) => Promise<{ content: Array<{ text: string }> }>;
      };

      expect(getTool(pi, "code_refactor_plan")).toBeDefined();
      expect(getTool(pi, "code_refactor_apply")).toBeDefined();
      expect(JSON.stringify(graphTool.parameters?.properties?.relations)).toContain("all");

      const graphResult = await graphTool.execute(
        "smoke-graph-all",
        { file: "test.ts", line: 1, character: 17, relations: ["all"] },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      );
      expect(graphResult.content[0].text).not.toContain("Unknown relation: all");

      const resolveResult = await resolveTool.execute(
        "smoke-missing-scope",
        { query: "foo", scope: "missing-dir" },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      );
      expect(resolveResult.content[0].text).toContain("Scope path not found");
    } finally {
      clearMockRuntime();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("session lifecycle", () => {
  it("registers session_start handler", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    expect(pi.handlers.has("session_start")).toBe(true);
  });

  it("registers before_agent_start handler", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    expect(pi.handlers.has("before_agent_start")).toBe(true);
  });

  it("registers context handler for lsp-context pruning", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    expect(pi.handlers.has("context")).toBe(true);
  });

  it("registers tool_result handler for workspace recovery", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    expect(pi.handlers.has("tool_result")).toBe(true);
  });

  it("registers session_shutdown handler", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    expect(pi.handlers.has("session_shutdown")).toBe(true);
  });

  it("registers /supi-ci-status command", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    expect(pi.commands.has("supi-ci-status")).toBe(true);
  });
});
