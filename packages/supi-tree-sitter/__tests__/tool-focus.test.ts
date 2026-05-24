// RED tests: verify 6 focused tree_sitter tools replace the single mega-tool.
// These will fail until Task 2 implements the split.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import treeSitterExtension from "../src/tree-sitter.ts";

interface RegisteredTool {
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: { properties?: Record<string, unknown> };
  execute: (...args: unknown[]) => unknown;
}

function setupPi(): { pi: ExtensionAPI; tools: RegisteredTool[] } {
  const tools: RegisteredTool[] = [];
  const pi = {
    on: vi.fn(),
    registerTool: vi.fn((tool: RegisteredTool) => {
      tools.push(tool);
    }),
  } as unknown as ExtensionAPI;
  treeSitterExtension(pi);
  return { pi, tools };
}

const EXPECTED_TOOL_NAMES = [
  "tree_sitter_outline",
  "tree_sitter_imports",
  "tree_sitter_exports",
  "tree_sitter_node_at",
  "tree_sitter_query",
  "tree_sitter_callees",
] as const;

describe("tree_sitter focused tools", () => {
  describe("registration", () => {
    it("registers 6 focused tools (not 1 mega-tool)", () => {
      const { pi, tools } = setupPi();
      expect(tools.length).toBe(6);
      for (const name of EXPECTED_TOOL_NAMES) {
        expect(pi.registerTool).toHaveBeenCalledWith(expect.objectContaining({ name }));
      }
    });

    it("does NOT register the old tree_sitter mega-tool", () => {
      const { tools } = setupPi();
      const hasMegaTool = tools.some((t) => t.name === "tree_sitter");
      expect(hasMegaTool).toBe(false);
    });

    it("each tool has label, description, promptSnippet, promptGuidelines, parameters", () => {
      const { tools } = setupPi();
      for (const tool of tools) {
        expect(tool.label).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.promptSnippet).toBeTruthy();
        expect(Array.isArray(tool.promptGuidelines)).toBe(true);
        expect(tool.promptGuidelines?.length).toBeGreaterThan(0);
        expect(tool.parameters).toBeTruthy();
      }
    });
  });

  describe("schemas", () => {
    function getToolSchema(name: string): Record<string, unknown> {
      const { tools } = setupPi();
      const tool = tools.find((t) => t.name === name);
      expect(tool).toBeDefined();
      return tool?.parameters.properties ?? {};
    }

    it("tree_sitter_outline only accepts file", () => {
      const props = getToolSchema("tree_sitter_outline");
      expect(props).not.toHaveProperty("action");
      expect(props).toHaveProperty("file");
      expect(props).not.toHaveProperty("line");
      expect(props).not.toHaveProperty("character");
      expect(props).not.toHaveProperty("query");
    });

    it("tree_sitter_imports only accepts file", () => {
      const props = getToolSchema("tree_sitter_imports");
      expect(props).not.toHaveProperty("action");
      expect(props).toHaveProperty("file");
      expect(props).not.toHaveProperty("line");
      expect(props).not.toHaveProperty("character");
      expect(props).not.toHaveProperty("query");
    });

    it("tree_sitter_exports only accepts file", () => {
      const props = getToolSchema("tree_sitter_exports");
      expect(props).not.toHaveProperty("action");
      expect(props).toHaveProperty("file");
      expect(props).not.toHaveProperty("line");
      expect(props).not.toHaveProperty("character");
      expect(props).not.toHaveProperty("query");
    });

    it("tree_sitter_node_at accepts file, line, character", () => {
      const props = getToolSchema("tree_sitter_node_at");
      expect(props).not.toHaveProperty("action");
      expect(props).toHaveProperty("file");
      expect(props).toHaveProperty("line");
      expect(props).toHaveProperty("character");
      expect(props).not.toHaveProperty("query");
    });

    it("tree_sitter_query accepts file, query", () => {
      const props = getToolSchema("tree_sitter_query");
      expect(props).not.toHaveProperty("action");
      expect(props).toHaveProperty("file");
      expect(props).not.toHaveProperty("line");
      expect(props).not.toHaveProperty("character");
      expect(props).toHaveProperty("query");
    });

    it("tree_sitter_callees accepts file, line, character", () => {
      const props = getToolSchema("tree_sitter_callees");
      expect(props).not.toHaveProperty("action");
      expect(props).toHaveProperty("file");
      expect(props).toHaveProperty("line");
      expect(props).toHaveProperty("character");
      expect(props).not.toHaveProperty("query");
    });
  });

  describe("guidance", () => {
    it("descriptions mention the right capabilities", () => {
      const { tools } = setupPi();
      const find = (name: string) => {
        const t = tools.find((t) => t.name === name);
        if (!t) throw new Error(`Tool ${name} not found`);
        return t;
      };

      expect(find("tree_sitter_outline").description).toMatch(
        /shallow.*(?:JS|JavaScript|TypeScript|structure)/i,
      );
      expect(find("tree_sitter_imports").description).toMatch(/import/i);
      expect(find("tree_sitter_exports").description).toMatch(/export/i);
      expect(find("tree_sitter_node_at").description).toMatch(/(?:syntax|node|ancestry|position)/i);
      expect(find("tree_sitter_query").description).toMatch(/(?:query|pattern|custom|AST)/i);
      expect(find("tree_sitter_callees").description).toMatch(/(?:callee|outgoing|call)/i);
    });

    it("each tool has at least one prompt guideline", () => {
      const { tools } = setupPi();
      for (const tool of tools) {
        expect(tool.promptGuidelines?.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("execute", () => {
    it("each tool has an execute function", () => {
      const { tools } = setupPi();
      for (const tool of tools) {
        expect(typeof tool.execute).toBe("function");
      }
    });
  });
});
