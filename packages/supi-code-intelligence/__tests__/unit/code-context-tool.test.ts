import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import codeIntelligenceExtension from "../../src/code-intelligence.ts";
import { clearWorkflowTargets, registerWorkflowTarget } from "../../src/workflow/target-store.ts";
import { clearMockRuntime, registerMockProvider } from "../helpers/register-mock-runtime.ts";

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

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-context-"));
  writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "ctx-ws" }, null, 2));
  mockLspFns.getSessionLspService.mockReturnValue({
    kind: "unavailable",
    reason: "no active session",
  });
});

afterEach(() => {
  clearWorkflowTargets(tmpDir);
  clearMockRuntime();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

function writeSource(relPath: string, source: string): void {
  const absPath = path.join(tmpDir, relPath);
  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(absPath, source);
}

async function resolveTargetId(
  pi: ReturnType<typeof createPiMock>,
  file: string,
  line: number,
  character: number,
) {
  const resolveTool = getTool(pi, "code_resolve");
  const resolveResult = (await resolveTool.execute(
    "context-resolve",
    { file, line, character },
    undefined,
    undefined,
    makeCtx({ cwd: tmpDir }),
  )) as {
    details?: {
      type: string;
      data?: { targets?: Array<{ targetId: string }> };
    };
  };

  const targetId = resolveResult.details?.data?.targets?.[0]?.targetId;
  expect(targetId).toBeDefined();
  return targetId as string;
}

function mockLspService(fileDiagnostics: (file: string) => Promise<unknown[]>) {
  mockLspFns.getSessionLspService.mockReturnValue({
    kind: "ready",
    service: {
      fileDiagnostics: vi.fn().mockImplementation(fileDiagnostics),
      recoverDiagnostics: vi.fn().mockResolvedValue({ recovered: false }),
    },
  });
}

describe("code_context tool", () => {
  it("is registered as an active public tool", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_context");
    expect(tool).toBeDefined();
    expect(tool.name).toBe("code_context");
    expect(typeof tool.execute).toBe("function");
  });

  it("falls back to orientation-style output when task is omitted", async () => {
    writeSource("src/context.ts", "export function contextTarget() { return 1; }\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-no-task",
      {},
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).not.toContain("**Error");
    expect(result.content[0].text).toContain("Project Brief");
  });

  it("renders a task-focused bundle for a resolved target", async () => {
    writeSource(
      "src/context.ts",
      [
        "export function contextTarget() { helper(); }",
        "export function helper() { return 1; }",
      ].join("\n"),
    );
    writeSource(
      "src/consumer-a.ts",
      "import { contextTarget } from './context';\ncontextTarget();\n",
    );
    writeSource(
      "src/consumer-b.ts",
      "import { contextTarget } from './context';\ncontextTarget();\n",
    );

    const calleesAtSpy = vi.fn(async (_file: string, _line: number, _character: number) => ({
      kind: "success" as const,
      data: {
        enclosingScope: { name: "contextTarget", startLine: 1, endLine: 1 },
        callees: [{ name: "helper", startLine: 1, endLine: 1 }],
      },
    }));

    registerMockProvider(tmpDir, {
      references: async () => [
        {
          uri: `file://${path.join(tmpDir, "src/consumer-a.ts")}`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 13 },
          },
        },
        {
          uri: `file://${path.join(tmpDir, "src/consumer-b.ts")}`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 13 },
          },
        },
      ],
      calleesAt: calleesAtSpy,
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi, "src/context.ts", 1, 17);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-task-target",
      {
        task: "rename contextTarget safely",
        targetId,
        include: ["defs", "references", "callees"],
        maxResults: 2,
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).not.toContain("**Error");
    expect(result.content[0].text).toContain("rename contextTarget safely");
    expect(result.content[0].text).toContain("## Task Context");
    expect(result.content[0].text).toContain("## Definitions");
    expect(result.content[0].text).toContain("## References");
    expect(result.content[0].text).toContain("## Callees");
    expect(calleesAtSpy).toHaveBeenCalledWith(expect.any(String), 1, 17);
  });

  it("refuses declaration-anchor targetIds for task callees without calling tree-sitter", async () => {
    writeSource("src/context.ts", "export function contextTarget() { helper(); }\n");
    const calleesAtSpy = vi.fn(async () => ({
      kind: "success" as const,
      data: {
        enclosingScope: { name: "contextTarget", startLine: 1, endLine: 1 },
        callees: [{ name: "helper", startLine: 1, endLine: 1 }],
      },
    }));
    registerMockProvider(tmpDir, { calleesAt: calleesAtSpy });
    const { targetId } = registerWorkflowTarget(tmpDir, {
      file: "src/context.ts",
      position: { line: 0, character: 0 },
      displayLine: 1,
      displayCharacter: 1,
      name: "contextTarget",
      kind: "Function",
      confidence: "semantic",
      provenance: "test",
      anchorKind: "declaration",
      container: null,
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-declaration-anchor",
      {
        task: "inspect callees safely",
        targetId,
        include: ["callees"],
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    expect(calleesAtSpy).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("declaration anchor");
    expect(result.content[0].text).toContain("name anchor");
  });

  it("discloses truncated task references in markdown and details", async () => {
    writeSource("src/context.ts", "export function contextTarget() { return 1; }\n");
    writeSource("src/consumer-a.ts", "contextTarget();\n");
    writeSource("src/consumer-b.ts", "contextTarget();\n");

    registerMockProvider(tmpDir, {
      references: async () => [
        {
          uri: `file://${path.join(tmpDir, "src/consumer-a.ts")}`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 13 },
          },
        },
        {
          uri: `file://${path.join(tmpDir, "src/consumer-b.ts")}`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 13 },
          },
        },
      ],
      calleesAt: async () => ({
        kind: "success",
        data: {
          enclosingScope: { name: "contextTarget", startLine: 1, endLine: 1 },
          callees: [{ name: "helper", startLine: 1, endLine: 1 }],
        },
      }),
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi, "src/context.ts", 1, 17);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-filtered",
      {
        task: "check references only",
        targetId,
        include: ["references"],
        budget: "small",
        maxResults: 1,
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: {
        type: "context";
        data: {
          omittedCount: number;
          evidenceLists?: Array<{
            key: string;
            totalCount: number | null;
            shownCount: number;
            omittedCount: number | null;
          }>;
        };
      };
    };

    expect(result.content[0].text).toContain("## References");
    expect(result.content[0].text).not.toContain("## Callees");
    expect(result.content[0].text).toContain("consumer-a.ts");
    expect(result.content[0].text).not.toContain("consumer-b.ts");
    expect(result.content[0].text).toContain("_(showing 1 of 2; 1 omitted)_");
    expect(result.details?.data.omittedCount).toBe(1);
    expect(result.details?.data.evidenceLists).toContainEqual({
      key: "references.locations",
      totalCount: 2,
      shownCount: 1,
      omittedCount: 1,
      partialReason: null,
    });
  });

  it("calls out requested but unavailable docs and tests sections honestly", async () => {
    writeSource("src/context.ts", "export function contextTarget() { return 1; }\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi, "src/context.ts", 1, 17);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-unavailable-sections",
      {
        task: "find surrounding guidance",
        targetId,
        include: ["docs", "tests"],
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("## Docs");
    // No JSDoc on the target symbol, so docs section reports the honest "not found" note
    expect(result.content[0].text).toContain("No JSDoc");
    expect(result.content[0].text).toContain("## Tests");
    // No provider registered and no deterministic test files exist
    expect(result.content[0].text).toContain(
      "Tests unavailable — no semantic or structural provider available.",
    );
  });
});

