import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createPiMock, getTool, getTools, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../src/code-intelligence.ts";
import { executeImpactTool } from "../../src/tool/execute-impact.ts";
import { findLikelyTests } from "../../src/use-case/generate-impact.ts";
import { clearMockRuntime, registerMockProvider } from "../helpers/register-mock-runtime.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-impact-"));
  writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "impact-ws" }, null, 2));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  clearMockRuntime();
});

async function resolveTargetId(pi: ReturnType<typeof createPiMock>): Promise<string> {
  const resolveTool = getTool(pi, "code_resolve");
  const resolveResult = (await resolveTool.execute(
    "impact-resolve",
    { file: "index.ts", line: 1, character: 14 },
    undefined,
    undefined,
    makeCtx({ cwd: tmpDir }),
  )) as {
    details?: {
      data?: { targets?: Array<{ targetId: string }> };
    };
  };

  const targetId = resolveResult.details?.data?.targets?.[0]?.targetId;
  expect(targetId).toBeDefined();
  return targetId as string;
}

describe("code_impact tool", () => {
  it("is registered as an active public tool", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_impact");
    expect(tool).toBeDefined();
    expect(tool.name).toBe("code_impact");
    expect(typeof tool.execute).toBe("function");
    expect(tool.parameters).toBeDefined();
  });

  it("has parameters matching the planned V2 schema", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_impact") as {
      parameters?: { properties?: Record<string, unknown> };
    };

    const props = tool.parameters?.properties;
    expect(props).toBeDefined();
    expect(props).toHaveProperty("targetId");
    expect(props).toHaveProperty("change");
    expect(props).toHaveProperty("changedFiles");
    expect(props).toHaveProperty("includeTests");
    expect(props).toHaveProperty("maxResults");
  });

  it("runs impact analysis from a resolved targetId", async () => {
    writeFileSync(path.join(tmpDir, "index.ts"), "export const foo = 1;\n");
    registerMockProvider(tmpDir, {
      exports: async () => ({
        kind: "success" as const,
        data: [
          {
            name: "foo",
            kind: "const",
            startLine: 1,
            startCharacter: 14,
            endLine: 1,
            endCharacter: 17,
          },
        ],
      }),
      references: async () => [],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const targetId = await resolveTargetId(pi);
    const impactResult = await executeImpactTool({ targetId }, { cwd: tmpDir });
    expect(impactResult.content).toContain("Impact");

    const impactTool = getTool(pi, "code_impact");
    const result = (await impactTool.execute(
      "impact-target-id",
      { targetId },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: {
        type: string;
        data?: { confidence?: string; nextQueries?: string[] };
      };
    };

    expect(result.content[0].text).not.toContain("**Error");
    expect(result.content[0].text).toContain("Impact");
    expect(result.details?.type).toBe("impact");
    if (result.details?.type === "impact") {
      expect(result.details.data?.confidence).toBe("semantic");
      expect(result.details.data?.nextQueries).toEqual(
        expect.arrayContaining([expect.stringContaining("code_inspect")]),
      );
      expect(result.details.data?.nextQueries).not.toEqual(
        expect.arrayContaining([expect.stringContaining("`code_brief` with `file:")]),
      );
    }
  });

  it("accepts changedFiles with includeTests without requiring an anchored target", async () => {
    writeFileSync(path.join(tmpDir, "src.ts"), "export const changed = true;\n");
    writeFileSync(
      path.join(tmpDir, "src.test.ts"),
      "import { changed } from './src';\nvoid changed;\n",
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const impactTool = getTool(pi, "code_impact");

    const result = (await impactTool.execute(
      "impact-changed-files",
      {
        changedFiles: ["src.ts"],
        includeTests: true,
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: {
        type: string;
        data?: { nextQueries?: string[] };
      };
    };

    expect(result.content[0].text).not.toContain("**Error");
    expect(result.content[0].text).toContain("Impact");
    expect(result.content[0].text).toContain("src.ts");
    expect(result.content[0].text).toContain("Likely Tests");
    expect(result.details?.type).toBe("impact");
    if (result.details?.type === "impact") {
      expect(result.details.data?.nextQueries).toEqual(
        expect.arrayContaining([expect.stringContaining("code_context")]),
      );
    }
  });

  it("returns an explicit insufficient-evidence result for change-only requests instead of heuristic guessing", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const impactTool = getTool(pi, "code_impact");

    const result = (await impactTool.execute(
      "impact-change-only",
      { change: "rename foo to bar" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: {
        type: string;
        data?: { confidence?: string; nextQueries?: string[] };
      };
    };

    expect(result.content[0].text).toContain("insufficient evidence");
    expect(result.content[0].text).toContain("changedFiles");
    expect(result.content[0].text).not.toContain("heuristic");
    expect(result.details?.type).toBe("impact");
    if (result.details?.type === "impact") {
      expect(result.details.data?.confidence).toBe("unavailable");
      expect(result.details.data?.nextQueries).toEqual(
        expect.arrayContaining([expect.stringContaining("code_resolve")]),
      );
    }
  });

  it("does not register code_affected on the public tool surface", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const names = getTools(pi).map((tool) => tool.name);
    expect(names).not.toContain("code_affected");
  });
});

describe("findLikelyTests boundary awareness", () => {
  function pathSet(...files: string[]): Set<string> {
    return new Set(files.map((f) => path.resolve(tmpDir, f)));
  }

  it("does not match tool-specs.ts as a test file (regression for substring bug)", () => {
    const affected = pathSet("packages/supi-code-intelligence/src/tool/tool-specs.ts");
    const tests = findLikelyTests(affected, tmpDir);
    expect(tests.map((t) => t.path)).not.toContain(
      path.resolve(tmpDir, "packages/supi-code-intelligence/src/tool/tool-specs.ts"),
    );
  });

  it("does not match contest.ts (test substring in middle of regular word)", () => {
    const affected = pathSet("src/contest.ts");
    const tests = findLikelyTests(affected, tmpDir);
    expect(tests.map((t) => t.path)).not.toContain(path.resolve(tmpDir, "src/contest.ts"));
  });

  it("does not match testing.ts (no .test. boundary)", () => {
    const affected = pathSet("src/testing.ts");
    const tests = findLikelyTests(affected, tmpDir);
    expect(tests.map((t) => t.path)).not.toContain(path.resolve(tmpDir, "src/testing.ts"));
  });

  it("matches myModule.test.ts via .test. boundary", () => {
    const affected = pathSet("src/myModule.test.ts");
    const tests = findLikelyTests(affected, tmpDir);
    expect(tests.map((t) => t.path)).toContain(path.resolve(tmpDir, "src/myModule.test.ts"));
    expect(
      tests.find((t) => t.path === path.resolve(tmpDir, "src/myModule.test.ts"))?.provenance,
    ).toBe("name heuristic");
  });

  it("matches myModule.spec.ts via .spec. boundary", () => {
    const affected = pathSet("src/myModule.spec.ts");
    const tests = findLikelyTests(affected, tmpDir);
    expect(tests.map((t) => t.path)).toContain(path.resolve(tmpDir, "src/myModule.spec.ts"));
  });

  it("matches __tests__/myModule.ts via /__tests__/ directory", () => {
    const affected = pathSet("src/__tests__/myModule.ts");
    const tests = findLikelyTests(affected, tmpDir);
    expect(tests.map((t) => t.path)).toContain(path.resolve(tmpDir, "src/__tests__/myModule.ts"));
  });

  it("includes companion test files as fallback for non-test-named affected files", () => {
    // Create source file and companion test file
    mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    writeFileSync(path.join(tmpDir, "src/myModule.ts"), "export const x = 1;\n");
    writeFileSync(path.join(tmpDir, "src/myModule.test.ts"), "test('x', () => {});\n");

    const affected = pathSet("src/myModule.ts");
    const tests = findLikelyTests(affected, tmpDir);
    expect(tests.map((t) => t.path)).toContain(path.resolve(tmpDir, "src/myModule.test.ts"));
    expect(
      tests.find((t) => t.path === path.resolve(tmpDir, "src/myModule.test.ts"))?.provenance,
    ).toBe("companion file");
  });

  it("deduplicates when regex and companions find the same file", () => {
    // Create both: affected file is a test file itself AND has a companion
    mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    writeFileSync(path.join(tmpDir, "src/myModule.ts"), "export const x = 1;\n");
    writeFileSync(path.join(tmpDir, "src/myModule.test.ts"), "test('x', () => {});\n");

    // Include both the source and the test in affected files
    const affected = pathSet("src/myModule.ts", "src/myModule.test.ts");
    const tests = findLikelyTests(affected, tmpDir);

    const testFilePath = path.resolve(tmpDir, "src/myModule.test.ts");
    const occurrences = tests.filter((t) => t.path === testFilePath).length;
    expect(occurrences).toBe(1);
  });

  it("returns up to 3 test files, sorted by path", () => {
    writeFileSync(path.join(tmpDir, "a.test.ts"), "");
    writeFileSync(path.join(tmpDir, "b.spec.ts"), "");
    writeFileSync(path.join(tmpDir, "c.test.ts"), "");
    writeFileSync(path.join(tmpDir, "d.test.ts"), "");

    const affected = pathSet("a.test.ts", "b.spec.ts", "c.test.ts", "d.test.ts");
    const tests = findLikelyTests(affected, tmpDir);
    expect(tests.length).toBeLessThanOrEqual(3);
  });

  it("returns empty array for empty affected files", () => {
    const tests = findLikelyTests(new Set(), tmpDir);
    expect(tests).toEqual([]);
  });
});
