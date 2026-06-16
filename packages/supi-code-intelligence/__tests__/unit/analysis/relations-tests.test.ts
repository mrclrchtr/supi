import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverTestFilesForSource } from "../../../src/analysis/relations/tests.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "relations-tests-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeSource(relPath: string, source: string): void {
  const absPath = path.join(tmpDir, relPath);
  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(absPath, source);
}

describe("shared test discovery contract", () => {
  it("discovers package-layout test file when semantic references are empty", async () => {
    // Simulate a typical package layout:
    //   src/tool/execute-graph.ts (source)
    //   __tests__/unit/tool/execute-graph.test.ts (test)
    writeSource("src/tool/execute-graph.ts", "export function executeGraph() { return 1; }\n");
    writeSource(
      "__tests__/unit/tool/execute-graph.test.ts",
      "import { executeGraph } from '../../src/tool/execute-graph';\n",
    );
    // Write a package.json to signal a package root
    writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "test-pkg" }));

    // Semantic references return empty — no import-chain evidence.
    // With the enhanced helper, this should still find the package-layout test file.
    const { files, provenance } = await discoverTestFilesForSource(
      path.join(tmpDir, "src/tool/execute-graph.ts"),
      {
        references: async () => [],
        cwd: tmpDir,
        cap: 8,
      },
    );

    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.absPath.includes("__tests__/unit/tool/execute-graph.test.ts"))).toBe(
      true,
    );
    // References returned empty -> provenance is conventions-only
    expect(provenance).toBe("conventions-only");
  });

  it("still finds test files via semantic references when they exist", async () => {
    writeSource("src/source.ts", "export function source() { return 1; }\n");
    writeSource("src/source.test.ts", "import { source } from './source';\n");

    const { files } = await discoverTestFilesForSource(path.join(tmpDir, "src/source.ts"), {
      references: async () => [
        {
          uri: `file://${tmpDir}/src/source.test.ts`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 6 },
          },
        },
      ],
      cwd: tmpDir,
    });

    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.absPath.includes("src/source.test.ts"))).toBe(true);
  });

  it("does not classify false positives as tests", async () => {
    writeSource("src/contest.ts", "export const x = 1;\n");
    writeSource("src/testing.ts", "export const y = 2;\n");
    writeSource("src/tool/tool-specs.ts", "export const spec = true;\n");

    // With empty references, the function should not fabricate test files
    const forContest = await discoverTestFilesForSource(path.join(tmpDir, "src/contest.ts"), {
      references: async () => [],
      cwd: tmpDir,
    });
    expect(forContest.files.every((f) => !f.absPath.endsWith("src/contest.ts"))).toBe(true);

    const forTesting = await discoverTestFilesForSource(path.join(tmpDir, "src/testing.ts"), {
      references: async () => [],
      cwd: tmpDir,
    });
    expect(forTesting.files.every((f) => !f.absPath.endsWith("src/testing.ts"))).toBe(true);

    const forSpec = await discoverTestFilesForSource(path.join(tmpDir, "src/tool/tool-specs.ts"), {
      references: async () => [],
      cwd: tmpDir,
    });
    expect(forSpec.files.every((f) => !f.absPath.endsWith("tool-specs.ts"))).toBe(true);
  });

  it("reports conventions-only provenance when no semantic provider contributes", async () => {
    writeSource("src/source.ts", "export function source() { return 1; }\n");
    writeSource("src/source.test.ts", "import { source } from './source';\n");

    // No references provider — only conventions run
    const { files, provenance } = await discoverTestFilesForSource(
      path.join(tmpDir, "src/source.ts"),
      {
        cwd: tmpDir,
      },
    );

    // Conventions should find the same-directory companion
    expect(files.length).toBeGreaterThan(0);
    expect(provenance).toBe("conventions-only");
  });

  it("filters test names to describe/it/test/spec-like blocks only", async () => {
    writeSource("src/source.ts", "export function source() { return 1; }\n");

    const { files } = await discoverTestFilesForSource(path.join(tmpDir, "src/source.ts"), {
      cwd: tmpDir,
      outline: async () => ({
        kind: "success" as const,
        data: [
          {
            name: "tmpDir",
            kind: "const",
            startLine: 1,
            endLine: 1,
            startCharacter: 0,
            endCharacter: 0,
          },
          {
            name: "describe('source')",
            kind: "function",
            startLine: 2,
            endLine: 2,
            startCharacter: 0,
            endCharacter: 0,
          },
          {
            name: "it('returns expected')",
            kind: "function",
            startLine: 3,
            endLine: 3,
            startCharacter: 0,
            endCharacter: 0,
          },
          {
            name: "writeSource",
            kind: "function",
            startLine: 4,
            endLine: 4,
            startCharacter: 0,
            endCharacter: 0,
          },
          {
            name: "result",
            kind: "const",
            startLine: 5,
            endLine: 5,
            startCharacter: 0,
            endCharacter: 0,
          },
        ],
      }),
      references: async () => [
        {
          uri: `file://${tmpDir}/src/source.test.ts`,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
        },
      ],
      cap: 8,
    });

    // Only describe/it names survive filtering, not tmpDir/writeSource/result
    for (const file of files) {
      expect(file.testNames).not.toContain("tmpDir");
      expect(file.testNames).not.toContain("writeSource");
      expect(file.testNames).not.toContain("result");
    }
  });
});
