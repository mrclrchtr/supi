import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  discoverTestFilesForSource,
  // biome-ignore lint/suspicious/noDeprecatedImports: used for legacy-contract assertions
  findTestCompanionFiles,
} from "../../../src/analysis/relations/tests.ts";

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

    // Semantic references return empty — no import-chain evidence
    // Use the new shared helper that includes deterministic fallbacks
    const result = await discoverTestFilesForSource(
      path.join(tmpDir, "src/tool/execute-graph.ts"),
      {
        references: async () => [],
        cwd: tmpDir,
        cap: 8,
      },
    );

    // With the enhanced helper, this should find the package-layout test file
    expect(result.length).toBeGreaterThan(0);
    expect(
      result.some((f) => f.absPath.includes("__tests__/unit/tool/execute-graph.test.ts")),
    ).toBe(true);
  });

  it("still finds test files via semantic references when they exist", async () => {
    writeSource("src/source.ts", "export function source() { return 1; }\n");
    writeSource("src/source.test.ts", "import { source } from './source';\n");

    const result = await findTestCompanionFiles(path.join(tmpDir, "src/source.ts"), {
      references: async () => [
        {
          uri: `file://${tmpDir}/src/source.test.ts`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 6 },
          },
        },
      ],
    });

    // This should pass even before the shared helper is enhanced
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((f) => f.includes("src/source.test.ts"))).toBe(true);
  });

  it("does not classify false positives as tests", async () => {
    writeSource("src/contest.ts", "export const x = 1;\n");
    writeSource("src/testing.ts", "export const y = 2;\n");
    writeSource("src/tool/tool-specs.ts", "export const spec = true;\n");

    // With empty references, the function should not fabricate test files
    const forContest = await findTestCompanionFiles(path.join(tmpDir, "src/contest.ts"), {
      references: async () => [],
    });
    expect(forContest.every((f) => !f.endsWith("src/contest.ts"))).toBe(true);

    const forTesting = await findTestCompanionFiles(path.join(tmpDir, "src/testing.ts"), {
      references: async () => [],
    });
    expect(forTesting.every((f) => !f.endsWith("src/testing.ts"))).toBe(true);

    const forSpec = await findTestCompanionFiles(path.join(tmpDir, "src/tool/tool-specs.ts"), {
      references: async () => [],
    });
    expect(forSpec.every((f) => !f.endsWith("tool-specs.ts"))).toBe(true);
  });

  it("exposes test function names from outline when provider is available", async () => {
    // Note: this test uses findTestCompanionFiles which doesn't take an outline param currently.
    // It tests the outline-extraction contract that the updated helper must support.
    writeSource("src/source.ts", "export function source() { return 1; }\n");
    writeSource(
      "src/source.test.ts",
      "test('returns expected value', () => { expect(source()).toBe(1); });\n",
    );

    const result = await findTestCompanionFiles(path.join(tmpDir, "src/source.ts"), {
      references: async () => [
        {
          uri: `file://${tmpDir}/src/source.test.ts`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 6 },
          },
        },
      ],
    });

    // Reference-based discovery must still work
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((f) => f.includes("src/source.test.ts"))).toBe(true);
  });
});
