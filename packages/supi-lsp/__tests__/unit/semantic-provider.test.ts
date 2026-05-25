import type { SemanticProvider } from "@mrclrchtr/supi-code-runtime/api";
import { describe, expect, it, vi } from "vitest";
import { createLspSemanticProvider } from "../../src/provider/lsp-semantic-provider.ts";
import type { SessionLspService } from "../../src/session/service-registry.ts";

// biome-ignore lint/security/noSecrets: false positive on "LspSemanticProvider" describe name
describe("LspSemanticProvider", () => {
  function defaultMockFields(): Record<string, unknown> {
    return {
      references: vi.fn().mockResolvedValue(null),
      implementation: vi.fn().mockResolvedValue(null),
      documentSymbols: vi.fn().mockResolvedValue(null),
      workspaceSymbol: vi.fn().mockResolvedValue(null),
      hover: vi.fn().mockResolvedValue(null),
      definition: vi.fn().mockResolvedValue(null),
      rename: vi.fn().mockResolvedValue(null),
      codeActions: vi.fn().mockResolvedValue(null),
      fileDiagnostics: vi.fn().mockResolvedValue(null),
      getProjectServers: vi.fn().mockReturnValue([]),
      isSupportedSourceFile: vi.fn().mockReturnValue(true),
      getWorkspaceDiagnosticSummary: vi.fn().mockReturnValue([]),
      getOutstandingDiagnostics: vi.fn().mockReturnValue([]),
      getOutstandingDiagnosticSummary: vi.fn().mockReturnValue([]),
      recoverDiagnostics: vi.fn().mockResolvedValue({
        refreshedClients: 0,
        restartedClients: 0,
        staleAssessment: { suspected: false, matchedFiles: [], warning: null },
      }),
      resolveFilePath: vi.fn().mockImplementation((f: string) => f),
    };
  }

  function createMockLsp(overrides?: Partial<SessionLspService>): SessionLspService {
    return { ...defaultMockFields(), ...overrides } as unknown as SessionLspService;
  }

  it("creates a SemanticProvider from a SessionLspService", () => {
    const lsp = createMockLsp();
    const provider: SemanticProvider = createLspSemanticProvider(lsp);
    expect(typeof provider.references).toBe("function");
    expect(typeof provider.implementation).toBe("function");
    expect(typeof provider.documentSymbols).toBe("function");
    expect(typeof provider.workspaceSymbols).toBe("function");
  });

  describe("references", () => {
    it("returns null when LSP returns null", async () => {
      const lsp = createMockLsp({ references: vi.fn().mockResolvedValue(null) });
      const provider = createLspSemanticProvider(lsp);
      const result = await provider.references("test.ts", { line: 0, character: 0 });
      expect(result).toBeNull();
    });

    it("maps Location[] to CodeLocation[]", async () => {
      const lsp = createMockLsp({
        references: vi.fn().mockResolvedValue([
          {
            uri: "file:///src/index.ts",
            range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
          },
        ]),
      });
      const provider = createLspSemanticProvider(lsp);
      const result = await provider.references("test.ts", { line: 0, character: 0 });
      expect(result).toHaveLength(1);
      expect(result?.[0].uri).toBe("file:///src/index.ts");
      expect(result?.[0].range.start.line).toBe(5);
    });
  });

  describe("implementation", () => {
    it("handles single Location result", async () => {
      const lsp = createMockLsp({
        implementation: vi.fn().mockResolvedValue({
          uri: "file:///src/impl.ts",
          range: { start: { line: 10, character: 0 }, end: { line: 10, character: 5 } },
        }),
      });
      const provider = createLspSemanticProvider(lsp);
      const result = await provider.implementation("test.ts", { line: 0, character: 0 });
      expect(result).toHaveLength(1);
      expect(result?.[0].uri).toBe("file:///src/impl.ts");
    });

    it("handles multiple Location results", async () => {
      const lsp = createMockLsp({
        implementation: vi.fn().mockResolvedValue([
          {
            uri: "file:///src/a.ts",
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } },
          },
          {
            uri: "file:///src/b.ts",
            range: { start: { line: 2, character: 0 }, end: { line: 2, character: 1 } },
          },
        ]),
      });
      const provider = createLspSemanticProvider(lsp);
      const result = await provider.implementation("test.ts", { line: 0, character: 0 });
      expect(result).toHaveLength(2);
    });
  });

  describe("documentSymbols", () => {
    it("returns null when LSP returns null", async () => {
      const lsp = createMockLsp({ documentSymbols: vi.fn().mockResolvedValue(null) });
      const provider = createLspSemanticProvider(lsp);
      const result = await provider.documentSymbols("test.ts");
      expect(result).toBeNull();
    });

    it("flattens DocumentSymbol hierarchy into flat CodeSymbol list", async () => {
      const lsp = createMockLsp({
        documentSymbols: vi.fn().mockResolvedValue([
          {
            name: "myClass",
            kind: 5,
            range: { start: { line: 1, character: 0 }, end: { line: 20, character: 0 } },
            selectionRange: { start: { line: 1, character: 6 }, end: { line: 1, character: 13 } },
            children: [
              {
                name: "myMethod",
                kind: 6,
                range: { start: { line: 2, character: 2 }, end: { line: 10, character: 2 } },
                selectionRange: {
                  start: { line: 2, character: 2 },
                  end: { line: 2, character: 10 },
                },
              },
            ],
          },
        ]),
      });
      const provider = createLspSemanticProvider(lsp);
      const result = await provider.documentSymbols("test.ts");
      expect(result).toHaveLength(2);
      expect(result?.[0].name).toBe("myClass");
      expect(result?.[0].kind).toBe("Class");
      expect(result?.[1].name).toBe("myMethod");
      expect(result?.[1].container).toBe("myClass");
    });
  });

  describe("workspaceSymbols", () => {
    it("returns null when LSP returns null", async () => {
      const lsp = createMockLsp({ workspaceSymbol: vi.fn().mockResolvedValue(null) });
      const provider = createLspSemanticProvider(lsp);
      const result = await provider.workspaceSymbols("foo");
      expect(result).toBeNull();
    });

    it("maps SymbolInformation to CodeSymbol", async () => {
      const lsp = createMockLsp({
        workspaceSymbol: vi.fn().mockResolvedValue([
          {
            name: "myFunc",
            kind: 12,
            containerName: "moduleA",
            location: {
              uri: "file:///src/index.ts",
              range: { start: { line: 5, character: 0 }, end: { line: 10, character: 0 } },
            },
          },
        ]),
      });
      const provider = createLspSemanticProvider(lsp);
      const result = await provider.workspaceSymbols("myFunc");
      expect(result).toHaveLength(1);
      expect(result?.[0].name).toBe("myFunc");
      expect(result?.[0].kind).toBe("Function");
      expect(result?.[0].file).toBe("/src/index.ts");
      expect(result?.[0].line).toBe(6);
      expect(result?.[0].container).toBe("moduleA");
    });
  });
});
