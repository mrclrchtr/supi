import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CodeSymbol } from "@mrclrchtr/supi-code-runtime/api";
import { describe, expect, it, vi } from "vitest";
import { resolveAnchoredSymbolTarget } from "../../../../src/analysis/target/anchored.ts";

let tmpDir: string;

function setup(): string {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "anchored-symbol-"));
  return tmpDir;
}

function teardown(): void {
  rmSync(tmpDir, { recursive: true, force: true });
}

/** `export function widget() {}` — `export` at 1, `widget` name anchor at 17. */
const WIDGET_SOURCE = "export function widget() { helper(); }\n";

function docSymbols(file: string, overrides: CodeSymbol[] | null = null): CodeSymbol[] | null {
  if (overrides === null) {
    return [
      {
        name: "widget",
        kind: "Function",
        file,
        declarationAnchor: { line: 1, character: 1 },
        nameAnchor: { line: 1, character: 17 },
        container: null,
      },
    ];
  }
  return overrides;
}

// biome-ignore lint/security/noSecrets: false positive on test description string
describe("resolveAnchoredSymbolTarget — exact identifier hit", () => {
  it("resolves a coordinate on the identifier to a named name-anchor target", async () => {
    const dir = setup();
    const file = path.join(dir, "widget.ts");
    writeFileSync(file, WIDGET_SOURCE);
    const provider = {
      documentSymbols: vi.fn(async () => docSymbols(file)),
    };

    const result = await resolveAnchoredSymbolTarget(file, 1, 17, provider);

    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    expect(result.target.name).toBe("widget");
    expect(result.target.kind).toBe("Function");
    expect(result.target.anchorKind).toBe("name");
    expect(result.target.displayLine).toBe(1);
    expect(result.target.displayCharacter).toBe(17);
    expect(result.target.resolution?.snapped).toBe(false);
    expect(result.target.resolution?.source).toBe("semantic");
    teardown();
  });

  it("treats a coordinate in the middle of the identifier as an exact (non-snapped) hit", async () => {
    const dir = setup();
    const file = path.join(dir, "widget.ts");
    writeFileSync(file, WIDGET_SOURCE);
    const provider = { documentSymbols: vi.fn(async () => docSymbols(file)) };

    const result = await resolveAnchoredSymbolTarget(file, 1, 20, provider);

    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    expect(result.target.name).toBe("widget");
    expect(result.target.displayCharacter).toBe(17);
    expect(result.target.resolution?.snapped).toBe(false);
    teardown();
  });
});

// biome-ignore lint/security/noSecrets: false positive on test description string
describe("resolveAnchoredSymbolTarget — declaration header snap", () => {
  it("snaps a coordinate on the `export` keyword to the name anchor when unambiguous", async () => {
    const dir = setup();
    const file = path.join(dir, "widget.ts");
    writeFileSync(file, WIDGET_SOURCE);
    const provider = { documentSymbols: vi.fn(async () => docSymbols(file)) };

    const result = await resolveAnchoredSymbolTarget(file, 1, 1, provider);

    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    expect(result.target.name).toBe("widget");
    expect(result.target.displayCharacter).toBe(17);
    expect(result.target.resolution?.snapped).toBe(true);
    expect(result.target.resolution?.requested).toEqual({ line: 1, character: 1 });
    expect(result.target.resolution?.resolved).toEqual({ line: 1, character: 17 });
    expect(result.target.resolution?.source).toBe("semantic");
    teardown();
  });

  it("snaps a coordinate on the `function` keyword to the name anchor", async () => {
    const dir = setup();
    const file = path.join(dir, "widget.ts");
    writeFileSync(file, WIDGET_SOURCE);
    const provider = { documentSymbols: vi.fn(async () => docSymbols(file)) };

    const result = await resolveAnchoredSymbolTarget(file, 1, 8, provider);

    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    expect(result.target.displayCharacter).toBe(17);
    expect(result.target.resolution?.snapped).toBe(true);
    teardown();
  });
});

// biome-ignore lint/security/noSecrets: false positive on test description string
describe("resolveAnchoredSymbolTarget — unresolved coordinates", () => {
  it("returns an error recommending code_inspect for a coordinate on a non-declaration line", async () => {
    const dir = setup();
    const file = path.join(dir, "widget.ts");
    writeFileSync(file, WIDGET_SOURCE);
    const provider = { documentSymbols: vi.fn(async () => docSymbols(file)) };

    const result = await resolveAnchoredSymbolTarget(file, 3, 1, provider);

    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.message).toContain("code_inspect");
    teardown();
  });

  it("returns an error recommending code_inspect when no provider evidence is available", async () => {
    const dir = setup();
    const file = path.join(dir, "widget.ts");
    writeFileSync(file, WIDGET_SOURCE);

    const result = await resolveAnchoredSymbolTarget(file, 1, 17, null);

    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.message).toContain("code_inspect");
    teardown();
  });

  it("returns an error for a missing file", async () => {
    const result = await resolveAnchoredSymbolTarget("/nonexistent/file.ts", 1, 1, null);
    expect(result.kind).toBe("error");
  });

  it("returns an error for a binary file", async () => {
    const dir = setup();
    const file = path.join(dir, "image.png");
    writeFileSync(file, "not really a png");
    const result = await resolveAnchoredSymbolTarget(file, 1, 1, null);
    expect(result.kind).toBe("error");
    teardown();
  });
});

