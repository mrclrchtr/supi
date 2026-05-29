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
    // code_* (10) + read/write/edit overrides (3)
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
    expect(props).toHaveProperty("file");
    expect(props).toHaveProperty("maxResults");
  });

  it("no longer registers code_references, code_calls, or code_implementations", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const names = getTools(pi).map((t: { name: string }) => t.name);
    expect(names).not.toContain("code_references");
    expect(names).not.toContain("code_calls");
    expect(names).not.toContain("code_implementations");
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

  it("registers code_find with correct parameter shape", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_find");
    expect(tool).toBeDefined();
    expect(tool.name).toBe("code_find");
    expect(typeof tool.execute).toBe("function");

    const props = (tool as { parameters?: { properties?: Record<string, unknown> } }).parameters
      ?.properties;
    expect(props).toBeDefined();
    expect(props).toHaveProperty("query");
    expect(props).toHaveProperty("scope");
    expect(props).toHaveProperty("mode");
    expect(props).toHaveProperty("kind");
    expect(props).toHaveProperty("contextLines");
    expect(props).toHaveProperty("maxResults");

    // mode enum check
    const modeParam = props?.mode as { enum?: string[] } | undefined;
    expect(modeParam?.enum).toBeDefined();
    expect(modeParam?.enum).toEqual(expect.arrayContaining(["text", "regex", "ast", "semantic"]));
  });

  it("does not register inactive V2 workflow tools (code_context, code_impact, code_refactor, code_apply)", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const names = getTools(pi).map((t: { name: string }) => t.name);
    const inactive = WORKFLOW_CODE_TOOL_NAMES.filter(
      (n) => n !== "code_resolve" && n !== "code_health" && n !== "code_find" && n !== "code_graph",
    );
    for (const name of inactive) {
      expect(names).not.toContain(name);
    }
  });

  it("does not register any lsp_* or tree_sitter_* substrate tools", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const names = getTools(pi).map((t: { name: string }) => t.name);
    const substratePrefixes = ["lsp_", "tree_sitter_"];
    const substrateTools = names.filter((n) =>
      substratePrefixes.some((prefix) => n.startsWith(prefix)),
    );
    expect(substrateTools).toEqual([]);
  });

  it("registers code_health tool", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_health");
    expect(tool).toBeDefined();
    expect(tool.name).toBe("code_health");
    expect(typeof tool.execute).toBe("function");

    const props = (tool as { parameters?: { properties?: Record<string, unknown> } }).parameters
      ?.properties;
    expect(props).toBeDefined();
    expect(props).toHaveProperty("scope");
    expect(props).toHaveProperty("refresh");
    expect(props).toHaveProperty("include");
    expect(props).toHaveProperty("level");
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

    const operationParam = planTool.parameters?.properties?.operation as
      | { enum?: string[] }
      | undefined;
    expect(operationParam?.enum).toEqual(
      expect.arrayContaining([
        "rename_symbol",
        "rename_file",
        "move_file",
        "update_imports",
        "delete_dead_code",
      ]),
    );

    const applyTool = getTool(pi, "code_refactor_apply") as {
      parameters?: { properties?: Record<string, unknown> };
    };
    expect(applyTool).toBeDefined();
    expect(applyTool.parameters?.properties).toHaveProperty("planId");
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
