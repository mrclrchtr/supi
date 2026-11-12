import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { RefactorResult, SemanticProvider } from "@mrclrchtr/supi-code-runtime/api";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createLspSemanticProvider } from "../../src/provider/lsp-semantic-provider.ts";
import { COMMAND_ONLY_ACTION_REASON } from "../../src/provider/refactor-planning.ts";
import type { WorkspaceLspRuntime } from "../../src/session/runtime-registry.ts";

describe("LspRefactorProvider", () => {
  function emptyEvidence() {
    return {
      requested: 0,
      confirmed: 0,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
      documents: [],
    } as const;
  }

  function routed<T>(value: T) {
    return { value, authorizedMutationRoots: ["/src"] };
  }

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
      getWorkspaceDiagnosticSummary: vi
        .fn()
        .mockReturnValue({ entries: [], current: true, evidence: emptyEvidence() }),
      getOutstandingDiagnostics: vi
        .fn()
        .mockReturnValue({ entries: [], current: true, evidence: emptyEvidence() }),
      getOutstandingDiagnosticSummary: vi
        .fn()
        .mockReturnValue({ entries: [], current: true, evidence: emptyEvidence() }),
      recoverDiagnostics: vi.fn().mockResolvedValue({
        attemptedClients: 0,
        restartedClients: 0,
        diagnosticEvidence: emptyEvidence(),
        staleAssessment: { suspected: false, matchedFiles: [], warning: null },
      }),
      resolveFilePath: vi.fn().mockImplementation((f: string) => f),
      getOpenDocumentVersion: vi.fn().mockReturnValue(null),
    };
  }

  function createMockLsp(overrides?: Partial<WorkspaceLspRuntime>): WorkspaceLspRuntime {
    return { ...defaultMockFields(), ...overrides } as unknown as WorkspaceLspRuntime;
  }

  describe("rename", () => {
    it("exposes rename on the SemanticProvider when WorkspaceLspRuntime supports it", () => {
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
        rename: vi.fn().mockResolvedValue({
          value: lspWorkspaceEdit,
          authorizedMutationRoots: ["/src"],
        }),
        getOpenDocumentVersion: vi.fn().mockReturnValue(1),
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
        expect(result.edits.documentPreconditions).toEqual([
          { file: "/src/index.ts", kind: "open-document-version", version: 1 },
        ]);
        expect(result.authorizedMutationRoots).toEqual(["/src"]);
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
        rename: vi.fn().mockResolvedValue(routed(lspWorkspaceEdit)),
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

    it("keeps routed mutation authority when rename is unsupported", async () => {
      const lsp = createMockLsp({
        rename: vi.fn().mockResolvedValue({
          value: null,
          reason: "Rename is unavailable at the requested position.",
          authorizedMutationRoots: ["/routed/nested"],
        }),
      });
      const provider = createLspSemanticProvider(lsp);
      const result = (await provider.rename?.(
        "/routed/nested/paper.tex",
        { line: 2, character: 9 },
        "Overview",
      )) as RefactorResult;

      expect(result).toEqual({
        kind: "unavailable",
        reason: "Rename is unavailable at the requested position.",
        authorizedMutationRoots: ["/routed/nested"],
      });
    });

    it("returns unavailable when LSP returns empty edit (no changes, no documentChanges)", async () => {
      const lsp = createMockLsp({
        rename: vi.fn().mockResolvedValue(routed({} as unknown)),
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
    it("exposes codeActions on the SemanticProvider when WorkspaceLspRuntime supports it", () => {
      const lsp = createMockLsp({
        codeActions: vi.fn().mockResolvedValue([]),
      });
      const provider: SemanticProvider = createLspSemanticProvider(lsp);
      expect(provider.codeActions).toBeDefined();
      expect(typeof provider.codeActions).toBe("function");
    });

    it("returns precise refactor results from code actions with edits", async () => {
      const lsp = createMockLsp({
        codeActions: vi.fn().mockResolvedValue(
          routed([
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
        ),
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

    it("preserves routed code-action failure reasons", async () => {
      const lsp = createMockLsp({
        codeActions: vi.fn().mockResolvedValue({
          value: null,
          reason: "The server does not advertise textDocument/codeAction.",
          authorizedMutationRoots: ["/src"],
        }),
      });
      const provider = createLspSemanticProvider(lsp);
      const results = (await provider.codeActions?.("/src/index.ts", {
        line: 0,
        character: 0,
      })) as RefactorResult[];

      expect(results).toEqual([
        { kind: "unavailable", reason: "The server does not advertise textDocument/codeAction." },
      ]);
    });

    it("returns unavailable for code actions without edits", async () => {
      const lsp = createMockLsp({
        codeActions: vi.fn().mockResolvedValue(routed([{ title: "Organize imports" }])),
      });
      const provider = createLspSemanticProvider(lsp);
      const results = (await provider.codeActions?.("/src/index.ts", {
        line: 0,
        character: 0,
      })) as RefactorResult[];

      expect(results).toHaveLength(1);
      expect(results[0].kind).toBe("unavailable");
    });

    it("keeps a valid standard Command response unsupported", async () => {
      const lsp = createMockLsp({
        codeActions: vi
          .fn()
          .mockResolvedValue(routed([{ title: "Run fix", command: "server.runFix" }] as unknown)),
      });
      const provider = createLspSemanticProvider(lsp);
      const results = (await provider.codeActions?.("/src/index.ts", {
        line: 0,
        character: 0,
      })) as RefactorResult[];

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        kind: "unavailable",
        reason: expect.stringContaining("command"),
      });
    });
  });

  describe("rename adapter", () => {
    it("delegates through the LSP service", async () => {
      const renameSpy = vi.fn().mockResolvedValue(
        routed({
          changes: { "file:///src/index.ts": [] },
        }),
      );
      const lsp = createMockLsp({ rename: renameSpy });
      const provider = createLspSemanticProvider(lsp);

      await provider.rename?.("/src/index.ts", { line: 0, character: 0 }, "newName");

      expect(renameSpy).toHaveBeenCalledWith("/src/index.ts", { line: 0, character: 0 }, "newName");
    });
  });

  describe("operation-aware refactor planning", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "refactor-provider-"));
    const file = path.join(dir, "index.ts");
    const uri = pathToFileURL(file).href;
    writeFileSync(file, "import a from 'a';\nconst value = a;\n");
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    function inDir<T>(value: T) {
      return { value, authorizedMutationRoots: [dir] };
    }

    function editAction(title: string, kind: string, newText: string) {
      return {
        title,
        kind,
        edit: {
          changes: {
            [uri]: [
              {
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
                newText,
              },
            ],
          },
        },
      };
    }

    function providerWith(
      actions: unknown,
      overrides: Partial<WorkspaceLspRuntime> = {},
    ): { provider: SemanticProvider; codeActions: ReturnType<typeof vi.fn> } {
      const codeActions = vi.fn().mockResolvedValue(inDir(actions));
      const provider = createLspSemanticProvider(createMockLsp({ codeActions, ...overrides }));
      return { provider, codeActions };
    }

    const extractRange = {
      start: { line: 2, character: 4 },
      end: { line: 2, character: 12 },
    };

    it("routes rename_symbol through the rename request instead of code actions", async () => {
      const renameSpy = vi.fn().mockResolvedValue(
        inDir({
          changes: {
            [uri]: [
              {
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
                newText: "newName",
              },
            ],
          },
        }),
      );
      const { provider, codeActions } = providerWith([], { rename: renameSpy });

      const result = await provider.refactor?.({
        operation: "rename_symbol",
        file,
        position: { line: 0, character: 0 },
        newName: "newName",
      });

      expect(renameSpy).toHaveBeenCalledWith(file, { line: 0, character: 0 }, "newName");
      expect(codeActions).not.toHaveBeenCalled();
      expect(result?.kind).toBe("precise");
    });

    it("requests a code action for the selected range with the requested kind", async () => {
      const { provider, codeActions } = providerWith([]);

      await provider.refactor?.({
        operation: "code_action",
        file,
        range: extractRange,
        kind: "refactor.extract",
      });

      expect(codeActions).toHaveBeenCalledWith(file, extractRange, undefined, {
        only: ["refactor.extract"],
        triggerKind: 1,
      });
    });

    it("requests a source action for the whole document", async () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), "source-action-"));
      const source = path.join(dir, "index.ts");
      writeFileSync(source, "import a from 'a';\r\nconst é = a;\n");
      try {
        const { provider, codeActions } = providerWith([
          editAction("Organize imports", "source.organizeImports", ""),
        ]);

        await provider.refactor?.({
          operation: "source_action",
          file: source,
          kind: "source.organizeImports",
        });

        expect(codeActions).toHaveBeenCalledWith(
          source,
          { start: { line: 0, character: 0 }, end: { line: 2, character: 0 } },
          undefined,
          { only: ["source.organizeImports"], triggerKind: 1 },
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("plans a matching sub-kind and records the selected action", async () => {
      const { provider } = providerWith([
        editAction("Extract to method", "refactor.extract.function", "extracted()"),
      ]);

      const result = await provider.refactor?.({
        operation: "code_action",
        file,
        range: extractRange,
        kind: "refactor.extract",
      });

      expect(result).toMatchObject({
        kind: "precise",
        action: { kind: "refactor.extract.function", title: "Extract to method" },
        edits: { edits: [{ file, newText: "extracted()" }] },
      });
    });

    it("ignores actions outside the requested kind, including dotted look-alikes", async () => {
      const { provider } = providerWith([
        editAction("Inline", "refactor.inline", "x"),
        editAction("Look-alike", "refactor.extractor", "y"),
      ]);

      const result = await provider.refactor?.({
        operation: "code_action",
        file,
        range: extractRange,
        kind: "refactor.extract",
      });

      expect(result?.kind).toBe("unavailable");
    });

    it("lists distinct generic-kind actions as candidates with kind and exact title", async () => {
      // rust-analyzer reports every extraction with the generic `refactor.extract` kind.
      const { provider } = providerWith([
        editAction("Extract into variable", "refactor.extract", "let var_name = 1;"),
        editAction("Extract into function", "refactor.extract", "fun_name()"),
      ]);

      const result = await provider.refactor?.({
        operation: "code_action",
        file,
        range: extractRange,
        kind: "refactor.extract",
      });

      expect(result).toEqual({
        kind: "ambiguous",
        candidates: [
          expect.objectContaining({
            kind: "refactor.extract",
            title: "Extract into variable",
            file,
          }),
          expect.objectContaining({ kind: "refactor.extract", title: "Extract into function" }),
        ],
      });
    });

    it("selects one action by exact title", async () => {
      const { provider } = providerWith([
        editAction("Extract into variable", "refactor.extract", "let var_name = 1;"),
        editAction("Extract into function", "refactor.extract", "fun_name()"),
      ]);

      const result = await provider.refactor?.({
        operation: "code_action",
        file,
        range: extractRange,
        kind: "refactor.extract",
        title: "Extract into function",
      });

      expect(result).toMatchObject({
        kind: "precise",
        action: { title: "Extract into function" },
        edits: { edits: [{ newText: "fun_name()" }] },
      });
    });

    it("names the available titles when no action has the requested title", async () => {
      const { provider } = providerWith([
        editAction("Extract to local variable", "refactor.extract.variable", "int i = 1;"),
      ]);

      const result = await provider.refactor?.({
        operation: "code_action",
        file,
        range: extractRange,
        kind: "refactor.extract",
        title: "Extract to constant",
      });

      expect(result).toMatchObject({
        kind: "unavailable",
        reason: expect.stringContaining('"Extract to local variable"'),
      });
    });

    it("returns equivalent matching plans only once", async () => {
      const action = editAction("Organize imports", "source.organizeImports", "");
      const { provider } = providerWith([action, { ...action }]);

      const result = await provider.refactor?.({
        operation: "source_action",
        file,
        kind: "source.organizeImports",
      });

      expect(result?.kind).toBe("precise");
    });

    it("excludes disabled actions before choosing a plan", async () => {
      const { provider } = providerWith([
        {
          title: "Extract to method",
          kind: "refactor.extract.function",
          disabled: { reason: "x" },
        },
        editAction("Extract to local variable", "refactor.extract.variable", "int i = 1;"),
      ]);

      const result = await provider.refactor?.({
        operation: "code_action",
        file,
        range: extractRange,
        kind: "refactor.extract",
      });

      expect(result).toMatchObject({
        kind: "precise",
        action: { title: "Extract to local variable" },
      });
    });

    it("rejects command-only actions as not previewable", async () => {
      const { provider } = providerWith([
        {
          title: "Extract to local variable",
          kind: "refactor.extract.variable",
          command: { title: "Extract", command: "refactor.extract.variable" },
        },
      ]);

      const result = await provider.refactor?.({
        operation: "code_action",
        file,
        range: extractRange,
        kind: "refactor.extract",
      });

      expect(result).toMatchObject({ kind: "unavailable", reason: COMMAND_ONLY_ACTION_REASON });
    });

    it("retries a source action while an advertising server returns no action of the kind", async () => {
      vi.useFakeTimers();
      try {
        const advertisedKinds = ["source.removeUnused.ts"];
        const codeActions = vi
          .fn()
          .mockResolvedValueOnce({ ...inDir([]), advertisedKinds })
          .mockResolvedValueOnce({
            ...inDir([editAction("Remove all unused code", "source.removeUnused.ts", "")]),
            advertisedKinds,
          });
        const provider = createLspSemanticProvider(createMockLsp({ codeActions }));

        const pending = provider.refactor?.({
          operation: "source_action",
          file,
          kind: "source.removeUnused",
        });
        await vi.advanceTimersByTimeAsync(500);

        await expect(pending).resolves.toMatchObject({
          kind: "precise",
          action: { kind: "source.removeUnused.ts" },
        });
        expect(codeActions).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("lists the server-advertised kinds and does not retry an unadvertised kind", async () => {
      const codeActions = vi.fn().mockResolvedValue({
        ...inDir([]),
        advertisedKinds: ["quickfix", "source.organizeImports", "source.sortImports"],
      });
      const provider = createLspSemanticProvider(createMockLsp({ codeActions }));

      const result = await provider.refactor?.({
        operation: "source_action",
        file,
        kind: "source.fixAll",
      });

      expect(codeActions).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        kind: "unavailable",
        reason: expect.stringContaining("source.organizeImports, source.sortImports"),
      });
      expect(result).not.toMatchObject({ reason: expect.stringContaining("quickfix") });
    });

    it("explains an empty result from a server that may return any kind, without retrying", async () => {
      // rust-analyzer advertises CodeActionKind.Empty and no source kinds.
      const codeActions = vi.fn().mockResolvedValue({
        ...inDir([]),
        advertisedKinds: ["", "quickfix", "refactor", "refactor.extract"],
      });
      const provider = createLspSemanticProvider(createMockLsp({ codeActions }));

      const result = await provider.refactor?.({
        operation: "source_action",
        file,
        kind: "source.organizeImports",
      });

      expect(codeActions).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ kind: "unavailable" });
      const reason = result?.kind === "unavailable" ? result.reason : "";
      expect(reason).toContain("may return any code-action kind");
      expect(reason).not.toContain("advertises no kinds");
    });

    it("keeps the routed failure reason", async () => {
      const provider = createLspSemanticProvider(
        createMockLsp({
          codeActions: vi.fn().mockResolvedValue({
            value: null,
            authorizedMutationRoots: [dir],
            reason: 'LSP server "typescript" does not advertise the requested code-action kind.',
          }),
        }),
      );

      const result = await provider.refactor?.({
        operation: "source_action",
        file,
        kind: "source.organizeImports",
      });

      expect(result).toEqual({
        kind: "unavailable",
        reason:
          'Source action "source.organizeImports" is unavailable: LSP server "typescript" does not advertise the requested code-action kind.',
        authorizedMutationRoots: [dir],
      });
    });

    it.each([
      ["null entry", null],
      ["numeric kind", { title: "Bad action", kind: 1 }],
    ])("does not throw for malformed returned actions: %s", async (_label, entry) => {
      const { provider } = providerWith([entry]);

      const result = await provider.refactor?.({
        operation: "code_action",
        file,
        range: extractRange,
        kind: "refactor",
      });

      expect(result?.kind).toBe("unavailable");
    });

    it.each([
      ["missing edits", {}],
      ["empty edits", { edit: { changes: {} } }],
      [
        "invalid range",
        {
          edit: {
            changes: {
              [uri]: [
                {
                  range: { start: { line: 1, character: 0 }, end: { line: 0, character: 0 } },
                  newText: "",
                },
              ],
            },
          },
        },
      ],
      ["resource operations", { edit: { documentChanges: [{ kind: "delete", uri }] } }],
      [
        "stale document version",
        {
          edit: {
            documentChanges: [
              {
                textDocument: { uri, version: 1 },
                edits: [
                  {
                    range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } },
                    newText: "",
                  },
                ],
              },
            ],
          },
        },
      ],
    ])("keeps matching actions unavailable for %s", async (_label, fields) => {
      const { provider } = providerWith(
        [{ title: "Remove unused imports", kind: "source.removeUnusedImports", ...fields }],
        { getOpenDocumentVersion: vi.fn().mockReturnValue(2) },
      );

      const result = await provider.refactor?.({
        operation: "source_action",
        file,
        kind: "source.removeUnusedImports",
      });

      expect(result?.kind).toBe("unavailable");
    });
  });
});
