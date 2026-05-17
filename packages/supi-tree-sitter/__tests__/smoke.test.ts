import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import treeSitterExtension from "../src/tree-sitter.ts";

type RegisteredTool = { name: string };

describe("supi-tree-sitter smoke", () => {
  it("registers the extension tool when loaded", () => {
    const tools: RegisteredTool[] = [];
    const pi = {
      on: vi.fn(),
      registerTool: vi.fn((tool: RegisteredTool) => {
        tools.push(tool);
      }),
    } as unknown as ExtensionAPI;

    treeSitterExtension(pi);

    expect(pi.registerTool).toHaveBeenCalledOnce();
    expect(tools[0]?.name).toBe("tree_sitter");
  });

  it("the meta-package aggregated extension surface is importable", {
    timeout: 20_000,
  }, async () => {
    const metaExtension = await import("../../supi/src/extension.ts");
    expect(typeof metaExtension.default).toBe("function");
  });
});
