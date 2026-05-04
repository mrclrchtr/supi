import { describe, expect, it, vi } from "vitest";
import type { LspManager } from "../src/manager/manager.ts";
import { executeAction } from "../src/tool-actions.ts";

describe("workspace_symbol action", () => {
  it("returns unsupported message when no server supports workspace symbols", async () => {
    const manager = {
      getCwd: vi.fn().mockReturnValue("/project"),
      workspaceSymbol: vi.fn().mockResolvedValue(null),
    } as unknown as LspManager;

    const result = await executeAction(manager, {
      action: "workspace_symbol",
      query: "test",
    });
    expect(result).toContain("not supported");
  });

  it("returns no symbols message when server supports but query returns empty", async () => {
    const manager = {
      getCwd: vi.fn().mockReturnValue("/project"),
      workspaceSymbol: vi.fn().mockResolvedValue([]),
    } as unknown as LspManager;

    const result = await executeAction(manager, {
      action: "workspace_symbol",
      query: "nonexistent",
    });
    expect(result).toContain("No symbols found");
  });
});
