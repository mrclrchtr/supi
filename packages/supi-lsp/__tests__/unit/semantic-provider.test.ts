import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type CodeQueryResult,
  completedCodeQuery,
  type SemanticProvider,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
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
      getWorkspaceDiagnosticSummary: vi.fn().mockReturnValue({
        entries: [],
        current: true,
        evidence: {
          requested: 0,
          confirmed: 0,
          unconfirmed: 0,
          failed: 0,
          removed: 0,
          documents: [],
        },
      }),
      getOutstandingDiagnostics: vi.fn().mockReturnValue({
        entries: [],
        current: true,
        evidence: {
          requested: 0,
          confirmed: 0,
          unconfirmed: 0,
          failed: 0,
          removed: 0,
          documents: [],
        },
      }),
      getOutstandingDiagnosticSummary: vi.fn().mockReturnValue({
        entries: [],
        current: true,
        evidence: {
          requested: 0,
          confirmed: 0,
          unconfirmed: 0,
          failed: 0,
          removed: 0,
          documents: [],
        },
      }),
      recoverDiagnostics: vi.fn().mockResolvedValue({
        attemptedClients: 0,
        restartedClients: 0,
        diagnosticEvidence: {
          requested: 0,
          confirmed: 0,
          unconfirmed: 0,
          failed: 0,
          removed: 0,
          documents: [],
        },
        staleAssessment: { suspected: false, matchedFiles: [], warning: null },
      }),
      resolveFilePath: vi.fn().mockImplementation((f: string) => f),
    };
  }

  function createMockLsp(overrides?: Record<string, unknown>): WorkspaceLspRuntime {
    const fields = { ...defaultMockFields(), ...overrides };
    for (const key of [
      "references",
      "implementation",
      "documentSymbols",
      "workspaceSymbol",
      "hover",
      "definition",
      "fileDiagnostics",
    ]) {
      const query = fields[key] as (...args: unknown[]) => Promise<unknown>;
      fields[key] = async (...args: unknown[]) => {
        const value = await query(...args);
        if (isCodeQueryResult(value)) return value;
        const listQuery = [
          "references",
          "documentSymbols",
          "workspaceSymbol",
          "fileDiagnostics",
        ].includes(key);
        return completedCodeQuery(listQuery && value === null ? [] : value);
      };
    }
    return fields as unknown as WorkspaceLspRuntime;
  }

  function isCodeQueryResult(value: unknown): value is CodeQueryResult<unknown> {
    if (typeof value !== "object" || value === null) return false;
    const kind = (value as { kind?: unknown }).kind;
    return kind === "completed" || kind === "partial" || kind === "unavailable";
  }

  function completedData<T>(result: CodeQueryResult<T> | undefined): T {
    expect(result?.kind).not.toBe("unavailable");
    if (!result || result.kind === "unavailable") throw new Error("Expected query data");
    return result.data;
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
    it("preserves the exact provider request control without activating it", async () => {
      const references = vi.fn().mockResolvedValue([]);
      const lsp = createMockLsp({ references });
      const provider = createLspSemanticProvider(lsp);
      const controller = new AbortController();
      controller.abort();
      const control = { signal: controller.signal, deadline: 42 };

      await provider.references("test.ts", { line: 0, character: 0 }, control);

      expect(references).toHaveBeenCalledWith("test.ts", { line: 0, character: 0 }, control);
      expect(references.mock.calls[0]?.[2]).toBe(control);
    });

    it("keeps the current call form when request control is omitted", async () => {
      const references = vi.fn().mockResolvedValue([]);
      const provider = createLspSemanticProvider(createMockLsp({ references }));

      await provider.references("test.ts", { line: 0, character: 0 });

      expect(references).toHaveBeenCalledWith("test.ts", { line: 0, character: 0 });
    });

    it("preserves a completed empty result", async () => {
      const lsp = createMockLsp({ references: vi.fn().mockResolvedValue(null) });
      const provider = createLspSemanticProvider(lsp);
      const result = await provider.references("test.ts", { line: 0, character: 0 });
      expect(result).toEqual({ kind: "completed", data: [] });
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
      const data = completedData(result);
      expect(data).toHaveLength(1);
      expect(data[0]?.uri).toBe("file:///src/index.ts");
      expect(data[0]?.range.start.line).toBe(5);
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
      const data = completedData(result);
      expect(data).toHaveLength(1);
      expect(data[0]?.uri).toBe("file:///src/impl.ts");
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
      expect(completedData(result)).toHaveLength(2);
    });
  });

  describe("documentSymbols", () => {
    it("preserves a completed empty result", async () => {
      const lsp = createMockLsp({ documentSymbols: vi.fn().mockResolvedValue(null) });
      const provider = createLspSemanticProvider(lsp);
      const result = await provider.documentSymbols("test.ts");
      expect(result).toEqual({ kind: "completed", data: [] });
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
      const data = completedData(result);
      expect(data).toHaveLength(2);
      expect(data[0]).toMatchObject({
        name: "myClass",
        kind: "Class",
        container: null,
        nesting: "top-level",
      });
      expect(data[1]).toMatchObject({
        name: "myMethod",
        container: "myClass",
        nesting: "nested",
      });
    });

    it("keeps every flat SymbolInformation observation unknown", async () => {
      const lsp = createMockLsp({
        documentSymbols: vi.fn().mockResolvedValue([
          {
            name: "unknownRoot",
            kind: 12,
            location: {
              uri: "file:///src/index.ts",
              range: { start: { line: 1, character: 0 }, end: { line: 1, character: 11 } },
            },
          },
          {
            name: "knownNested",
            kind: 6,
            containerName: "Box",
            location: {
              uri: "file:///src/index.ts",
              range: { start: { line: 2, character: 2 }, end: { line: 2, character: 13 } },
            },
          },
        ]),
      });

      const result = await createLspSemanticProvider(lsp).documentSymbols("test.ts");

      expect(completedData(result)).toMatchObject([
        { name: "unknownRoot", container: null, nesting: "unknown" },
        { name: "knownNested", container: "Box", nesting: "unknown" },
      ]);
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
        const data = completedData(result);

        expect(data[0]?.declarationAnchor).toEqual({ line: 1, character: 1 });
        expect(data[0]?.nameAnchor).toEqual({ line: 1, character: 17 });
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("workspaceSymbols", () => {
    it("preserves a completed empty result", async () => {
      const lsp = createMockLsp({ workspaceSymbol: vi.fn().mockResolvedValue(null) });
      const provider = createLspSemanticProvider(lsp);
      const result = await provider.workspaceSymbols("foo");
      expect(result).toEqual({ kind: "completed", data: [] });
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
      const data = completedData(result);
      expect(data).toHaveLength(1);
      expect(data[0]?.name).toBe("myFunc");
      expect(data[0]?.kind).toBe("Function");
      expect(data[0]?.file).toBe("/src/index.ts");
      expect(data[0]?.declarationAnchor.line).toBe(6);
      expect(data[0]?.container).toBe("moduleA");
    });
  });

  describe("hover", () => {
    it("preserves protocol null as completed empty", async () => {
      const lsp = createMockLsp({ hover: vi.fn().mockResolvedValue(null) });
      const provider = createLspSemanticProvider(lsp);
      const result = await provider.hover?.("test.ts", { line: 0, character: 0 });
      expect(result).toEqual({ kind: "completed", data: null });
    });

    it("preserves an unavailable provider result", async () => {
      const lsp = createMockLsp({
        hover: vi.fn().mockResolvedValue(unavailableCodeQuery("transport failed")),
      });
      const provider = createLspSemanticProvider(lsp);
      await expect(provider.hover?.("test.ts", { line: 0, character: 0 })).resolves.toEqual({
        kind: "unavailable",
        reason: "transport failed",
      });
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
      const data = completedData(result);
      expect(data?.contents).toBe("```ts\nconst x: number\n```");
      expect(data?.range).toBeUndefined();
    });

    it("converts string contents hover", async () => {
      const lsp = createMockLsp({
        hover: vi.fn().mockResolvedValue({
          contents: "const x: number",
        }),
      });
      const provider = createLspSemanticProvider(lsp);
      const result = await provider.hover?.("test.ts", { line: 0, character: 0 });
      expect(completedData(result)?.contents).toBe("const x: number");
    });

    it("converts MarkedString array hover", async () => {
      const lsp = createMockLsp({
        hover: vi.fn().mockResolvedValue({
          contents: [{ language: "ts", value: "const x: number" }, "inline docs"],
        }),
      });
      const provider = createLspSemanticProvider(lsp);
      const result = await provider.hover?.("test.ts", { line: 0, character: 0 });
      expect(completedData(result)?.contents).toBe("const x: number\ninline docs");
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
      const data = completedData(result);
      expect(data?.contents).toBe("number");
      expect(data?.range).toEqual({
        start: { line: 10, character: 4 },
        end: { line: 10, character: 10 },
      });
    });
  });
});
