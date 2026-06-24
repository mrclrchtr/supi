import * as path from "node:path";
import type { SemanticProvider as SemanticSubstrate } from "@mrclrchtr/supi-code-runtime/api";
import { describe, expect, it, vi } from "vitest";
import { normalizePath, resolveSymbolTarget, toZeroBased } from "../../src/target-resolution.ts";

const mockLspFns = vi.hoisted(() => ({
  getSessionLspService: vi.fn<(cwd: string) => unknown>(),
}));

vi.mock("@mrclrchtr/supi-lsp/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-lsp/api")>();
  return {
    ...actual,
    getSessionLspService: mockLspFns.getSessionLspService,
  };
});

describe("normalizePath", () => {
  it("resolves relative path against cwd", () => {
    const result = normalizePath("src/index.ts", "/project");
    expect(result).toBe(path.resolve("/project", "src/index.ts"));
  });

  it("strips leading @ from path", () => {
    const result = normalizePath("@src/index.ts", "/project");
    expect(result).toBe(path.resolve("/project", "src/index.ts"));
  });

  it("resolves absolute path as-is", () => {
    const result = normalizePath("/absolute/path.ts", "/project");
    expect(result).toBe("/absolute/path.ts");
  });
});

describe("toZeroBased", () => {
  it("converts 1-based to 0-based", () => {
    const pos = toZeroBased(10, 5);
    expect(pos.line).toBe(9);
    expect(pos.character).toBe(4);
  });

  it("handles line 1, character 1", () => {
    const pos = toZeroBased(1, 1);
    expect(pos.line).toBe(0);
    expect(pos.character).toBe(0);
  });
});

