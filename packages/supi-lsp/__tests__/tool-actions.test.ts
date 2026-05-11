import { describe, expect, it, vi } from "vitest";
import type { LspManager } from "../src/manager/manager.ts";
import { executeAction, safeExecuteAction } from "../src/tool-actions.ts";

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

describe("safeExecuteAction", () => {
  it("returns descriptive string when executeAction throws unexpectedly", async () => {
    const manager = {
      getCwd: vi.fn().mockImplementation(() => {
        throw new Error("unexpected internal error");
      }),
    } as unknown as LspManager;

    const result = await safeExecuteAction(manager, {
      action: "hover",
      file: "src/index.ts",
      line: 1,
      character: 1,
    });

    expect(result).toBe("LSP action failed: unexpected internal error");
  });

  it("returns the normal result when executeAction succeeds", async () => {
    const manager = {
      getCwd: vi.fn().mockReturnValue("/repo"),
      ensureFileOpen: vi.fn().mockResolvedValue({
        hover: vi.fn().mockResolvedValue({
          contents: [{ kind: "markdown", value: "**Info:** test" }],
        }),
      }),
    } as unknown as LspManager;

    const result = await safeExecuteAction(manager, {
      action: "hover",
      file: "src/index.ts",
      line: 1,
      character: 1,
    });

    expect(result).toContain("Info:");
  });

  it("wraps non-Error throws in a descriptive message", async () => {
    const manager = {
      getCwd: vi.fn().mockImplementation(() => {
        // eslint-disable-next-line no-throw-literal
        throw "string error";
      }),
    } as unknown as LspManager;

    const result = await safeExecuteAction(manager, {
      action: "hover",
      file: "src/index.ts",
      line: 1,
      character: 1,
    });

    expect(result).toBe("LSP action failed: string error");
  });
});
