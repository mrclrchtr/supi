import { createPiMock, getTool, getTools } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../src/code-intelligence.ts";
import { CODE_INTELLIGENCE_TOOL_SPECS } from "../../src/tool/tool-specs.ts";
import { WORKFLOW_CODE_TOOL_NAMES } from "../../src/workflow/index.ts";

describe("focused code intelligence tool registration", () => {
  it("registers the focused tool set from shared specs", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tools = getTools(pi);
    // code_* (8) + lsp_* (10) + tree_sitter_* (6) + read/write/edit overrides (3)
    expect(tools.length).toBeGreaterThanOrEqual(CODE_INTELLIGENCE_TOOL_SPECS.length);
    // All code_* tools are present
    for (const spec of CODE_INTELLIGENCE_TOOL_SPECS) {
      expect(tools.find((t) => t.name === spec.name)).toBeDefined();
    }
  });

  it("registers the new high-level code tools (references, calls, implementations, refactor_plan, refactor_apply)", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const newTools = [
      "code_references",
      "code_calls",
      "code_implementations",
      "code_refactor_plan",
      "code_refactor_apply",
    ];

    for (const name of newTools) {
      const tool = getTool(pi, name);
      expect(tool).toBeDefined();
      expect(tool.name).toBe(name);
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("no longer registers code_relations or code_refactor", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const names = getTools(pi).map((t: { name: string }) => t.name);
    expect(names).not.toContain("code_relations");
    expect(names).not.toContain("code_refactor");
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
    expect(kindParam?.enum).toContain("command");
  });

  it("does not register inactive V2 workflow tools (code_context, code_find, code_graph, code_impact, code_refactor, code_apply, code_health)", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const names = getTools(pi).map((t: { name: string }) => t.name);
    const inactive = WORKFLOW_CODE_TOOL_NAMES.filter((n) => n !== "code_resolve");
    for (const name of inactive) {
      expect(names).not.toContain(name);
    }
  });

  it("registers tree_sitter_* expert tools", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tsTools = [
      "tree_sitter_outline",
      "tree_sitter_imports",
      "tree_sitter_exports",
      "tree_sitter_node_at",
      "tree_sitter_query",
      "tree_sitter_callees",
    ];

    for (const name of tsTools) {
      const tool = getTool(pi, name);
      expect(tool).toBeDefined();
      expect(tool.name).toBe(name);
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("registers lsp_* expert tools", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const lspTools = [
      "lsp_hover",
      "lsp_definition",
      "lsp_references",
      "lsp_implementation",
      "lsp_document_symbols",
      "lsp_workspace_symbols",
      "lsp_diagnostics",
      "lsp_rename",
      "lsp_code_actions",
      "lsp_recover",
    ];

    for (const name of lspTools) {
      const tool = getTool(pi, name);
      expect(tool).toBeDefined();
      expect(tool.name).toBe(name);
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("registers refactor_plan and refactor_apply with correct parameter shapes", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const planTool = getTool(pi, "code_refactor_plan") as {
      parameters?: { properties?: Record<string, unknown> };
    };
    expect(planTool).toBeDefined();
    expect(planTool.parameters?.properties).toHaveProperty("operation");
    expect(planTool.parameters?.properties).toHaveProperty("file");
    expect(planTool.parameters?.properties).toHaveProperty("line");
    expect(planTool.parameters?.properties).toHaveProperty("character");
    expect(planTool.parameters?.properties).toHaveProperty("newName");

    const applyTool = getTool(pi, "code_refactor_apply") as {
      parameters?: { properties?: Record<string, unknown> };
    };
    expect(applyTool).toBeDefined();
    expect(applyTool.parameters?.properties).toHaveProperty("planId");
  });

  it("registers regex and kind parameters on code_pattern", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    expect(
      (getTool(pi, "code_pattern") as { parameters?: { properties?: Record<string, unknown> } })
        .parameters?.properties,
    ).toHaveProperty("regex");
    expect(
      (getTool(pi, "code_pattern") as { parameters?: { properties?: Record<string, unknown> } })
        .parameters?.properties,
    ).toHaveProperty("kind");
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

  it("registers /ci-status command", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    expect(pi.commands.has("ci-status")).toBe(true);
  });
});
