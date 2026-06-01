import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import codeIntelligenceExtension from "../../src/code-intelligence.ts";
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

  it("filters to requested sections and caps repeated entries deterministically", async () => {
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
    };

    expect(result.content[0].text).toContain("## References");
    expect(result.content[0].text).not.toContain("## Callees");
    expect(result.content[0].text).toContain("consumer-a.ts");
    expect(result.content[0].text).not.toContain("consumer-b.ts");
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
    // No provider registered, so tests section reports "no active provider" honestly
    expect(result.content[0].text).toContain("no active provider");
  });
});

describe("code_context real-data sections", () => {
  it("returns real diagnostics from LSP when available", async () => {
    writeSource("src/context.ts", "export function contextTarget() { return 1; }\n");

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
              name: "returns expected value",
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

    registerMockProvider(tmpDir, { outline: outlineSpy });

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
    expect(result.content[0].text).toContain("returns expected value");
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
});

describe("code_context no-target guidance", () => {
  it("returns explicit resolve-first guidance when task is provided but no target", async () => {
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

    // Should not pretend to render sections
    expect(result.content[0].text).not.toContain("## Definitions");
    expect(result.content[0].text).not.toContain("## References");
    // Should explain what's needed
    expect(result.content[0].text).toContain("No target provided");
    // Should guide to code_resolve
    expect(result.content[0].text).toContain("code_resolve");
    expect(result.content[0].text).toContain("targetId");
    // Should echo the task so the user can verify
    expect(result.content[0].text).toContain("rename something safely");
    // Details should reflect unavailable confidence
    expect(result.details?.type).toBe("context");
    if (result.details?.type === "context") {
      expect(result.details.data?.confidence).toBe("unavailable");
      expect(result.details.data?.nextQueries).toEqual(
        expect.arrayContaining([expect.stringContaining("code_resolve")]),
      );
    }
  });
});
