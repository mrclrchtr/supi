import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import treeSitterExtension from "../src/tree-sitter.ts";

type RegisteredTool = { name: string };

describe("supi-tree-sitter smoke", () => {
  it("registers 6 focused tools when loaded", () => {
    const tools: RegisteredTool[] = [];
    const pi = {
      on: vi.fn(),
      registerTool: vi.fn((tool: RegisteredTool) => {
        tools.push(tool);
      }),
    } as unknown as ExtensionAPI;

    treeSitterExtension(pi);

    expect(pi.registerTool).toHaveBeenCalledTimes(6);
    expect(tools.length).toBe(6);
    expect(tools[0]?.name).toBe("tree_sitter_outline");
    expect(tools.map((t) => t.name).sort((a, b) => a.localeCompare(b))).toEqual([
      "tree_sitter_callees",
      "tree_sitter_exports",
      "tree_sitter_imports",
      "tree_sitter_node_at",
      "tree_sitter_outline",
      "tree_sitter_query",
    ]);
  });
});