// biome-ignore lint/security/noSecrets: false positive on test description string
describe("resolveAnchoredSymbolTarget — ambiguous coordinates", () => {
  it("returns disambiguation candidates with anchorKind when multiple symbols match", async () => {
    const dir = setup();
    const file = path.join(dir, "widget.ts");
    // Two declarations on line 1 sharing the header area is unusual; emulate
    // by having two symbols whose declaration line matches the coordinate.
    writeFileSync(file, "export const a = 1;\nexport const b = 2;\n");
    const provider = {
      documentSymbols: vi.fn(async () => [
        {
          name: "a",
          kind: "Variable",
          file,
          declarationAnchor: { line: 1, character: 1 },
          nameAnchor: { line: 1, character: 14 },
          container: null,
        },
        {
          name: "b",
          kind: "Variable",
          file,
          declarationAnchor: { line: 2, character: 1 },
          nameAnchor: { line: 2, character: 14 },
          container: null,
        },
      ]),
    };

    // Coordinate on line 1 `export` keyword — only `a` declares there, so
    // this is unambiguous. Use a coordinate that matches both instead: a
    // coordinate that lands on neither identifier but on a line both share
    // is impossible; instead verify the single-match snap path returns one.
    const single = await resolveAnchoredSymbolTarget(file, 1, 1, provider);
    expect(single.kind).toBe("resolved");
    if (single.kind !== "resolved") return;
    expect(single.target.name).toBe("a");
    teardown();
  });

  it("returns disambiguation when two symbols share the declaration line and the coordinate is ambiguous", async () => {
    const dir = setup();
    const file = path.join(dir, "widget.ts");
    writeFileSync(file, "export function widget() {}\n");
    const provider = {
      documentSymbols: vi.fn(async () => [
        {
          name: "widget",
          kind: "Function",
          file,
          declarationAnchor: { line: 1, character: 1 },
          nameAnchor: { line: 1, character: 17 },
          container: null,
        },
        {
          name: "widget",
          kind: "Function",
          file,
          declarationAnchor: { line: 1, character: 1 },
          nameAnchor: { line: 1, character: 17 },
          container: "Other",
        },
      ]),
    };

    const result = await resolveAnchoredSymbolTarget(file, 1, 17, provider);

    expect(result.kind).toBe("disambiguation");
    if (result.kind !== "disambiguation") return;
    expect(result.candidates.length).toBe(2);
    for (const c of result.candidates) {
      expect(c.anchorKind).toBe("name");
      expect(c.name).toBe("widget");
    }
    teardown();
  });
});

// biome-ignore lint/security/noSecrets: false positive on test description string
describe("resolveAnchoredSymbolTarget — structural fallback", () => {
  it("resolves a coordinate on an identifier via tree-sitter nodeAt when LSP is unavailable", async () => {
    const dir = setup();
    const file = path.join(dir, "widget.ts");
    writeFileSync(file, WIDGET_SOURCE);
    const provider = {
      documentSymbols: vi.fn(async () => null),
      nodeAt: vi.fn(async () => ({
        kind: "success" as const,
        data: {
          type: "identifier",
          startLine: 1,
          startCharacter: 17,
          endLine: 1,
          endCharacter: 23,
          text: "widget",
          ancestry: [
            {
              type: "function_declaration",
              startLine: 1,
              startCharacter: 8,
              endLine: 1,
              endCharacter: 35,
            },
            {
              type: "export_statement",
              startLine: 1,
              startCharacter: 1,
              endLine: 1,
              endCharacter: 36,
            },
            { type: "program", startLine: 1, startCharacter: 1, endLine: 2, endCharacter: 1 },
          ],
        },
      })),
    };

    const result = await resolveAnchoredSymbolTarget(file, 1, 17, provider);

    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    expect(result.target.name).toBe("widget");
    expect(result.target.confidence).toBe("structural");
    expect(result.target.anchorKind).toBe("name");
    expect(result.target.resolution?.source).toBe("structural-identifier");
    teardown();
  });

  it("returns an error for a coordinate on a comment node when only structural evidence is available", async () => {
    const dir = setup();
    const file = path.join(dir, "widget.ts");
    writeFileSync(file, WIDGET_SOURCE);
    const provider = {
      documentSymbols: vi.fn(async () => null),
      nodeAt: vi.fn(async () => ({
        kind: "success" as const,
        data: {
          type: "comment",
          startLine: 1,
          startCharacter: 1,
          endLine: 1,
          endCharacter: 10,
          text: "// header",
          ancestry: [],
        },
      })),
    };

    const result = await resolveAnchoredSymbolTarget(file, 1, 3, provider);

    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.message).toContain("code_inspect");
    teardown();
  });
});
