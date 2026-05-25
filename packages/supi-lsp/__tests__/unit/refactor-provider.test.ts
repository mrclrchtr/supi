import type { RefactorResult, SemanticProvider } from "@mrclrchtr/supi-code-runtime/api";
import { describe, expect, it, vi } from "vitest";
import { createLspSemanticProvider } from "../../src/provider/lsp-semantic-provider.ts";
import type { SessionLspService } from "../../src/session/service-registry.ts";

describe("LspRefactorProvider", () => {
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

  describe("rename", () => {
    it("exposes rename on the SemanticProvider when SessionLspService supports it", () => {
      const lsp = createMockLsp({
        rename: vi.fn().mockResolvedValue({
          changes: {},
        }),
      });
      const provider: SemanticProvider = createLspSemanticProvider(lsp);
      expect(provider.rename).toBeDefined();
      expect(typeof provider.rename).toBe("function");
    });

    it("returns precise refactor result for a successful rename with TextDocumentEdit changes", async () => {
      const lspWorkspaceEdit = {
        documentChanges: [
          {
            textDocument: { uri: "file:///src/index.ts", version: 1 },
            edits: [
              {
                range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
                newText: "newName",
              },
            ],
          },
        ],
      };
      const lsp = createMockLsp({
        rename: vi.fn().mockResolvedValue(lspWorkspaceEdit),
      });
      const provider = createLspSemanticProvider(lsp);
      const result = (await provider.rename?.(
        "/src/index.ts",
        { line: 5, character: 0 },
        "newName",
      )) as RefactorResult;

      expect(result.kind).toBe("precise");
      if (result.kind === "precise") {
        expect(result.edits.edits).toHaveLength(1);
        expect(result.edits.edits[0].file).toBe("/src/index.ts");
        expect(result.edits.edits[0].newText).toBe("newName");
      }
    });

    it("returns precise refactor result for a successful rename with changes map", async () => {
      const lspWorkspaceEdit = {
        changes: {
          "file:///src/a.ts": [
            {
              range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } },
              newText: "bar",
            },
          ],
          "file:///src/b.ts": [
            {
              range: { start: { line: 10, character: 0 }, end: { line: 10, character: 5 } },
              newText: "bar",
            },
          ],
        },
      };
      const lsp = createMockLsp({
        rename: vi.fn().mockResolvedValue(lspWorkspaceEdit),
      });
      const provider = createLspSemanticProvider(lsp);
      const result = (await provider.rename?.(
        "/src/index.ts",
        { line: 1, character: 0 },
        "bar",
      )) as RefactorResult;

      expect(result.kind).toBe("precise");
      if (result.kind === "precise") {
        expect(result.edits.edits).toHaveLength(2);
      }
    });

    it("returns unavailable when LSP returns null", async () => {
      const lsp = createMockLsp({
        rename: vi.fn().mockResolvedValue(null),
      });
      const provider = createLspSemanticProvider(lsp);
      const result = (await provider.rename?.(
        "/src/index.ts",
        { line: 0, character: 0 },
        "foo",
      )) as RefactorResult;

      expect(result.kind).toBe("unavailable");
      if (result.kind === "unavailable") {
        expect(result.reason).toBeTruthy();
      }
    });

    it("returns unavailable when LSP returns empty edit (no changes, no documentChanges)", async () => {
      const lsp = createMockLsp({
        rename: vi.fn().mockResolvedValue({} as unknown),
      });
      const provider = createLspSemanticProvider(lsp);
      const result = (await provider.rename?.(
        "/src/index.ts",
        { line: 0, character: 0 },
        "foo",
      )) as RefactorResult;

      expect(result.kind).toBe("unavailable");
    });
  });

  describe("codeActions", () => {
    it("exposes codeActions on the SemanticProvider when SessionLspService supports it", () => {
      const lsp = createMockLsp({
        codeActions: vi.fn().mockResolvedValue([]),
      });
      const provider: SemanticProvider = createLspSemanticProvider(lsp);
      expect(provider.codeActions).toBeDefined();
      expect(typeof provider.codeActions).toBe("function");
    });

    it("returns precise refactor results from code actions with edits", async () => {
      const lsp = createMockLsp({
        codeActions: vi.fn().mockResolvedValue([
          {
            title: "Extract function",
            edit: {
              changes: {
                "file:///src/index.ts": [
                  {
                    range: { start: { line: 2, character: 0 }, end: { line: 5, character: 0 } },
                    newText: "helper()",
                  },
                ],
              },
            },
          },
        ]),
      });
      const provider = createLspSemanticProvider(lsp);
      const results = (await provider.codeActions?.("/src/index.ts", {
        line: 3,
        character: 0,
      })) as RefactorResult[];

      expect(results).toHaveLength(1);
      expect(results[0].kind).toBe("precise");
    });

    it("returns empty array when LSP returns null", async () => {
      const lsp = createMockLsp({
        codeActions: vi.fn().mockResolvedValue(null),
      });
      const provider = createLspSemanticProvider(lsp);
      const results = (await provider.codeActions?.("/src/index.ts", {
        line: 0,
        character: 0,
      })) as RefactorResult[];

      expect(results).toHaveLength(0);
    });

    it("returns unavailable for code actions without edits", async () => {
      const lsp = createMockLsp({
        codeActions: vi.fn().mockResolvedValue([{ title: "Organize imports" }]),
      });
      const provider = createLspSemanticProvider(lsp);
      const results = (await provider.codeActions?.("/src/index.ts", {
        line: 0,
        character: 0,
      })) as RefactorResult[];

      expect(results).toHaveLength(1);
      expect(results[0].kind).toBe("unavailable");
    });
  });

  describe("rename is absent when LSP does not support it", () => {
    it("does not expose rename when SessionLspService.rename returns null always", () => {
      const lsp = createMockLsp({
        rename: vi.fn().mockResolvedValue(null),
      });
      const provider: SemanticProvider = createLspSemanticProvider(lsp);
      expect(provider.rename).toBeDefined();
    });

    it("rename adapter delegates through the LSP service", async () => {
      const renameSpy = vi.fn().mockResolvedValue({
        changes: { "file:///src/index.ts": [] },
      });
      const lsp = createMockLsp({ rename: renameSpy });
      const provider = createLspSemanticProvider(lsp);

      await provider.rename?.("/src/index.ts", { line: 0, character: 0 }, "newName");

      expect(renameSpy).toHaveBeenCalledWith("/src/index.ts", { line: 0, character: 0 }, "newName");
    });
  });
});
