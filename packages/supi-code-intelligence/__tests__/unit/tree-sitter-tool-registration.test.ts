import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { buildTsToolPromptSurfaces } from "../../src/tree-sitter/guidance.ts";
import { registerTsTools } from "../../src/tree-sitter/register-tools.ts";
import { TS_TOOL_NAMES } from "../../src/tree-sitter/tool-specs.ts";

function setupPi() {
  const tools: Array<{ name: string; description: string; promptGuidelines: string[] }> = [];
  const pi = {
    on: vi.fn(),
    registerTool: vi.fn(
      (tool: { name: string; description: string; promptGuidelines: string[] }) => {
        tools.push(tool);
      },
    ),
    getActiveTools: vi.fn(() => []),
    setActiveTools: vi.fn(),
  } as unknown as ExtensionAPI;
  return { pi, tools };
}

describe("tree-sitter tool registration", () => {
  it("registers all 6 tools from shared specs", () => {
    const { pi, tools } = setupPi();
    registerTsTools(pi, buildTsToolPromptSurfaces());

    expect(tools).toHaveLength(TS_TOOL_NAMES.length);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([...TS_TOOL_NAMES].sort());
  });

  it("each tool has description and guidance", () => {
    const { pi, tools } = setupPi();
    registerTsTools(pi, buildTsToolPromptSurfaces());

    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.promptGuidelines.length).toBeGreaterThanOrEqual(1);
    }
  });
});
