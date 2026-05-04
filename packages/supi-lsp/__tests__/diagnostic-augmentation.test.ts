import { describe, expect, it, vi } from "vitest";
import { augmentDiagnostics } from "../src/diagnostics/diagnostic-augmentation.ts";
import type { LspManager } from "../src/manager/manager.ts";
import type { CodeAction, Diagnostic, Hover } from "../src/types.ts";

function makeManager(mockClient: {
  hover: ReturnType<typeof vi.fn>;
  codeActions: ReturnType<typeof vi.fn>;
}): LspManager {
  return {
    getClientForFile: vi.fn().mockResolvedValue(mockClient),
  } as unknown as LspManager;
}

function makeErrorDiag(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return {
    range: { start: { line: 5, character: 10 }, end: { line: 5, character: 15 } },
    message: "Type error",
    severity: 1,
    ...overrides,
  };
}

describe("augmentDiagnostics", () => {
  it("returns null when no severity-1 errors", async () => {
    const manager = makeManager({ hover: vi.fn(), codeActions: vi.fn() });
    const result = await augmentDiagnostics(
      "file.ts",
      [makeErrorDiag({ severity: 2 })],
      manager,
      "/project",
    );
    expect(result).toBeNull();
  });

  it("returns null when no client is available", async () => {
    const manager = {
      getClientForFile: vi.fn().mockResolvedValue(null),
    } as unknown as LspManager;
    const result = await augmentDiagnostics("file.ts", [makeErrorDiag()], manager, "/project");
    expect(result).toBeNull();
  });

  it("includes hover info when available", async () => {
    const hover: Hover = { contents: "Expected number, got string" };
    const client = {
      hover: vi.fn().mockResolvedValue(hover),
      codeActions: vi.fn().mockResolvedValue(null),
    };
    const manager = makeManager(client);
    const result = await augmentDiagnostics("file.ts", [makeErrorDiag()], manager, "/project");
    expect(result).toContain("💡 Hover info:");
    expect(result).toContain("Expected number, got string");
  });

  it("includes code action titles when available", async () => {
    const actions: CodeAction[] = [
      { title: "Add missing import" },
      { title: "Change type to string" },
    ];
    const client = {
      hover: vi.fn().mockResolvedValue(null),
      codeActions: vi.fn().mockResolvedValue(actions),
    };
    const manager = makeManager(client);
    const result = await augmentDiagnostics("file.ts", [makeErrorDiag()], manager, "/project");
    expect(result).toContain("💡 Available fix:");
    expect(result).toContain("Add missing import");
    expect(result).toContain("Change type to string");
  });

  it("truncates hover to 3 lines", async () => {
    const hover: Hover = {
      contents: "Line 1\nLine 2\nLine 3\nLine 4\nLine 5",
    };
    const client = {
      hover: vi.fn().mockResolvedValue(hover),
      codeActions: vi.fn().mockResolvedValue(null),
    };
    const manager = makeManager(client);
    const result = await augmentDiagnostics("file.ts", [makeErrorDiag()], manager, "/project");
    expect(result).toContain("Line 1");
    expect(result).toContain("Line 2");
    expect(result).toContain("Line 3");
    expect(result).not.toContain("Line 4");
  });

  it("returns null on timeout", async () => {
    const client = {
      hover: vi.fn().mockImplementation(() => new Promise(() => {})),
      codeActions: vi.fn().mockImplementation(() => new Promise(() => {})),
    };
    const manager = makeManager(client);
    const result = await augmentDiagnostics("file.ts", [makeErrorDiag()], manager, "/project");
    expect(result).toBeNull();
  });

  it("combines hover and code actions", async () => {
    const hover: Hover = { contents: "Type mismatch" };
    const actions: CodeAction[] = [{ title: "Fix type" }];
    const client = {
      hover: vi.fn().mockResolvedValue(hover),
      codeActions: vi.fn().mockResolvedValue(actions),
    };
    const manager = makeManager(client);
    const result = await augmentDiagnostics("file.ts", [makeErrorDiag()], manager, "/project");
    expect(result).toContain("💡 Hover info:");
    expect(result).toContain("💡 Available fix:");
  });

  it("only augments the first severity-1 error when multiple exist", async () => {
    const firstError = makeErrorDiag({
      range: { start: { line: 2, character: 5 }, end: { line: 2, character: 10 } },
    });
    const secondError = makeErrorDiag({
      range: { start: { line: 8, character: 0 }, end: { line: 8, character: 5 } },
    });
    const client = {
      hover: vi.fn().mockResolvedValue(null),
      codeActions: vi.fn().mockResolvedValue(null),
    };
    const manager = makeManager(client);
    await augmentDiagnostics("file.ts", [firstError, secondError], manager, "/project");
    expect(client.hover).toHaveBeenCalledTimes(1);
    expect(client.hover).toHaveBeenCalledWith(expect.any(String), { line: 2, character: 5 });
    expect(client.codeActions).toHaveBeenCalledTimes(1);
    expect(client.codeActions).toHaveBeenCalledWith(
      expect.any(String),
      { start: { line: 2, character: 5 }, end: { line: 2, character: 5 } },
      { diagnostics: [firstError] },
    );
  });
});
