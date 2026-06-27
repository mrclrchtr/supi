import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
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
    expect(props).toHaveProperty("changeSetFiles");
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
    expect(result.content[0].text).toContain("## Read Next");
    expect(result.content[0].text).toContain("inspect the target before editing");
    expect(result.content[0].text).toContain("`read` offset 1, limit");
    expect(result.details?.type).toBe("impact");
    if (result.details?.type === "impact") {
      expect(result.details.data?.confidence).toBe("semantic");
      expect(result.details.data?.nextQueries).toEqual(
        expect.arrayContaining([expect.stringContaining("code_inspect")]),
      );
      expect(result.details.data?.nextQueries).not.toEqual(
        expect.arrayContaining([expect.stringContaining("`code_orientation` with `file:")]),
      );
    }
  });

  it("discloses truncated target reference evidence in markdown and details", async () => {
    writeFileSync(path.join(tmpDir, "index.ts"), "export const foo = 1;\n");
    writeFileSync(path.join(tmpDir, "consumer-a.ts"), "foo;\n");
    writeFileSync(path.join(tmpDir, "consumer-b.ts"), "foo;\n");
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
      references: async () => [
        {
          uri: `file://${path.join(tmpDir, "consumer-a.ts")}`,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
        },
        {
          uri: `file://${path.join(tmpDir, "consumer-b.ts")}`,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
        },
      ],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi);
    const impactTool = getTool(pi, "code_impact");

    const result = (await impactTool.execute(
      "impact-reference-truncation",
      { targetId, maxResults: 1 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: {
        type: "impact";
        data?: {
          omittedCount?: number;
          evidenceLists?: Array<{
            key: string;
            totalCount: number | null;
            shownCount: number;
            omittedCount: number | null;
          }>;
        };
      };
    };

    expect(result.content[0].text).toContain("consumer-a.ts");
    expect(result.content[0].text).not.toContain("consumer-b.ts");
    expect(result.content[0].text).toContain("_(showing 1 of 2; 1 omitted)_");
    expect(result.details?.data?.evidenceLists).toContainEqual({
      key: "references.locations",
      totalCount: 2,
      shownCount: 1,
      omittedCount: 1,
      partialReason: null,
    });
  });

  it("accepts changeSetFiles with includeTests without requiring an anchored target", async () => {
    writeFileSync(path.join(tmpDir, "src.ts"), "export const changed = true;\n");
    writeFileSync(
      path.join(tmpDir, "src.test.ts"),
      "import { changed } from './src';\nvoid changed;\n",
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const impactTool = getTool(pi, "code_impact");

    const result = (await impactTool.execute(
      "impact-change-set",
      {
        changeSetFiles: ["src.ts"],
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
    expect(result.content[0].text).toContain("**Evidence: structural**");
    expect(result.details?.type).toBe("impact");
    if (result.details?.type === "impact") {
      expect(result.details.data?.nextQueries).toEqual(
        expect.arrayContaining([expect.stringContaining("code_orientation")]),
      );
    }
  });

  it("merges semantic references into changeSetFiles impact when available", async () => {
    mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    writeFileSync(path.join(tmpDir, "src.ts"), "export const changed = true;\n");
    writeFileSync(
      path.join(tmpDir, "src/consumer.ts"),
      "import { changed } from '../src';\nvoid changed;\n",
    );

    registerMockProvider(tmpDir, {
      exports: async () => ({
        kind: "success" as const,
        data: [
          {
            name: "changed",
            kind: "const",
            startLine: 1,
            startCharacter: 14,
            endLine: 1,
            endCharacter: 21,
          },
        ],
      }),
      references: async () => [
        {
          uri: `file://${path.join(tmpDir, "src/consumer.ts")}`,
          range: {
            start: { line: 0, character: 9 },
            end: { line: 0, character: 16 },
          },
        },
      ],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const impactTool = getTool(pi, "code_impact");

    const result = (await impactTool.execute(
      "impact-change-set-semantic",
      {
        changeSetFiles: ["src.ts"],
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: { type: string; data?: { confidence?: string; checkNext?: string[] } };
    };

    expect(result.content[0].text).toContain("**Evidence: semantic+structural**");
    expect(result.content[0].text).toContain("consumer.ts");
    expect(result.details?.type).toBe("impact");
    if (result.details?.type === "impact") {
      expect(result.details.data?.confidence).toBe("semantic");
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
    expect(result.content[0].text).toContain("changeSetFiles");
    expect(result.content[0].text).not.toContain("heuristic");
    expect(result.details?.type).toBe("impact");
    if (result.details?.type === "impact") {
      expect(result.details.data?.confidence).toBe("unavailable");
      expect(result.details.data?.nextQueries).toEqual(
        expect.arrayContaining([expect.stringContaining("code_resolve")]),
      );
    }
  });

  it("reports likely tests for target-based impact with zero semantic references (regression for audit failure)", async () => {
    // Package layout: source in src/tool/execute-graph.ts
    // Test in __tests__/unit/tool/execute-graph.test.ts
    // No semantic reference from test to source.
    mkdirSync(path.join(tmpDir, "src", "tool"), { recursive: true });
    writeFileSync(
      path.join(tmpDir, "src/tool/execute-graph.ts"),
      "export function executeGraph() { return 1; }\n",
    );
    mkdirSync(path.join(tmpDir, "__tests__", "unit", "tool"), { recursive: true });
    writeFileSync(
      path.join(tmpDir, "__tests__/unit/tool/execute-graph.test.ts"),
      "import { executeGraph } from '../../src/tool/execute-graph';\n",
    );

    registerMockProvider(tmpDir, {
      exports: async () => ({
        kind: "success" as const,
        data: [
          {
            name: "executeGraph",
            kind: "function",
            startLine: 1,
            startCharacter: 14,
            endLine: 1,
            endCharacter: 29,
          },
        ],
      }),
      references: async () => [],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const resolveTool = getTool(pi, "code_resolve");
    const resolveResult = (await resolveTool.execute(
      "impact-resolve",
      { file: "src/tool/execute-graph.ts", line: 1, character: 17 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      details?: { data?: { targets?: Array<{ targetId: string }> } };
    };
    const targetId = resolveResult.details?.data?.targets?.[0]?.targetId;
    expect(targetId).toBeDefined();

    const impactTool = getTool(pi, "code_impact");
    const result = (await impactTool.execute(
      "impact-package-layout",
      { targetId, includeTests: true },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: { type: string; data?: { likelyTests?: string[]; downstreamCount?: number } };
    };

    expect(result.content[0].text).toContain("__tests__/unit/tool/execute-graph.test.ts");
    expect(result.details?.type).toBe("impact");
    if (result.details?.type === "impact") {
      expect(result.details.data?.likelyTests?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("surfaces semantic provenance and tests details for target-based semantic companion tests", async () => {
    mkdirSync(path.join(tmpDir, "src", "tool"), { recursive: true });
    writeFileSync(
      path.join(tmpDir, "src/tool/execute-find.ts"),
      "export function executeFind() { return 1; }\n",
    );
    mkdirSync(path.join(tmpDir, "__tests__"), { recursive: true });
    writeFileSync(
      path.join(tmpDir, "__tests__/code-find-tool.test.ts"),
      [
        "import { executeFind } from '../src/tool/execute-find';",
        "describe('executeFind', () => {",
        "  it('runs the query', () => {",
        "    expect(executeFind()).toBe(1);",
        "  });",
        "});",
      ].join("\n"),
    );

    registerMockProvider(tmpDir, {
      exports: async () => ({
        kind: "success" as const,
        data: [
          {
            name: "executeFind",
            kind: "function",
            startLine: 1,
            startCharacter: 17,
            endLine: 1,
            endCharacter: 28,
          },
        ],
      }),
      references: async () => [
        {
          uri: `file://${path.join(tmpDir, "__tests__/code-find-tool.test.ts")}`,
          range: {
            start: { line: 0, character: 9 },
            end: { line: 0, character: 20 },
          },
        },
      ],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const resolveTool = getTool(pi, "code_resolve");
    const resolveResult = (await resolveTool.execute(
      "impact-semantic-tests-resolve",
      { file: "src/tool/execute-find.ts", line: 1, character: 20 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      details?: { data?: { targets?: Array<{ targetId: string }> } };
    };
    const targetId = resolveResult.details?.data?.targets?.[0]?.targetId;
    expect(targetId).toBeDefined();

    const impactTool = getTool(pi, "code_impact");
    const result = (await impactTool.execute(
      "impact-semantic-tests",
      { targetId, includeTests: true },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: {
        type: string;
        data?: {
          likelyTests?: string[];
          tests?: {
            provenance?: string;
            status?: string;
            files?: Array<{ file: string; labelStatus: string; labels: string[] }>;
          };
        };
      };
    };

    expect(result.content[0].text).toContain("Likely Tests (semantic+conventions)");
    expect(result.content[0].text).toContain("__tests__/code-find-tool.test.ts");
    expect(result.details?.type).toBe("impact");
    if (result.details?.type === "impact") {
      expect(result.details.data?.likelyTests).toContain("__tests__/code-find-tool.test.ts");
      expect(result.details.data?.tests?.provenance).toBe("semantic+conventions");
      expect(result.details.data?.tests?.status).toBe("found");
      expect(result.details.data?.tests?.files?.[0]?.file).toBe("__tests__/code-find-tool.test.ts");
      expect(result.details.data?.tests?.files?.[0]?.labelStatus).toBe("recognized");
      expect(result.details.data?.tests?.files?.[0]?.labels?.[0]).toContain("it('runs the query')");
    }
  });

  it("discovers bounded tool test via conventions-only impact", async () => {
    // Source src/tool/execute-find.ts, test __tests__/unit/code-find-tool.test.ts
    mkdirSync(path.join(tmpDir, "src", "tool"), { recursive: true });
    writeFileSync(
      path.join(tmpDir, "src/tool/execute-find.ts"),
      "export function executeFind() { return 1; }\n",
    );
    mkdirSync(path.join(tmpDir, "__tests__", "unit"), { recursive: true });
    writeFileSync(
      path.join(tmpDir, "__tests__/unit/code-find-tool.test.ts"),
      "import { executeFind } from '../../src/tool/execute-find';\n",
    );

    registerMockProvider(tmpDir, {
      exports: async () => ({
        kind: "success" as const,
        data: [
          {
            name: "executeFind",
            kind: "function",
            startLine: 1,
            startCharacter: 17,
            endLine: 1,
            endCharacter: 28,
          },
        ],
      }),
      references: async () => [],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const resolveTool = getTool(pi, "code_resolve");
    const resolveResult = (await resolveTool.execute(
      "impact-resolve",
      { file: "src/tool/execute-find.ts", line: 1, character: 17 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      details?: { data?: { targets?: Array<{ targetId: string }> } };
    };
    const targetId = resolveResult.details?.data?.targets?.[0]?.targetId;
    expect(targetId).toBeDefined();

    const impactTool = getTool(pi, "code_impact");
    const result = (await impactTool.execute(
      "impact-bounded-tool-test",
      { targetId, includeTests: true },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // After bounded discovery, this should find __tests__/unit/code-find-tool.test.ts.
    expect(result.content[0].text).toContain("__tests__/unit/code-find-tool.test.ts");
  });

  it("renders explicit empty-test note when includeTests is true but no tests found", async () => {
    // Source file with no companion, package-layout, or bounded test files
    mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    writeFileSync(path.join(tmpDir, "src/standalone.ts"), "export const value = 42;\n");

    registerMockProvider(tmpDir, {
      exports: async () => ({
        kind: "success" as const,
        data: [
          {
            name: "value",
            kind: "const",
            startLine: 1,
            startCharacter: 14,
            endLine: 1,
            endCharacter: 19,
          },
        ],
      }),
      references: async () => [],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const resolveTool = getTool(pi, "code_resolve");
    const resolveResult = (await resolveTool.execute(
      "impact-resolve-empty",
      { file: "src/standalone.ts", line: 1, character: 17 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      details?: { data?: { targets?: Array<{ targetId: string }> } };
    };
    const targetId = resolveResult.details?.data?.targets?.[0]?.targetId;
    expect(targetId).toBeDefined();

    const impactTool = getTool(pi, "code_impact");
    const result = (await impactTool.execute(
      "impact-empty-tests",
      { targetId, includeTests: true },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: { type: string; data?: { tests?: { status?: string; files?: unknown[] } } };
    };

    // Should render explicit note instead of silently omitting test info.
    expect(result.content[0].text).toContain(
      "No likely tests found by bounded companion/package discovery.",
    );
    expect(result.details?.type).toBe("impact");
    if (result.details?.type === "impact") {
      expect(result.details.data?.tests?.status).toBe("empty");
      expect(result.details.data?.tests?.files).toEqual([]);
    }
  });

  it("ignores __tests__/helpers support files for target-based likely tests", async () => {
    writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify(
        {
          name: "impact-ws",
          scripts: { test: "vitest run" },
        },
        null,
        2,
      ),
    );
    mkdirSync(path.join(tmpDir, "src", "tool"), { recursive: true });
    writeFileSync(
      path.join(tmpDir, "src/tool/execute-graph.ts"),
      "export function executeGraph() { return 1; }\n",
    );
    mkdirSync(path.join(tmpDir, "__tests__", "unit", "tool"), { recursive: true });
    mkdirSync(path.join(tmpDir, "__tests__", "helpers"), { recursive: true });
    writeFileSync(
      path.join(tmpDir, "__tests__/unit/tool/execute-graph.test.ts"),
      "import { executeGraph } from '../../../src/tool/execute-graph';\nvoid executeGraph;\n",
    );
    writeFileSync(
      path.join(tmpDir, "__tests__/helpers/execute-action.ts"),
      "import { executeGraph } from '../../src/tool/execute-graph';\nvoid executeGraph;\n",
    );

    registerMockProvider(tmpDir, {
      exports: async () => ({
        kind: "success" as const,
        data: [
          {
            name: "executeGraph",
            kind: "function",
            startLine: 1,
            startCharacter: 14,
            endLine: 1,
            endCharacter: 29,
          },
        ],
      }),
      references: async (file) =>
        file.endsWith("execute-graph.ts")
          ? [
              {
                uri: `file://${path.join(tmpDir, "__tests__/unit/tool/execute-graph.test.ts")}`,
                range: {
                  start: { line: 0, character: 9 },
                  end: { line: 0, character: 21 },
                },
              },
              {
                uri: `file://${path.join(tmpDir, "__tests__/helpers/execute-action.ts")}`,
                range: {
                  start: { line: 0, character: 9 },
                  end: { line: 0, character: 21 },
                },
              },
            ]
          : [],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const resolveTool = getTool(pi, "code_resolve");
    const resolveResult = (await resolveTool.execute(
      "impact-resolve-helpers",
      { file: "src/tool/execute-graph.ts", line: 1, character: 17 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      details?: { data?: { targets?: Array<{ targetId: string }> } };
    };
    const targetId = resolveResult.details?.data?.targets?.[0]?.targetId;
    expect(targetId).toBeDefined();

    const impactTool = getTool(pi, "code_impact");
    const result = (await impactTool.execute(
      "impact-ignore-test-helpers",
      { targetId, includeTests: true },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: {
        type: string;
        data?: { likelyTests?: string[]; likelyTestCommands?: string[] };
      };
    };

    expect(result.content[0].text).toContain("__tests__/unit/tool/execute-graph.test.ts");
    expect(result.content[0].text).not.toContain(
      "pnpm vitest run __tests__/helpers/execute-action.ts --reporter=verbose",
    );
    if (result.details?.type === "impact") {
      expect(result.details.data?.likelyTests).toContain(
        "__tests__/unit/tool/execute-graph.test.ts",
      );
      expect(result.details.data?.likelyTests).not.toContain("__tests__/helpers/execute-action.ts");
      expect(result.details.data?.likelyTestCommands).toContain(
        "pnpm vitest run __tests__/unit/tool/execute-graph.test.ts --reporter=verbose",
      );
      expect(result.details.data?.likelyTestCommands).not.toContain(
        "pnpm vitest run __tests__/helpers/execute-action.ts --reporter=verbose",
      );
    }
  });

  it("reports likely tests for change-set impact with package-layout mirrors", async () => {
    // Package layout: source src/tool/execute-graph.ts, test __tests__/unit/tool/execute-graph.test.ts
    mkdirSync(path.join(tmpDir, "src", "tool"), { recursive: true });
    writeFileSync(
      path.join(tmpDir, "src/tool/execute-graph.ts"),
      "export function executeGraph() { return 1; }\n",
    );
    mkdirSync(path.join(tmpDir, "__tests__", "unit", "tool"), { recursive: true });
    writeFileSync(
      path.join(tmpDir, "__tests__/unit/tool/execute-graph.test.ts"),
      "import { executeGraph } from '../../src/tool/execute-graph';\n",
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const impactTool = getTool(pi, "code_impact");

    const result = (await impactTool.execute(
      "impact-changed-pkg",
      {
        changeSetFiles: ["src/tool/execute-graph.ts"],
        includeTests: true,
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: { type: string; data?: { likelyTests?: string[] } };
    };

    expect(result.content[0].text).toContain("__tests__/unit/tool/execute-graph.test.ts");
    expect(result.content[0].text).toContain("Likely Tests (conventions-only)");
    expect(result.content[0].text).not.toContain("semantic+conventions");
    expect(result.content[0].text).not.toContain(tmpDir);
    expect(result.content[0].text).not.toContain("Likely Test Commands");
    if (result.details?.type === "impact") {
      expect(result.details.data?.likelyTests).toContain(
        "__tests__/unit/tool/execute-graph.test.ts",
      );
    }
  });

  it("ignores semantic-only test references for change-set impact", async () => {
    mkdirSync(path.join(tmpDir, "src", "tool"), { recursive: true });
    writeFileSync(
      path.join(tmpDir, "src/tool/execute-find.ts"),
      "export function executeFind() { return 1; }\n",
    );
    mkdirSync(path.join(tmpDir, "__tests__"), { recursive: true });
    writeFileSync(
      path.join(tmpDir, "__tests__/code-find-tool.test.ts"),
      "import { executeFind } from '../src/tool/execute-find';\nvoid executeFind;\n",
    );

    registerMockProvider(tmpDir, {
      documentSymbols: async () => null,
      references: async (file) =>
        file.endsWith("execute-find.ts")
          ? [
              {
                uri: `file://${path.join(tmpDir, "__tests__/code-find-tool.test.ts")}`,
                range: {
                  start: { line: 0, character: 9 },
                  end: { line: 0, character: 20 },
                },
              },
            ]
          : [],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const impactTool = getTool(pi, "code_impact");

    const result = (await impactTool.execute(
      "impact-changed-semantic-tests",
      {
        changeSetFiles: ["src/tool/execute-find.ts"],
        includeTests: true,
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: { type: string; data?: { likelyTests?: string[] } };
    };

    expect(result.content[0].text).not.toContain("__tests__/code-find-tool.test.ts");
    expect(result.content[0].text).toContain(
      "No likely tests found by bounded companion/package discovery.",
    );
    expect(result.content[0].text).toContain("**Evidence: structural**");
    expect(result.content[0].text).not.toContain("Likely Test Commands");
    if (result.details?.type === "impact") {
      expect(result.details.data?.likelyTests ?? []).toEqual([]);
    }
  });

  it("emits Vitest commands only when the workspace clearly uses Vitest", async () => {
    writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify(
        {
          name: "impact-ws",
          scripts: { test: "vitest run" },
        },
        null,
        2,
      ),
    );
    mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    writeFileSync(path.join(tmpDir, "src/module.ts"), "export const value = 42;\n");
    writeFileSync(path.join(tmpDir, "src/module.test.ts"), "test('value', () => {});\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const impactTool = getTool(pi, "code_impact");

    const result = (await impactTool.execute(
      "impact-vitest-commands",
      {
        changeSetFiles: ["src/module.ts"],
        includeTests: true,
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: { type: string; data?: { likelyTestCommands?: string[] } };
    };

    expect(result.content[0].text).toContain("Likely Test Commands");
    if (result.details?.type === "impact") {
      expect(result.details.data?.likelyTestCommands).toContain(
        "pnpm vitest run src/module.test.ts --reporter=verbose",
      );
    }
  });

  it("ignores semantic-only non-JavaScript test files in structural change-set mode", async () => {
    writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify(
        {
          name: "impact-ws",
          scripts: { test: "vitest run" },
        },
        null,
        2,
      ),
    );
    mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    mkdirSync(path.join(tmpDir, "tests"), { recursive: true });
    writeFileSync(path.join(tmpDir, "src/widget.ts"), "export const widget = 1;\n");
    writeFileSync(
      path.join(tmpDir, "tests/widget.spec.py"),
      "def test_widget():\n    assert True\n",
    );

    registerMockProvider(tmpDir, {
      documentSymbols: async () => null,
      references: async (file) =>
        file.endsWith("widget.ts")
          ? [
              {
                uri: `file://${path.join(tmpDir, "tests/widget.spec.py")}`,
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 6 },
                },
              },
            ]
          : [],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const impactTool = getTool(pi, "code_impact");

    const result = (await impactTool.execute(
      "impact-non-js-test-command",
      {
        changeSetFiles: ["src/widget.ts"],
        includeTests: true,
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: { type: string; data?: { likelyTests?: string[]; likelyTestCommands?: string[] } };
    };

    expect(result.content[0].text).not.toContain("tests/widget.spec.py");
    expect(result.content[0].text).toContain(
      "No likely tests found by bounded companion/package discovery.",
    );
    expect(result.content[0].text).toContain("**Evidence: structural**");
    expect(result.content[0].text).not.toContain("Likely Test Commands");
    if (result.details?.type === "impact") {
      expect(result.details.data?.likelyTests ?? []).toEqual([]);
      expect(result.details.data?.likelyTestCommands).toEqual([]);
    }
  });

  it("does not fabricate test commands when no tests exist", async () => {
    // Source with no companion or mirror test files
    mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    writeFileSync(path.join(tmpDir, "src/standalone.ts"), "export const value = 42;\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const impactTool = getTool(pi, "code_impact");

    const result = (await impactTool.execute(
      "impact-no-tests",
      {
        changeSetFiles: ["src/standalone.ts"],
        includeTests: true,
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // Should have explicit empty-test note
    expect(result.content[0].text).toContain(
      "No likely tests found by bounded companion/package discovery.",
    );
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

  it("does not match __tests__/helpers support files as tests", () => {
    const affected = pathSet("src/__tests__/helpers/test-harness.ts");
    const tests = findLikelyTests(affected, tmpDir);
    expect(tests.map((t) => t.path)).not.toContain(
      path.resolve(tmpDir, "src/__tests__/helpers/test-harness.ts"),
    );
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
