import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionLspService: vi.fn(),
  waitForSessionLspService: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-lsp/api", () => ({
  getSessionLspService: mocks.getSessionLspService,
  waitForSessionLspService: mocks.waitForSessionLspService,
}));

import { createSemanticSubstrate } from "../../../src/substrates/lsp-adapter.ts";

function makeLspServiceStub() {
  return {
    references: vi.fn(),
    implementation: vi.fn(),
    documentSymbols: vi.fn(),
    workspaceSymbol: vi.fn(),
  };
}

describe("createSemanticSubstrate", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a SemanticSubstrate with all 4 methods", () => {
    mocks.getSessionLspService.mockReturnValue({ kind: "ready", service: makeLspServiceStub() });

    const substrate = createSemanticSubstrate("/project");

    expect(substrate).toBeDefined();
    expect(typeof substrate.references).toBe("function");
    expect(typeof substrate.implementation).toBe("function");
    expect(typeof substrate.documentSymbols).toBe("function");
    expect(typeof substrate.workspaceSymbols).toBe("function");
  });

  describe("references", () => {
    it("calls through to LSP service and maps Location[] to CodeLocation[]", async () => {
      const lsp = makeLspServiceStub();
      lsp.references.mockResolvedValue([
        {
          uri: "file:///project/src/a.ts",
          range: { start: { line: 1, character: 2 }, end: { line: 1, character: 10 } },
        },
        {
          uri: "file:///project/src/b.ts",
          range: { start: { line: 5, character: 0 }, end: { line: 5, character: 8 } },
        },
      ]);
      mocks.getSessionLspService.mockReturnValue({ kind: "ready", service: lsp });

      const substrate = createSemanticSubstrate("/project");
      const result = await substrate.references("/project/src/index.ts", { line: 0, character: 0 });

      expect(result).toHaveLength(2);
      expect(result![0].uri).toBe("file:///project/src/a.ts");
      expect(result![0].range.start.line).toBe(1);
      expect(result![1].uri).toBe("file:///project/src/b.ts");
      expect(result![1].range.end.character).toBe(8);
      expect(lsp.references).toHaveBeenCalledWith("/project/src/index.ts", {
        line: 0,
        character: 0,
      });
    });

    it("returns null when LSP is unavailable", async () => {
      mocks.getSessionLspService.mockReturnValue({ kind: "disabled" });

      const substrate = createSemanticSubstrate("/project");
      const result = await substrate.references("/f.ts", { line: 0, character: 0 });

      expect(result).toBeNull();
    });

    it("returns null when LSP returns null", async () => {
      const lsp = makeLspServiceStub();
      lsp.references.mockResolvedValue(null);
      mocks.getSessionLspService.mockReturnValue({ kind: "ready", service: lsp });

      const substrate = createSemanticSubstrate("/project");
      const result = await substrate.references("/f.ts", { line: 0, character: 0 });

      expect(result).toBeNull();
    });

    it("waits for pending LSP and returns result when ready", async () => {
      const lsp = makeLspServiceStub();
      lsp.references.mockResolvedValue([]);
      mocks.getSessionLspService.mockReturnValue({ kind: "pending" });
      mocks.waitForSessionLspService.mockResolvedValue({ kind: "ready", service: lsp });

      const substrate = createSemanticSubstrate("/project");
      const result = await substrate.references("/f.ts", { line: 0, character: 0 });

      expect(result).toEqual([]);
      expect(mocks.waitForSessionLspService).toHaveBeenCalled();
    });

    it("returns null when pending LSP times out", async () => {
      mocks.getSessionLspService.mockReturnValue({ kind: "pending" });
      mocks.waitForSessionLspService.mockResolvedValue({ kind: "unavailable", reason: "Timeout" });

      const substrate = createSemanticSubstrate("/project");
      const result = await substrate.references("/f.ts", { line: 0, character: 0 });

      expect(result).toBeNull();
    });
  });

  describe("implementation", () => {
    it("calls through and flattens single result", async () => {
      const lsp = makeLspServiceStub();
      lsp.implementation.mockResolvedValue({
        uri: "file:///project/src/impl.ts",
        range: { start: { line: 3, character: 0 }, end: { line: 10, character: 1 } },
      });
      mocks.getSessionLspService.mockReturnValue({ kind: "ready", service: lsp });

      const substrate = createSemanticSubstrate("/project");
      const result = await substrate.implementation("/f.ts", { line: 0, character: 0 });

      expect(result).toHaveLength(1);
      expect(result![0].uri).toBe("file:///project/src/impl.ts");
    });

    it("returns null when LSP is unavailable", async () => {
      mocks.getSessionLspService.mockReturnValue({ kind: "unavailable", reason: "no server" });

      const substrate = createSemanticSubstrate("/project");
      const result = await substrate.implementation("/f.ts", { line: 0, character: 0 });

      expect(result).toBeNull();
    });
  });

  describe("documentSymbols", () => {
    it("normalizes DocumentSymbol[] to CodeSymbol[]", async () => {
      const lsp = makeLspServiceStub();
      lsp.documentSymbols.mockResolvedValue([
        {
          name: "MyClass",
          kind: 5,
          selectionRange: { start: { line: 1, character: 0 } },
          children: [],
        },
        {
          name: "myFunc",
          kind: 12,
          selectionRange: { start: { line: 10, character: 4 } },
          children: [],
        },
      ]);
      mocks.getSessionLspService.mockReturnValue({ kind: "ready", service: lsp });

      const substrate = createSemanticSubstrate("/project");
      const result = await substrate.documentSymbols("/f.ts");

      expect(result).toHaveLength(2);
      expect(result![0]).toEqual({
        name: "MyClass",
        kind: "Class",
        file: "/f.ts",
        line: 2,
        character: 1,
        container: null,
      });
      expect(result![1].name).toBe("myFunc");
      expect(result![1].kind).toBe("Function");
    });

    it("returns null when LSP is unavailable", async () => {
      mocks.getSessionLspService.mockReturnValue({ kind: "disabled" });

      const substrate = createSemanticSubstrate("/project");
      const result = await substrate.documentSymbols("/f.ts");

      expect(result).toBeNull();
    });
  });

  describe("workspaceSymbols", () => {
    it("normalizes to CodeSymbol[]", async () => {
      const lsp = makeLspServiceStub();
      lsp.workspaceSymbol.mockResolvedValue([
        {
          name: "parseConfig",
          kind: 12,
          location: {
            uri: "file:///project/src/config.ts",
            range: { start: { line: 5, character: 0 } },
          },
        },
        {
          name: "ConfigOpts",
          kind: 5,
          location: {
            uri: "file:///project/src/config.ts",
            range: { start: { line: 1, character: 0 } },
          },
        },
      ]);
      mocks.getSessionLspService.mockReturnValue({ kind: "ready", service: lsp });

      const substrate = createSemanticSubstrate("/project");
      const result = await substrate.workspaceSymbols("parse");

      expect(result).toHaveLength(2);
      expect(result![0].name).toBe("parseConfig");
      expect(result![0].kind).toBe("Function");
      expect(result![0].file).toBe("/project/src/config.ts");
    });

    it("returns null when LSP is unavailable", async () => {
      mocks.getSessionLspService.mockReturnValue({ kind: "unavailable", reason: "no server" });

      const substrate = createSemanticSubstrate("/project");
      const result = await substrate.workspaceSymbols("x");

      expect(result).toBeNull();
    });
  });
});
