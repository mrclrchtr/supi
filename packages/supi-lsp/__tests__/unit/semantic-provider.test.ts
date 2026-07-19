import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SemanticProvider } from "@mrclrchtr/supi-code-runtime/api";
import { describe, expect, it, vi } from "vitest";
import { createLspSemanticProvider } from "../../src/provider/lsp-semantic-provider.ts";
import type { WorkspaceLspRuntime } from "../../src/session/runtime-registry.ts";

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

  function createMockLsp(overrides?: Partial<WorkspaceLspRuntime>): WorkspaceLspRuntime {
    return { ...defaultMockFields(), ...overrides } as unknown as WorkspaceLspRuntime;
  }

  it("creates a SemanticProvider from a WorkspaceLspRuntime", () => {
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

    it("repairs a selection range that starts at the declaration instead of the symbol name", async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "semantic-provider-anchor-"));
      const file = path.join(tmpDir, "overload.ts");
      writeFileSync(file, "export function liveOverload(value: number): number;\n");
      const lsp = createMockLsp({
        documentSymbols: vi.fn().mockResolvedValue([
          {
            name: "liveOverload",
            kind: 12,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 52 } },
            selectionRange: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 52 },
            },
          },
        ]),
      });

      try {
        const result = await createLspSemanticProvider(lsp).documentSymbols(file);

        expect(result?.[0].declarationAnchor).toEqual({ line: 1, character: 1 });
        expect(result?.[0].nameAnchor).toEqual({ line: 1, character: 17 });
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
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
      expect(result?.[0].declarationAnchor.line).toBe(6);
      expect(result?.[0].container).toBe("moduleA");
    });
  });

  describe("hover", () => {
    it("returns null when LSP returns null", async () => {
      const lsp = createMockLsp({ hover: vi.fn().mockResolvedValue(null) });
      const provider = createLspSemanticProvider(lsp);
      const result = await provider.hover?.("test.ts", { line: 0, character: 0 });
      expect(result).toBeNull();
    });

    it("converts MarkupContent hover to simplified shape", async () => {
      const lsp = createMockLsp({
        hover: vi.fn().mockResolvedValue({
          contents: { kind: "markdown", value: "```ts\nconst x: number\n```" },
          range: undefined,
        }),
      });
      const provider = createLspSemanticProvider(lsp);
      const result = await provider.hover?.("test.ts", { line: 5, character: 3 });
      expect(result).not.toBeNull();
      expect(result?.contents).toBe("```ts\nconst x: number\n```");
      expect(result?.range).toBeUndefined();
    });

    it("converts string contents hover", async () => {
      const lsp = createMockLsp({
        hover: vi.fn().mockResolvedValue({
          contents: "const x: number",
        }),
      });
      const provider = createLspSemanticProvider(lsp);
      const result = await provider.hover?.("test.ts", { line: 0, character: 0 });
      expect(result?.contents).toBe("const x: number");
    });

    it("converts MarkedString array hover", async () => {
      const lsp = createMockLsp({
        hover: vi.fn().mockResolvedValue({
          contents: [{ language: "ts", value: "const x: number" }, "inline docs"],
        }),
      });
      const provider = createLspSemanticProvider(lsp);
      const result = await provider.hover?.("test.ts", { line: 0, character: 0 });
      expect(result?.contents).toBe("const x: number\ninline docs");
    });

    it("includes range when present", async () => {
      const lsp = createMockLsp({
        hover: vi.fn().mockResolvedValue({
          contents: { kind: "plaintext", value: "number" },
          range: {
            start: { line: 10, character: 4 },
            end: { line: 10, character: 10 },
          },
        }),
      });
      const provider = createLspSemanticProvider(lsp);
      const result = await provider.hover?.("test.ts", { line: 10, character: 7 });
      expect(result?.contents).toBe("number");
      expect(result?.range).toEqual({
        start: { line: 10, character: 4 },
        end: { line: 10, character: 10 },
      });
    });
  });
});
