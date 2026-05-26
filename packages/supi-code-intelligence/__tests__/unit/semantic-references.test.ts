import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SemanticProvider as SemanticSubstrate } from "@mrclrchtr/supi-code-runtime/api";
import type { CodeLocation, CodePosition } from "@mrclrchtr/supi-core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedTarget } from "../../src/target-resolution.ts";

let tmpDir: string;

function fileUri(filePath: string): string {
  return `file://${filePath}`;
}

function makePos(line: number, character: number): CodePosition {
  return { line, character };
}

function makeLocation(filePath: string, line: number): CodeLocation {
  return {
    uri: fileUri(filePath),
    range: {
      start: makePos(line, 0),
      end: makePos(line, 10),
    },
  };
}

/** Write a file, creating parent directories as needed. */
function writeFile(filePath: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, "", "utf-8");
}

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "semantic-refs-"));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── collectReferences ──────────────────────────────────────────────────────

describe("collectReferences", () => {
  it("returns refs with semantic confidence when LSP returns locations", async () => {
    const targetFile = path.join(tmpDir, "src", "mod.ts");
    writeFile(targetFile);
    const otherFile = path.join(tmpDir, "src", "other.ts");
    writeFile(otherFile);

    const target: ResolvedTarget = {
      file: targetFile,
      position: makePos(5, 0),
      displayLine: 6,
      displayCharacter: 1,
      name: "myFunc",
      kind: null,
      confidence: "semantic",
    };

    const semantic: SemanticSubstrate = {
      references: vi
        .fn()
        .mockResolvedValue([makeLocation(otherFile, 3), makeLocation(otherFile, 10)]),
      implementation: vi.fn(),
      documentSymbols: vi.fn(),
      workspaceSymbols: vi.fn(),
    };

    const { collectReferences } = await import("../../src/use-case/support/semantic-references.ts");
    const result = await collectReferences(target, tmpDir, semantic);

    expect(result.refs).toHaveLength(2);
    expect(result.refs[0].file).toBe(path.join("src", "other.ts"));
    expect(result.refs[0].line).toBe(4); // 0-based → 1-based
    expect(result.refs[1].line).toBe(11);
    expect(result.confidence).toBe("semantic");
    expect(result.externalCount).toBe(0);
  });

  it("filters out the declaration location", async () => {
    const targetFile = path.join(tmpDir, "src", "mod.ts");
    writeFile(targetFile);
    const otherFile = path.join(tmpDir, "src", "other.ts");
    writeFile(otherFile);

    const target: ResolvedTarget = {
      file: targetFile,
      position: makePos(5, 0),
      displayLine: 6,
      displayCharacter: 1,
      name: "myFunc",
      kind: null,
      confidence: "semantic",
    };

    const semantic: SemanticSubstrate = {
      references: vi.fn().mockResolvedValue([
        // Declaration at target position — should be filtered out
        makeLocation(targetFile, 5),
        // Real reference
        makeLocation(otherFile, 3),
      ]),
      implementation: vi.fn(),
      documentSymbols: vi.fn(),
      workspaceSymbols: vi.fn(),
    };

    const { collectReferences } = await import("../../src/use-case/support/semantic-references.ts");
    const result = await collectReferences(target, tmpDir, semantic);

    expect(result.refs).toHaveLength(1);
    expect(result.refs[0].file).toBe(path.join("src", "other.ts"));
  });

  it("counts external refs separately", async () => {
    const targetFile = path.join(tmpDir, "src", "mod.ts");
    writeFile(targetFile);
    const extFile = path.join(tmpDir, "node_modules", "pkg", "index.ts");
    writeFile(extFile);

    const target: ResolvedTarget = {
      file: targetFile,
      position: makePos(5, 0),
      displayLine: 6,
      displayCharacter: 1,
      name: "myFunc",
      kind: null,
      confidence: "semantic",
    };

    const semantic: SemanticSubstrate = {
      references: vi.fn().mockResolvedValue([makeLocation(extFile, 1)]),
      implementation: vi.fn(),
      documentSymbols: vi.fn(),
      workspaceSymbols: vi.fn(),
    };

    const { collectReferences } = await import("../../src/use-case/support/semantic-references.ts");
    const result = await collectReferences(target, tmpDir, semantic);

    expect(result.refs).toHaveLength(0); // external, not project
    expect(result.externalCount).toBe(1);
    expect(result.confidence).toBe("semantic");
  });

  it("returns unavailable when LSP returns null", async () => {
    const targetFile = path.join(tmpDir, "src", "mod.ts");
    writeFile(targetFile);

    const target: ResolvedTarget = {
      file: targetFile,
      position: makePos(5, 0),
      displayLine: 6,
      displayCharacter: 1,
      name: "myFunc",
      kind: null,
      confidence: "semantic",
    };

    const semantic: SemanticSubstrate = {
      references: vi.fn().mockResolvedValue(null),
      implementation: vi.fn(),
      documentSymbols: vi.fn(),
      workspaceSymbols: vi.fn(),
    };

    const { collectReferences } = await import("../../src/use-case/support/semantic-references.ts");
    const result = await collectReferences(target, tmpDir, semantic);

    expect(result.refs).toHaveLength(0);
    expect(result.confidence).toBe("unavailable");
    expect(result.externalCount).toBe(0);
  });
});