describe("resolveSymbolTarget", () => {
  it("returns an explicit error when semantic symbol discovery is unavailable", async () => {
    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "unavailable",
      reason: "No LSP session initialized for this workspace",
    });

    const result = await resolveSymbolTarget("Widget", "/project", {
      workspaceSymbols: vi.fn().mockResolvedValue(null),
    } as unknown as SemanticSubstrate);

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("requires active LSP");
    }
  });

  it("returns disambiguation from semantic workspace symbols without text-search fallback", async () => {
    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: {
        workspaceSymbol: vi.fn().mockResolvedValue([
          {
            name: "Widget",
            kind: 5,
            location: {
              uri: "file:///project/src/a.ts",
              range: { start: { line: 1, character: 2 }, end: { line: 1, character: 8 } },
            },
          },
          {
            name: "Widget",
            kind: 5,
            location: {
              uri: "file:///project/src/b.ts",
              range: { start: { line: 4, character: 1 }, end: { line: 4, character: 7 } },
            },
          },
        ]),
      },
    });

    const result = await resolveSymbolTarget("Widget", "/project", {
      workspaceSymbols: vi.fn().mockResolvedValue([
        {
          name: "Widget",
          kind: "Class",
          file: "/project/src/a.ts",
          declarationAnchor: { line: 2, character: 3 },
          container: null,
        },
        {
          name: "Widget",
          kind: "Class",
          file: "/project/src/b.ts",
          declarationAnchor: { line: 5, character: 2 },
          container: null,
        },
      ]),
    } as unknown as SemanticSubstrate);

    expect(result.kind).toBe("disambiguation");
    if (result.kind === "disambiguation") {
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates[0]?.file).toContain("src/");
    }
  });

  it("returns disambiguation for single rangeless candidate instead of promoting to single match", async () => {
    // A rangeless candidate has line=0,char=0 (URI-only workspace symbol)
    const result = await resolveSymbolTarget("Thing", "/project", {
      workspaceSymbols: vi.fn().mockResolvedValue([
        {
          name: "Thing",
          kind: "Interface",
          file: "/project/src/types.ts",
          declarationAnchor: { line: 0, character: 0 },
          container: null,
        },
      ]),
    } as unknown as SemanticSubstrate);

    // Should NOT be resolved (rangeless has no usable position)
    expect(result.kind).toBe("disambiguation");
  });

  it("falls back to the workspace-symbol anchor when document symbols have multiple exact matches", async () => {
    const result = await resolveSymbolTarget("Thing", "/project", {
      workspaceSymbols: vi.fn().mockResolvedValue([
        {
          name: "Thing",
          kind: "Function",
          file: "/project/src/types.ts",
          declarationAnchor: { line: 2, character: 3 },
          container: null,
        },
      ]),
      documentSymbols: vi.fn().mockResolvedValue([
        {
          name: "Thing",
          kind: "Function",
          file: "/project/src/types.ts",
          declarationAnchor: { line: 10, character: 5 },
          container: null,
        },
        {
          name: "Thing",
          kind: "Function",
          file: "/project/src/types.ts",
          declarationAnchor: { line: 20, character: 7 },
          container: null,
        },
      ]),
    } as unknown as SemanticSubstrate);

    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.target.displayLine).toBe(2);
      expect(result.target.displayCharacter).toBe(3);
    }
  });

  it("falls back to the workspace-symbol anchor when the refined document symbol is rangeless", async () => {
    const result = await resolveSymbolTarget("Thing", "/project", {
      workspaceSymbols: vi.fn().mockResolvedValue([
        {
          name: "Thing",
          kind: "Function",
          file: "/project/src/types.ts",
          declarationAnchor: { line: 2, character: 3 },
          container: null,
        },
      ]),
      documentSymbols: vi.fn().mockResolvedValue([
        {
          name: "Thing",
          kind: "Function",
          file: "/project/src/types.ts",
          declarationAnchor: { line: 0, character: 0 },
          container: null,
        },
      ]),
    } as unknown as SemanticSubstrate);

    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.target.displayLine).toBe(2);
      expect(result.target.displayCharacter).toBe(3);
    }
  });

  it("falls back to the workspace-symbol anchor when document symbol lookup throws", async () => {
    const result = await resolveSymbolTarget("Thing", "/project", {
      workspaceSymbols: vi.fn().mockResolvedValue([
        {
          name: "Thing",
          kind: "Function",
          file: "/project/src/types.ts",
          declarationAnchor: { line: 2, character: 3 },
          container: null,
        },
      ]),
      documentSymbols: vi.fn().mockRejectedValue(new Error("LSP failed")),
    } as unknown as SemanticSubstrate);

    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.target.displayLine).toBe(2);
      expect(result.target.displayCharacter).toBe(3);
    }
  });

  it("falls back to the workspace-symbol anchor when document symbol lookup is empty", async () => {
    const result = await resolveSymbolTarget("Thing", "/project", {
      workspaceSymbols: vi.fn().mockResolvedValue([
        {
          name: "Thing",
          kind: "Function",
          file: "/project/src/types.ts",
          declarationAnchor: { line: 2, character: 3 },
          container: null,
        },
      ]),
      documentSymbols: vi.fn().mockResolvedValue([]),
    } as unknown as SemanticSubstrate);

    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.target.displayLine).toBe(2);
      expect(result.target.displayCharacter).toBe(3);
    }
  });

  // Tracer bullet for ADR 0003 — see docs/adr/0003-code-symbol-name-declaration-anchors.md
  it("refines ambiguous-symbol disambiguation candidates to the identifier (name) anchor, not the declaration (export) anchor", async () => {
    // Workspace symbols mimic toCodeSymbol (LSP SymbolInformation): only a
    // declaration anchor (the `export` keyword), no name anchor.
    // Document symbols mimic flattenDocumentSymbols (DocumentSymbol): a
    // declaration anchor plus a name anchor from selectionRange (identifier).
    const aDeclaration = { line: 10, character: 1 };
    const bDeclaration = { line: 20, character: 1 };
    const aNameAnchor = { line: 10, character: 23 };
    const bNameAnchor = { line: 20, character: 23 };

    const documentSymbols = vi.fn(async (file: string) => {
      if (file.endsWith("a.ts")) {
        return [
          {
            name: "dup",
            kind: "Function",
            file,
            declarationAnchor: aDeclaration,
            nameAnchor: aNameAnchor,
            container: null,
          },
        ];
      }
      if (file.endsWith("b.ts")) {
        return [
          {
            name: "dup",
            kind: "Function",
            file,
            declarationAnchor: bDeclaration,
            nameAnchor: bNameAnchor,
            container: null,
          },
        ];
      }
      return [];
    });

    const result = await resolveSymbolTarget("dup", "/project", {
      workspaceSymbols: vi.fn().mockResolvedValue([
        {
          name: "dup",
          kind: "Function",
          file: "/project/src/a.ts",
          declarationAnchor: aDeclaration,
          container: null,
        },
        {
          name: "dup",
          kind: "Function",
          file: "/project/src/b.ts",
          declarationAnchor: bDeclaration,
          container: null,
        },
      ]),
      documentSymbols,
    } as unknown as SemanticSubstrate);

    expect(result.kind).toBe("disambiguation");
    if (result.kind !== "disambiguation") return;
    expect(result.candidates).toHaveLength(2);
    // Invariant: each disambiguation candidate carries the refined name
    // (identifier) anchor (col 23), NOT the declaration anchor (col 1) the
    // workspace hit carries. The disambiguation path refines each candidate
    // via documentSymbols and anchorOf prefers nameAnchor.
    expect(result.candidates[0]?.character).toBe(aNameAnchor.character);
    expect(result.candidates[1]?.character).toBe(bNameAnchor.character);
  });
});
