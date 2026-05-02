import { describe, expect, it, vi } from "vitest";
import type { LspManager } from "../manager.ts";
import { executeAction } from "../tool-actions.ts";

function makeManager(): LspManager {
  return {
    getCwd: vi.fn().mockReturnValue("/project"),
    ensureFileOpen: vi.fn().mockResolvedValue(null),
    workspaceSymbol: vi.fn().mockResolvedValue(null),
    getDiagnosticSummary: vi.fn().mockReturnValue([]),
  } as unknown as LspManager;
}

describe("tool action validation", () => {
  it("hover: returns validation error when line is missing", async () => {
    const manager = makeManager();
    const result = await executeAction(manager, { action: "hover", file: "src/index.ts" });
    expect(result).toContain("Validation error");
    expect(result).toContain("'line' is required");
  });

  it("hover: returns validation error when character is missing", async () => {
    const manager = makeManager();
    const result = await executeAction(manager, { action: "hover", file: "src/index.ts", line: 1 });
    expect(result).toContain("Validation error");
    expect(result).toContain("'character' is required");
  });

  it("hover: returns validation error when line is not a positive integer", async () => {
    const manager = makeManager();
    const result = await executeAction(manager, {
      action: "hover",
      file: "src/index.ts",
      line: 0,
      character: 1,
    });
    expect(result).toContain("Validation error");
    expect(result).toContain("'line' must be a positive 1-based integer");
  });

  it("hover: returns validation error when character is not a positive integer", async () => {
    const manager = makeManager();
    const result = await executeAction(manager, {
      action: "hover",
      file: "src/index.ts",
      line: 1,
      character: -1,
    });
    expect(result).toContain("Validation error");
    expect(result).toContain("'character' must be a positive 1-based integer");
  });

  it("definition: returns validation error when file is missing", async () => {
    const manager = makeManager();
    const result = await executeAction(manager, { action: "definition", line: 1, character: 1 });
    expect(result).toContain("Validation error");
    expect(result).toContain("'file' is required");
  });

  it("references: returns validation error for missing parameters", async () => {
    const manager = makeManager();
    const result = await executeAction(manager, { action: "references", file: "src/index.ts" });
    expect(result).toContain("Validation error");
  });

  it("symbols: returns validation error when file is missing", async () => {
    const manager = makeManager();
    const result = await executeAction(manager, { action: "symbols" });
    expect(result).toContain("Validation error");
    expect(result).toContain("'file' is required");
  });

  it("rename: returns validation error when newName is missing", async () => {
    const manager = makeManager();
    const result = await executeAction(manager, {
      action: "rename",
      file: "src/index.ts",
      line: 1,
      character: 1,
    });
    expect(result).toContain("Validation error");
    expect(result).toContain("'newName' is required");
  });

  it("rename: returns validation error when newName is empty", async () => {
    const manager = makeManager();
    const result = await executeAction(manager, {
      action: "rename",
      file: "src/index.ts",
      line: 1,
      character: 1,
      newName: "   ",
    });
    expect(result).toContain("Validation error");
    expect(result).toContain("'newName' is required");
  });

  it("code_actions: returns validation error for missing parameters", async () => {
    const manager = makeManager();
    const result = await executeAction(manager, { action: "code_actions", file: "src/index.ts" });
    expect(result).toContain("Validation error");
  });

  it("workspace_symbol: returns validation error when query is missing", async () => {
    const manager = makeManager();
    const result = await executeAction(manager, { action: "workspace_symbol" });
    expect(result).toContain("Validation error");
    expect(result).toContain("'query' is required");
  });

  it("workspace_symbol: returns validation error when query is empty", async () => {
    const manager = makeManager();
    const result = await executeAction(manager, {
      action: "workspace_symbol",
      query: "   ",
    });
    expect(result).toContain("Validation error");
    expect(result).toContain("'query' is required");
  });

  it("search: returns validation error when query is missing", async () => {
    const manager = makeManager();
    const result = await executeAction(manager, { action: "search" });
    expect(result).toContain("Validation error");
    expect(result).toContain("'query' is required");
  });

  it("symbol_hover: returns validation error when symbol is missing", async () => {
    const manager = makeManager();
    const result = await executeAction(manager, { action: "symbol_hover" });
    expect(result).toContain("Validation error");
    expect(result).toContain("'symbol' is required");
  });

  it("symbol_hover: returns validation error when symbol is empty", async () => {
    const manager = makeManager();
    const result = await executeAction(manager, { action: "symbol_hover", symbol: "" });
    expect(result).toContain("Validation error");
    expect(result).toContain("'symbol' is required");
  });
});

describe("tool action relative path resolution", () => {
  it("resolves relative file paths from the session cwd", async () => {
    const client = {
      hover: vi.fn().mockResolvedValue({ contents: "hover result" }),
    };
    const manager = {
      getCwd: vi.fn().mockReturnValue("/repo"),
      ensureFileOpen: vi.fn().mockImplementation(async (file: string) => {
        expect(file).toBe("/repo/src/index.ts");
        return client;
      }),
    } as unknown as LspManager;

    await executeAction(manager, {
      action: "hover",
      file: "src/index.ts",
      line: 1,
      character: 1,
    });

    expect(manager.ensureFileOpen).toHaveBeenCalledWith("/repo/src/index.ts");
    expect(client.hover).toHaveBeenCalledWith("/repo/src/index.ts", { line: 0, character: 0 });
  });

  it("resolves absolute paths unchanged", async () => {
    const client = {
      hover: vi.fn().mockResolvedValue({ contents: "hover result" }),
    };
    const manager = {
      getCwd: vi.fn().mockReturnValue("/repo"),
      ensureFileOpen: vi.fn().mockImplementation(async (file: string) => {
        expect(file).toBe("/other/src/index.ts");
        return client;
      }),
    } as unknown as LspManager;

    await executeAction(manager, {
      action: "hover",
      file: "/other/src/index.ts",
      line: 1,
      character: 1,
    });

    expect(manager.ensureFileOpen).toHaveBeenCalledWith("/other/src/index.ts");
  });
});

describe("tool action missing file behavior", () => {
  it("diagnostics: returns file access error when file cannot be read", async () => {
    const manager = {
      getCwd: vi.fn().mockReturnValue("/repo"),
      ensureFileOpen: vi
        .fn()
        .mockResolvedValue({ syncAndWaitForDiagnostics: vi.fn().mockResolvedValue([]) }),
    } as unknown as LspManager;

    const result = await executeAction(manager, {
      action: "diagnostics",
      file: "src/missing.ts",
    });

    expect(result).toContain("Error: cannot read file");
  });
});
