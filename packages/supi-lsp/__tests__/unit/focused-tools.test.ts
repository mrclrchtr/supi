// RED tests: verify 6 focused LSP tools replace lsp_lookup and lsp_refactor mega-tools.
// These will fail until Tasks 5-6 implement the split.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import lspExtension from "../../src/lsp.ts";

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
    registerCommand: vi.fn(),
    registerMessageRenderer: vi.fn(),
    getActiveTools: vi.fn(() => []),
    setActiveTools: vi.fn(),
    appendEntry: vi.fn(),
  } as unknown as ExtensionAPI;
  lspExtension(pi);
  return { pi, tools };
}

// The 6 new focused tools
const NEW_TOOL_NAMES = [
  "lsp_hover",
  "lsp_definition",
  "lsp_references",
  "lsp_implementation",
  "lsp_rename",
  "lsp_code_actions",
] as const;

// The old mega-tool names that should be REMOVED
const _OLD_TOOL_NAMES = ["lsp_lookup", "lsp_refactor"];

// Tools that should remain unchanged
const STABLE_TOOL_NAMES = [
  "lsp_document_symbols",
  "lsp_workspace_symbols",
  "lsp_diagnostics",
  "lsp_recover",
];

describe("LSP focused tools", () => {
  describe("registration", () => {
    it("registers the 6 new focused tools (plus 4 existing stable tools = 10 total)", () => {
      const { pi, tools } = setupPi();
      const registeredNames = tools.map((t) => t.name);

      // Check all new tools are registered
      for (const name of NEW_TOOL_NAMES) {
        expect(registeredNames).toContain(name);
      }

      // Check stable tools are still registered
      for (const name of STABLE_TOOL_NAMES) {
        expect(registeredNames).toContain(name);
      }
    });

    it("does NOT register the old lsp_lookup mega-tool", () => {
      const { tools } = setupPi();
      const registeredNames = tools.map((t) => t.name);
      expect(registeredNames).not.toContain("lsp_lookup");
    });

    it("does NOT register the old lsp_refactor mega-tool", () => {
      const { tools } = setupPi();
      const registeredNames = tools.map((t) => t.name);
      expect(registeredNames).not.toContain("lsp_refactor");
    });
  });

  describe("schemas", () => {
    const { tools } = setupPi();
    const tool = (name: string) => tools.find((t) => t.name === name);

    it("lsp_hover schema has file, line, character (no kind, no newName)", () => {
      const props = tool("lsp_hover")?.parameters.properties ?? {};
      expect(props).toHaveProperty("file");
      expect(props).toHaveProperty("line");
      expect(props).toHaveProperty("character");
      expect(props).not.toHaveProperty("kind");
      expect(props).not.toHaveProperty("newName");
    });

    it("lsp_definition schema has file, line, character (no kind)", () => {
      const props = tool("lsp_definition")?.parameters.properties ?? {};
      expect(props).toHaveProperty("file");
      expect(props).toHaveProperty("line");
      expect(props).toHaveProperty("character");
      expect(props).not.toHaveProperty("kind");
    });

    it("lsp_references schema has file, line, character (no kind)", () => {
      const props = tool("lsp_references")?.parameters.properties ?? {};
      expect(props).toHaveProperty("file");
      expect(props).toHaveProperty("line");
      expect(props).toHaveProperty("character");
      expect(props).not.toHaveProperty("kind");
    });

    it("lsp_implementation schema has file, line, character (no kind)", () => {
      const props = tool("lsp_implementation")?.parameters.properties ?? {};
      expect(props).toHaveProperty("file");
      expect(props).toHaveProperty("line");
      expect(props).toHaveProperty("character");
      expect(props).not.toHaveProperty("kind");
    });

    it("lsp_rename schema has file, line, character, newName (no kind)", () => {
      const props = tool("lsp_rename")?.parameters.properties ?? {};
      expect(props).toHaveProperty("file");
      expect(props).toHaveProperty("line");
      expect(props).toHaveProperty("character");
      expect(props).toHaveProperty("newName");
      expect(props).not.toHaveProperty("kind");
    });

    it("lsp_code_actions schema has file, line, character (no kind, no newName)", () => {
      const props = tool("lsp_code_actions")?.parameters.properties ?? {};
      expect(props).toHaveProperty("file");
      expect(props).toHaveProperty("line");
      expect(props).toHaveProperty("character");
      expect(props).not.toHaveProperty("kind");
      expect(props).not.toHaveProperty("newName");
    });
  });

  describe("guidance", () => {
    const { tools } = setupPi();
    const tool = (name: string) => tools.find((t) => t.name === name);

    it("lsp_hover description mentions type/symbol information", () => {
      expect(tool("lsp_hover")?.description).toMatch(
        /semantic.*(?:type|symbol|hover)|hover.*(?:type|semantic)/i,
      );
    });

    it("lsp_definition description mentions navigation or definition", () => {
      expect(tool("lsp_definition")?.description).toMatch(/definition|navigation/i);
    });

    it("lsp_references description mentions references or call sites", () => {
      expect(tool("lsp_references")?.description).toMatch(/reference/i);
    });

    it("lsp_implementation description mentions implementation", () => {
      expect(tool("lsp_implementation")?.description).toMatch(/implementation|implements/i);
    });

    it("lsp_rename description mentions rename", () => {
      expect(tool("lsp_rename")?.description).toMatch(/rename/i);
    });

    it("lsp_code_actions description mentions code actions or fixes", () => {
      expect(tool("lsp_code_actions")?.description).toMatch(/code.?action|fix|refactor/i);
    });
  });

  describe("execute", () => {
    const { tools } = setupPi();

    it("each new focused tool has an execute function", () => {
      for (const name of NEW_TOOL_NAMES) {
        const t = tools.find((tool) => tool.name === name);
        expect(t).toBeDefined();
        expect(typeof t?.execute).toBe("function");
      }
    });
  });
});
