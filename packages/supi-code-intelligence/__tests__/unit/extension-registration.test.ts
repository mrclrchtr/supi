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

  it("registers code_context with the workflow schema shape while keeping code_brief", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const contextTool = getTool(pi, "code_context");
    const briefTool = getTool(pi, "code_brief");

    expect(contextTool).toBeDefined();
    expect(contextTool.name).toBe("code_context");
    expect(briefTool).toBeDefined();
    expect(briefTool.name).toBe("code_brief");
    expect(typeof contextTool.execute).toBe("function");

    const props = (contextTool as { parameters?: { properties?: Record<string, unknown> } })
      .parameters?.properties;
    expect(props).toBeDefined();
    expect(props).toHaveProperty("task");
    expect(props).toHaveProperty("targetId");
    expect(props).toHaveProperty("scope");
    expect(props).toHaveProperty("budget");
    expect(props).toHaveProperty("include");
    expect(props).toHaveProperty("maxResults");
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
    expect(props).toHaveProperty("changedFiles");
    expect(props).toHaveProperty("baseRef");
    expect(props).toHaveProperty("includeTests");
    expect(props).toHaveProperty("maxResults");
  });

  it("registers all workflow tool names on the public surface", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const names = getTools(pi).map((t: { name: string }) => t.name);
    for (const name of WORKFLOW_CODE_TOOL_NAMES) {
      expect(names).toContain(name);
    }
  });

  it("does not register public compatibility aliases or substrate tools", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const names = getTools(pi).map((t: { name: string }) => t.name);
    expect(names).not.toContain("code_affected");
    expect(names).not.toContain("code_refactor_plan");
    expect(names).not.toContain("code_refactor_apply");

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

    const workflowRefactorTool = getTool(pi, "code_refactor") as {
      parameters?: { properties?: Record<string, unknown> };
    };
    expect(workflowRefactorTool).toBeDefined();
    expect(workflowRefactorTool.parameters?.properties).toHaveProperty("operation");
    expect(workflowRefactorTool.parameters?.properties).toHaveProperty("targetId");
    expect(workflowRefactorTool.parameters?.properties).toHaveProperty("file");
    expect(workflowRefactorTool.parameters?.properties).toHaveProperty("line");
    expect(workflowRefactorTool.parameters?.properties).toHaveProperty("character");
    expect(workflowRefactorTool.parameters?.properties).toHaveProperty("newName");
    expect(workflowRefactorTool.parameters?.properties).toHaveProperty("preview");

    const workflowOperationParam = workflowRefactorTool.parameters?.properties?.operation as
      | { enum?: string[] }
      | undefined;
    expect(workflowOperationParam?.enum).toEqual(
      expect.arrayContaining([
        "rename",
        "rename_symbol",
        "rename_file",
        "move_file",
        "update_imports",
        "delete_dead_code",
      ]),
    );

    const workflowApplyTool = getTool(pi, "code_apply") as {
      parameters?: { properties?: Record<string, unknown> };
    };
    expect(workflowApplyTool).toBeDefined();
    expect(workflowApplyTool.parameters?.properties).toHaveProperty("planId");
    expect(workflowApplyTool.parameters?.properties).toHaveProperty("mode");
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
