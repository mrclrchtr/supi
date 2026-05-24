import { describe, expect, it, vi } from "vitest";
import {
  executeDefinition,
  executeDocumentSymbols,
  executeHover,
  executeImplementation,
  executeReferences,
  executeWorkspaceSymbols,
} from "../../src/lsp/tool-actions.ts";

function mockService(overrides: Record<string, unknown> = {}) {
  return {
    hover: vi.fn(async (_file: string, _pos: Record<string, unknown>) => null),
    definition: vi.fn(async (_file: string, _pos: Record<string, unknown>) => null),
    references: vi.fn(async (_file: string, _pos: Record<string, unknown>) => null),
    implementation: vi.fn(async (_file: string, _pos: Record<string, unknown>) => null),
    documentSymbols: vi.fn(async (_file: string) => null),
    workspaceSymbol: vi.fn(async (_query: string) => null),
    fileDiagnostics: vi.fn(async (_file: string, _sev: number) => null),
    getWorkspaceDiagnosticSummary: vi.fn(() => []),
    recoverDiagnostics: vi.fn(async (_opts?: Record<string, unknown>) => ({
      refreshedClients: 0,
      restartedClients: 0,
      staleAssessment: { suspected: false, matchedFiles: [], warning: null },
    })),
    isSupportedSourceFile: vi.fn(() => true),
    codeActions: vi.fn(),
    rename: vi.fn(),
    getProjectServers: vi.fn(() => []),
    getOutstandingDiagnostics: vi.fn(() => []),
    getOutstandingDiagnosticSummary: vi.fn(() => []),
    ...overrides,
  } as never;
}

describe("LSP tool actions — validation", () => {
  it("executeHover returns validation error for missing file", async () => {
    const result = await executeHover(mockService(), "/tmp", {
      file: "/nonexistent/file.ts",
      line: 1,
      character: 1,
    });
    expect(result).toContain("not found");
  });

  it("executeHover returns validation error for invalid position", async () => {
    const result = await executeHover(mockService(), "/tmp", {
      file: "/tmp/test.ts",
      line: -1,
      character: 1,
    });
    expect(result).toContain("positive");
  });

  it("executeDefinition returns validation error for invalid position", async () => {
    const result = await executeDefinition(mockService(), "/tmp", {
      file: "/tmp/test.ts",
      line: 0,
      character: 1,
    });
    expect(result).toContain("positive");
  });

  it("executeReferences returns validation error for missing file", async () => {
    const result = await executeReferences(mockService(), "/tmp", {
      file: "/nonexistent/file.ts",
      line: 1,
      character: 1,
    });
    expect(result).toContain("not found");
  });

  it("executeImplementation returns validation error for missing file", async () => {
    const result = await executeImplementation(mockService(), "/tmp", {
      file: "/nonexistent/file.ts",
      line: 1,
      character: 1,
    });
    expect(result).toContain("not found");
  });

  it("executeDocumentSymbols returns file not found for missing file", async () => {
    const result = await executeDocumentSymbols(mockService(), "/tmp", { file: "/nonexistent.ts" });
    expect(result).toContain("not found");
  });

  it("executeWorkspaceSymbols returns validation error for empty query", async () => {
    const result = await executeWorkspaceSymbols(mockService(), "/tmp", { query: "" });
    expect(result).toContain("required");
  });
});

describe("LSP tool actions — service responses", () => {
  it("executeHover returns formatted hover content", async () => {
    const service = mockService({
      hover: vi.fn(async () => ({ contents: "```typescript\nconst x: number\n```" })),
    });
    // Use a file that exists in the project
    const cwd = process.cwd();
    const result = await executeHover(service, cwd, { file: "README.md", line: 1, character: 1 });
    expect(result).toContain("```typescript");
  });

  it("executeHover returns 'no hover' when service returns null", async () => {
    const result = await executeHover(mockService(), process.cwd(), {
      file: "README.md",
      line: 1,
      character: 1,
    });
    expect(result).toContain("No hover information");
  });
});
