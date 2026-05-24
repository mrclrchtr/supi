import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import treeSitterExtension from "../src/tree-sitter.ts";

interface RegisteredTool {
  name: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
}

function setupPi(): RegisteredTool[] {
  const tools: RegisteredTool[] = [];
  const pi = {
    on: vi.fn(),
    registerTool: vi.fn((tool: RegisteredTool) => {
      tools.push(tool);
    }),
  } as unknown as ExtensionAPI;
  treeSitterExtension(pi);
  return tools;
}

describe("tree_sitter focused tool guidance", () => {
  it("registers 6 tools with prompt surfaces", () => {
    const tools = setupPi();
    expect(tools.length).toBe(6);

    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.promptSnippet).toBeTruthy();
      expect(tool.promptGuidelines.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("each tool description mentions its purpose", () => {
    const tools = setupPi();
    const tool = (name: string): RegisteredTool => {
      const t = tools.find((t) => t.name === name);
      if (!t) throw new Error(`Tool ${name} not found`);
      return t;
    };

    expect(tool("tree_sitter_outline").description).toContain("outline");
    expect(tool("tree_sitter_imports").description).toContain("import");
    expect(tool("tree_sitter_exports").description).toContain("export");
    expect(tool("tree_sitter_node_at").description).toContain("node");
    expect(tool("tree_sitter_query").description).toContain("query");
    expect(tool("tree_sitter_callees").description).toContain("callee");
  });

  it("all promptSnippets reference the tool name", () => {
    const tools = setupPi();
    for (const tool of tools) {
      expect(tool.promptSnippet).toContain(tool.name);
    }
  });
});