describe("code_context real-data sections", () => {
  it("returns real diagnostics from LSP when available", async () => {
    writeSource("src/context.ts", "export function contextTarget() { return 1; }\n");
    registerMockProvider(tmpDir, {});
    mockLspService(async (file) => {
      if (file.endsWith("context.ts")) {
        return [
          {
            severity: 1,
            message: "Type 'string' is not assignable to type 'number'.",
            range: {
              start: { line: 0, character: 35 },
              end: { line: 0, character: 38 },
            },
          },
        ];
      }
      return [];
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi, "src/context.ts", 1, 17);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-real-diagnostics",
      {
        task: "find any type errors",
        targetId,
        include: ["diagnostics"],
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("## Diagnostics");
    expect(result.content[0].text).toContain("ERROR");
    expect(result.content[0].text).toContain("Type 'string' is not assignable");
  });

  it("returns explicit unavailable note for diagnostics when LSP is down", async () => {
    writeSource("src/context.ts", "export function contextTarget() { return 1; }\n");

    // Default mockLspFns setup returns unavailable

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi, "src/context.ts", 1, 17);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-no-lsp",
      {
        task: "check diagnostics",
        targetId,
        include: ["diagnostics"],
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("## Diagnostics");
    expect(result.content[0].text).toContain("LSP not available");
    expect(result.content[0].text).toContain("code_health");
  });

  it("returns test functions from companion test files", async () => {
    writeSource("src/context.ts", "export function contextTarget() { return 1; }\n");
    writeSource(
      "src/context.test.ts",
      [
        "import { contextTarget } from './context';",
        "test('returns expected value', () => {",
        "  expect(contextTarget()).toBe(1);",
        "});",
      ].join("\n"),
    );

    // Mock structural provider's outline to return test function names
    const outlineSpy = vi.fn(async (relFile: string) => {
      if (relFile.endsWith("context.test.ts")) {
        return {
          kind: "success" as const,
          data: [
            {
              name: "test",
              kind: "function",
              startLine: 2,
              startCharacter: 1,
              endLine: 4,
              endCharacter: 2,
            },
          ],
        };
      }
      return { kind: "unsupported-language" as const, file: relFile, message: "no outline" };
    });

    registerMockProvider(tmpDir, {
      outline: outlineSpy,
      references: async () => [
        {
          uri: `file://${tmpDir}/src/context.test.ts`,
          range: {
            start: { line: 0, character: 17 },
            end: { line: 0, character: 31 },
          },
        },
      ],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi, "src/context.ts", 1, 17);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-real-tests",
      {
        task: "find related tests",
        targetId,
        include: ["tests"],
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("## Tests");
    expect(result.content[0].text).toContain("context.test.ts");
    expect(result.content[0].text).toContain("test");
  });

  it("discovers package-layout test file without semantic references (regression for audit failure)", async () => {
    // Package layout: source at src/tool/execute-graph.ts
    // Test at __tests__/unit/tool/execute-graph.test.ts
    // No semantic reference from test to source is established.
    writeSource("src/tool/execute-graph.ts", "export function executeGraph() { return 1; }\n");
    writeSource(
      "__tests__/unit/tool/execute-graph.test.ts",
      "import { executeGraph } from '../../../src/tool/execute-graph';\n" +
        // biome-ignore lint/security/noSecrets: test double content
        "describe('executeGraph', () => {\n" +
        "  it('returns 1', () => {\n" +
        "    expect(executeGraph()).toBe(1);\n" +
        "  });\n" +
        "});\n",
    );

    const outlineSpy = vi.fn(async (_relFile: string) => ({
      kind: "success" as const,
      data: [
        {
          name: "describe",
          kind: "function",
          startLine: 1,
          startCharacter: 1,
          endLine: 1,
          endCharacter: 50,
        },
        {
          name: "it",
          kind: "function",
          startLine: 2,
          startCharacter: 1,
          endLine: 4,
          endCharacter: 50,
        },
      ],
    }));

    // Register mock provider with references returning empty
    registerMockProvider(tmpDir, {
      references: async () => [],
      outline: outlineSpy,
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi, "src/tool/execute-graph.ts", 1, 17);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-package-layout-tests",
      {
        task: "find related tests",
        targetId,
        include: ["tests"],
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).not.toContain("No test companion files found");
    expect(result.content[0].text).toContain("__tests__/unit/tool/execute-graph.test.ts");
    expect(result.content[0].text).toContain("describe");
    expect(result.content[0].text).toContain("it");
  });

  it("matches code_graph on non-mirror semantic companion tests for the same target", async () => {
    writeSource("src/tool/execute-find.ts", "export function executeFind() { return 1; }\n");
    writeSource(
      "__tests__/code-find-tool.test.ts",
      "import { executeFind } from '../src/tool/execute-find';\nvoid executeFind;\n",
    );

    registerMockProvider(tmpDir, {
      references: async (file, position) =>
        file.endsWith("execute-find.ts") && position.character > 0
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
    const targetId = await resolveTargetId(pi, "src/tool/execute-find.ts", 1, 17);
    const graphTool = getTool(pi, "code_graph");
    const contextTool = getTool(pi, "code_context");

    const graphResult = (await graphTool.execute(
      "context-tests-graph-parity",
      {
        targetId,
        relations: ["tests"],
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: {
        type: string;
        data?: { tests?: { provenance?: string; files?: Array<{ file: string }> } };
      };
    };

    const contextResult = (await contextTool.execute(
      "context-tests-context-parity",
      {
        task: "find related tests",
        targetId,
        include: ["tests"],
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: {
        type: string;
        data?: {
          tests?: { provenance?: string; status?: string; files?: Array<{ file: string }> };
        };
      };
    };

    expect(graphResult.content[0].text).toContain("__tests__/code-find-tool.test.ts");
    expect(contextResult.content[0].text).toContain("__tests__/code-find-tool.test.ts");
    expect(contextResult.content[0].text).toContain("semantic+conventions");
    expect(graphResult.details?.type).toBe("search");
    expect(contextResult.details?.type).toBe("context");
    if (graphResult.details?.type === "search") {
      expect(graphResult.details.data?.tests?.provenance).toBe("semantic+conventions");
    }
    if (contextResult.details?.type === "context") {
      expect(contextResult.details.data?.tests?.provenance).toBe("semantic+conventions");
      expect(contextResult.details.data?.tests?.status).toBe("found");
      expect(contextResult.details.data?.tests?.files?.[0]?.file).toBe(
        "__tests__/code-find-tool.test.ts",
      );
    }
  });

  it("discovers bounded tool test via conventions-only in code_context", async () => {
    // Source src/tool/execute-find.ts, test __tests__/unit/code-find-tool.test.ts
    writeSource("src/tool/execute-find.ts", "export function executeFind() { return 1; }\n");
    writeSource(
      "__tests__/unit/code-find-tool.test.ts",
      "import { executeFind } from '../../src/tool/execute-find';\n",
    );

    registerMockProvider(tmpDir, {
      references: async () => [],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi, "src/tool/execute-find.ts", 1, 17);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-bounded-tool-test",
      {
        task: "find related tests",
        targetId,
        include: ["tests"],
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // After bounded discovery, this should find __tests__/unit/code-find-tool.test.ts
    // via conventions-only, not say "No test companion files found".
    expect(result.content[0].text).not.toContain("No test companion files found");
    expect(result.content[0].text).toContain("__tests__/unit/code-find-tool.test.ts");
  });

  it("extracts obvious test-call labels when outline data is unavailable", async () => {
    writeSource("src/tool/execute-graph.ts", "export function executeGraph() { return 1; }\n");
    writeSource(
      "__tests__/unit/tool/execute-graph.test.ts",
      [
        "import { executeGraph } from '../../../src/tool/execute-graph';",
        // biome-ignore lint/security/noSecrets: test fixture label is intentional
        "describe('executeGraph', () => {",
        "  it('returns 1', () => {",
        "    expect(executeGraph()).toBe(1);",
        "  });",
        "});",
      ].join("\n"),
    );

    registerMockProvider(tmpDir, {
      references: async () => [],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi, "src/tool/execute-graph.ts", 1, 17);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-package-layout-fallback-test-labels",
      {
        task: "find related tests",
        targetId,
        include: ["tests"],
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // biome-ignore lint/security/noSecrets: assertion label is intentional
    const describeLabel = ["describe", "('executeGraph')"].join("");
    const itLabel = ["it", "('returns 1')"].join("");

    expect(result.content[0].text).toContain(describeLabel);
    expect(result.content[0].text).toContain(itLabel);
    expect(result.content[0].text).not.toContain("_(no recognized test blocks)_");
    expect(result.content[0].text.indexOf(itLabel)).toBeLessThan(
      result.content[0].text.indexOf(describeLabel),
    );
  });

  it("renders no recognized test blocks instead of helper fallback names", async () => {
    writeSource("src/tool/execute-graph.ts", "export function executeGraph() { return 1; }\n");
    writeSource(
      "__tests__/unit/tool/execute-graph.test.ts",
      "import { executeGraph } from '../../../src/tool/execute-graph';\n",
    );

    const outlineSpy = vi.fn(async () => ({
      kind: "success" as const,
      data: [
        {
          name: "tmpDir",
          kind: "const",
          startLine: 1,
          startCharacter: 1,
          endLine: 1,
          endCharacter: 10,
        },
        {
          name: "writeSource",
          kind: "function",
          startLine: 2,
          startCharacter: 1,
          endLine: 2,
          endCharacter: 12,
        },
        {
          name: "result",
          kind: "const",
          startLine: 3,
          startCharacter: 1,
          endLine: 3,
          endCharacter: 7,
        },
      ],
    }));

    registerMockProvider(tmpDir, {
      references: async () => [],
      outline: outlineSpy,
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi, "src/tool/execute-graph.ts", 1, 17);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-package-layout-noisy-tests",
      {
        task: "find related tests",
        targetId,
        include: ["tests"],
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("__tests__/unit/tool/execute-graph.test.ts");
    expect(result.content[0].text).toContain("_(no recognized test blocks)_");
    expect(result.content[0].text).toContain("conventions-only");
    expect(result.content[0].text).not.toContain("no LSP/TS");
    expect(result.content[0].text).not.toContain("tmpDir");
    expect(result.content[0].text).not.toContain("writeSource");
    expect(result.content[0].text).not.toContain("`result`");
  });

  it("reports structural confidence when tests are discovered without outline data", async () => {
    writeSource("src/source.ts", "export function source() { return 1; }\n");
    writeSource("src/source.test.ts", "import { source } from './source';\nvoid source;\n");

    registerMockProvider(tmpDir, {
      references: async () => [],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi, "src/source.ts", 1, 17);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-tests-structural-confidence",
      {
        task: "find related tests",
        targetId,
        include: ["tests"],
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: { type: string; data?: { confidence?: string } };
    };

    expect(result.content[0].text).toContain("source.test.ts");
    expect(result.details?.type).toBe("context");
    if (result.details?.type === "context") {
      expect(result.details.data?.confidence).toBe("structural");
    }
  });

  it("returns JSDoc comment for target symbol when docs section is requested", async () => {
    writeSource(
      "src/context.ts",
      [
        "/**",
        " * Adds two numbers and returns the sum.",
        " *",
        " * @param a - The first number",
        " * @param b - The second number",
        " * @returns The sum of a and b",
        " */",
        "export function add(a: number, b: number) { return a + b; }",
      ].join("\n"),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    // Target the 'add' function symbol (line 8, character 17 = the function name)
    const targetId = await resolveTargetId(pi, "src/context.ts", 8, 17);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-real-docs",
      {
        task: "find docs for the function",
        targetId,
        include: ["docs"],
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("## Docs");
    expect(result.content[0].text).toContain("Adds two numbers");
    expect(result.content[0].text).toContain("@param");
  });

  it("returns unavailable note for docs when no JSDoc comment exists", async () => {
    writeSource("src/context.ts", "export function add(a: number, b: number) { return a + b; }\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi, "src/context.ts", 1, 17);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-no-jsdoc",
      {
        task: "find docs",
        targetId,
        include: ["docs"],
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("## Docs");
    expect(result.content[0].text).toContain("No JSDoc");
  });

  it("extracts single-line JSDoc comment for target symbol", async () => {
    writeSource(
      "src/context.ts",
      [
        "/** Returns the sum of a and b. */",
        "export function add(a: number, b: number) { return a + b; }",
      ].join("\n"),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi, "src/context.ts", 2, 17);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-single-line-jsdoc",
      {
        task: "find docs",
        targetId,
        include: ["docs"],
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("## Docs");
    expect(result.content[0].text).toContain("Returns the sum of a and b");
  });

  it("truncates large hover content in definitions section", async () => {
    writeSource("src/context.ts", "export function contextTarget() { return 1; }\n");

    // Hover content > 600 chars to trigger truncation
    const largeHover =
      "const CODE_INTELLIGENCE_TOOL_SPECS: readonly [{" +
      'readonly name: "code_resolve"; '.repeat(20) +
      'readonly label: "Code Resolve"; '.repeat(10) +
      'readonly description: "Resolve human or code references..."; '.repeat(5) +
      "}, ... 8 more]";

    registerMockProvider(tmpDir, {
      hover: async () => ({ contents: largeHover }),
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi, "src/context.ts", 1, 17);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-hover-truncation",
      {
        task: "check hover display",
        targetId,
        include: ["defs"],
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    const text = result.content[0].text;
    expect(text).toContain("## Definitions");
    expect(text).toContain("Hover:");
    expect(text).toContain("truncated, use `code_inspect` for full type");
    // Should NOT contain the full hover content
    expect(text).not.toContain(largeHover);
  });

  it("shows full hover content when under 600 chars", async () => {
    writeSource("src/context.ts", "export function contextTarget() { return 1; }\n");

    const shortHover = "function contextTarget(): number";

    registerMockProvider(tmpDir, {
      hover: async () => ({ contents: shortHover }),
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi, "src/context.ts", 1, 17);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-hover-full",
      {
        task: "check hover display",
        targetId,
        include: ["defs"],
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    const text = result.content[0].text;
    expect(text).toContain("## Definitions");
    expect(text).toContain(shortHover);
    expect(text).not.toContain("truncated");
  });
});

describe("code_context no-target fallback", () => {
  it("falls back to orientation overview when task is provided but no target", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-no-target",
      {
        task: "rename something safely",
        // no targetId, no file, no symbol
      },
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

    // Should show fallback note
    expect(result.content[0].text).toContain("Falling back to orientation");
    // Details should reflect brief confidence (not task-mode unavailable)
    expect(result.details?.type).toBe("context");
  });
});

describe("code_context git context once-per-session", () => {
  function setupGit(): void {
    const { execFileSync } = require("node:child_process");
    const scrub = (env: NodeJS.ProcessEnv) => {
      const next = { ...env };
      for (const key of Object.keys(next)) {
        if (key.startsWith("GIT_")) delete next[key];
      }
      return next;
    };
    execFileSync("git", ["init"], { cwd: tmpDir, env: scrub(process.env) });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: tmpDir,
      env: scrub(process.env),
    });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: tmpDir, env: scrub(process.env) });
    execFileSync("git", ["config", "commit.gpgsign", "false"], {
      cwd: tmpDir,
      env: scrub(process.env),
    });
    execFileSync("git", ["config", "core.hooksPath", "/dev/null"], {
      cwd: tmpDir,
      env: scrub(process.env),
    });
    execFileSync("git", ["add", "."], { cwd: tmpDir, env: scrub(process.env) });
    execFileSync("git", ["commit", "-m", "init"], { cwd: tmpDir, env: scrub(process.env) });
  }

  it("shows git context on first orientation call and hides on second", async () => {
    setupGit();
    writeSource("src/file.ts", "export const x = 1;");

    registerMockProvider(tmpDir, {});

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_context");

    // First call — should show git context
    const result1 = (await tool.execute(
      "git-ctx-1",
      {},
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    expect(result1.content[0].text).toContain("## Git Context");
    expect(result1.content[0].text).toContain("Branch:");

    // Second call — should NOT show git context
    const result2 = (await tool.execute(
      "git-ctx-2",
      {},
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    expect(result2.content[0].text).not.toContain("## Git Context");
  });

  it("does not consume git context flag for task-mode calls with a target", async () => {
    setupGit();
    writeSource("src/file.ts", "export function doSomething() { return 1; }");

    registerMockProvider(tmpDir, {
      references: async () => [],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    // Resolve a target first
    const resolveTool = getTool(pi, "code_resolve");
    const resolveResult = (await resolveTool.execute(
      "resolve-for-task",
      { file: "src/file.ts", line: 1, character: 20 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      details?: { type: string; data?: { targets?: Array<{ targetId: string }> } };
    };
    const targetId = resolveResult.details?.data?.targets?.[0]?.targetId;

    // Task-mode call with a target — should NOT consume the flag
    const tool = getTool(pi, "code_context");
    await tool.execute(
      "git-ctx-task",
      { task: "do something", targetId, include: ["defs"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    );

    // Orientation call — should still show git context
    const result = (await tool.execute(
      "git-ctx-after-task",
      {},
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain("## Git Context");
  });
});