// ── aggregatePerTarget ─────────────────────────────────────────────────────

describe("aggregatePerTarget", () => {
  it("merges refs from multiple targets, deduped by file:line", async () => {
    const targets: ResolvedTarget[] = [
      {
        file: "/tmp/f.ts",
        position: makePos(5, 0),
        displayLine: 6,
        displayCharacter: 1,
        name: "funcA",
        kind: null,
        confidence: "semantic",
      },
      {
        file: "/tmp/f.ts",
        position: makePos(20, 0),
        displayLine: 21,
        displayCharacter: 1,
        name: "funcB",
        kind: null,
        confidence: "semantic",
      },
    ];

    const collectFn = vi.fn().mockResolvedValue({
      refs: [
        { file: "src/other.ts", line: 4 },
        { file: "src/other.ts", line: 10 },
      ],
      confidence: "semantic" as const,
      externalCount: 1,
    });

    const { aggregatePerTarget } = await import(
      "../../src/use-case/support/semantic-references.ts"
    );
    const result = await aggregatePerTarget(targets, collectFn);

    // Deduped — same refs from both targets
    expect(result.refs).toHaveLength(2);
    expect(result.confidence).toBe("semantic");
    // External counted once per target invocation
    expect(result.externalCount).toBe(2);
    expect(collectFn).toHaveBeenCalledTimes(2);
  });

  it("resolves highest confidence correctly", async () => {
    const collectFn = vi.fn();
    collectFn.mockResolvedValueOnce({
      refs: [{ file: "a.ts", line: 1 }],
      confidence: "structural" as const,
      externalCount: 0,
    });
    collectFn.mockResolvedValueOnce({
      refs: [],
      confidence: "unavailable" as const,
      externalCount: 0,
    });

    const { aggregatePerTarget } = await import(
      "../../src/use-case/support/semantic-references.ts"
    );
    const result = await aggregatePerTarget(
      [
        {
          file: "/f.ts",
          position: makePos(0, 0),
          displayLine: 1,
          displayCharacter: 1,
          name: null,
          kind: null,
          confidence: "structural",
        },
        {
          file: "/g.ts",
          position: makePos(0, 0),
          displayLine: 1,
          displayCharacter: 1,
          name: null,
          kind: null,
          confidence: "unavailable",
        },
      ],
      collectFn,
    );

    expect(result.confidence).toBe("structural");
  });

  it("handles empty targets array", async () => {
    const { aggregatePerTarget } = await import(
      "../../src/use-case/support/semantic-references.ts"
    );
    const result = await aggregatePerTarget([], vi.fn());

    expect(result.refs).toHaveLength(0);
    expect(result.confidence).toBe("unavailable");
    expect(result.externalCount).toBe(0);
  });
});

// ── formatReferenceList ────────────────────────────────────────────────────

describe("formatReferenceList", () => {
  it("groups refs by file and appends per-file sections", async () => {
    const { formatReferenceList } = await import(
      "../../src/use-case/support/semantic-references.ts"
    );
    const lines: string[] = [];

    formatReferenceList(
      lines,
      [
        { file: "src/a.ts", line: 5 },
        { file: "src/a.ts", line: 10 },
        { file: "src/b.ts", line: 3 },
      ],
      5,
      tmpDir,
    );

    const aIdx = lines.findIndex((l) => l.includes("### src/a.ts"));
    const bIdx = lines.findIndex((l) => l.includes("### src/b.ts"));
    expect(aIdx).toBeGreaterThanOrEqual(0);
    expect(bIdx).toBeGreaterThan(aIdx);
    expect(lines).toContain("- L5");
    expect(lines).toContain("- L10");
    expect(lines).toContain("- L3");
  });

  it("caps per-file lines at 5 with omitted notice", async () => {
    const { formatReferenceList } = await import(
      "../../src/use-case/support/semantic-references.ts"
    );
    const lines: string[] = [];
    const refs = Array.from({ length: 8 }, (_, i) => ({ file: "src/a.ts", line: i + 1 }));

    formatReferenceList(lines, refs, 5, tmpDir);

    expect(lines).toContain("- L1");
    expect(lines).toContain("- L5");
    expect(lines.some((l) => l.includes("more in this file"))).toBe(true);
  });

  it("caps total files at maxResults with omitted notice", async () => {
    const { formatReferenceList } = await import(
      "../../src/use-case/support/semantic-references.ts"
    );
    const lines: string[] = [];
    const refs = [
      { file: "src/a.ts", line: 1 },
      { file: "src/b.ts", line: 1 },
      { file: "src/c.ts", line: 1 },
      { file: "src/d.ts", line: 1 },
    ];

    formatReferenceList(lines, refs, 2, tmpDir);

    expect(lines.some((l) => l.includes("### src/a.ts"))).toBe(true);
    expect(lines.some((l) => l.includes("### src/d.ts"))).toBe(false);
    expect(lines.some((l) => l.includes("more files omitted"))).toBe(true);
  });

  it("is a no-op with empty refs", async () => {
    const { formatReferenceList } = await import(
      "../../src/use-case/support/semantic-references.ts"
    );
    const lines: string[] = [];

    formatReferenceList(lines, [], 5, tmpDir);

    expect(lines).toHaveLength(0);
  });
});
