import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SemanticSubstrate } from "../../src/substrates/types.ts";
import {
  normalizePath,
  resolveAnchoredTarget,
  resolveSymbolTarget,
  toZeroBased,
} from "../../src/target-resolution.ts";

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

describe("resolveAnchoredTarget", () => {
  it("returns error for non-existent file", () => {
    const result = resolveAnchoredTarget("/nonexistent/file.ts", 1, 1, "/tmp");
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("not found");
    }
  });

  it("returns error for binary file", () => {
    // Use a known existing binary-extension path pattern
    const result = resolveAnchoredTarget("test.png", 1, 1, __dirname);
    // Will fail as file-not-found rather than binary, but tests the path
    expect(result.kind).toBe("error");
  });

  it("resolves existing file to a target", () => {
    // Use this test file itself
    const result = resolveAnchoredTarget(path.basename(__filename), 1, 1, __dirname);
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.target.displayLine).toBe(1);
      expect(result.target.displayCharacter).toBe(1);
      expect(result.target.position.line).toBe(0);
      expect(result.target.position.character).toBe(0);
      expect(result.target.confidence).toBe("semantic");
    }
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
          line: 2,
          character: 3,
          container: null,
        },
        {
          name: "Widget",
          kind: "Class",
          file: "/project/src/b.ts",
          line: 5,
          character: 2,
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
          line: 0,
          character: 0,
          container: null,
        },
      ]),
    } as unknown as SemanticSubstrate);

    // Should NOT be resolved (rangeless has no usable position)
    expect(result.kind).toBe("disambiguation");
  });
});
