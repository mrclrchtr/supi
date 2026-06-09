import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import codeIntelligenceExtension from "../../src/code-intelligence.ts";

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
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-inspect-"));
  writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "inspect-ws" }, null, 2));
  mkdirSync(path.join(tmpDir, "src"), { recursive: true });
  writeFileSync(
    path.join(tmpDir, "src", "index.ts"),
    ["export function widget() {", "  const foo = 1;", "  return foo;", "}", ""].join("\n"),
  );

  mockLspFns.getSessionLspService.mockReturnValue({
    kind: "unavailable",
    reason: "no active session",
  });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  getDefaultWorkspaceRuntime().clearAll();
  vi.clearAllMocks();
});

function mockReadyLsp(
  overrides: Partial<{
    fileDiagnostics: ReturnType<typeof vi.fn>;
    recoverDiagnostics: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const service = {
    fileDiagnostics: vi.fn().mockResolvedValue([]),
    recoverDiagnostics: vi.fn().mockResolvedValue({ recovered: false }),
    ...overrides,
  };

  mockLspFns.getSessionLspService.mockReturnValue({
    kind: "ready",
    service,
  });

  return service;
}

function registerInspectProviders() {
  const runtime = getDefaultWorkspaceRuntime();

  runtime.registerSemantic(tmpDir, {
    references: async () => [],
    implementation: async () => [],
    documentSymbols: async () => [],
    workspaceSymbols: async () => [],
    hover: async () => ({ contents: "const foo: number" }),
    definition: async () => [
      {
        uri: `file://${path.join(tmpDir, "src", "helper.ts")}`,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 },
        },
      },
    ],
    codeActionTitles: async () => [{ title: "Remove unused import", kind: "quickfix" }],
  });

  runtime.registerStructural(tmpDir, {
    calleesAt: async (_file, _line, _character) => ({
      kind: "unavailable" as const,
      message: "not needed for inspect tests",
    }),
    nodeAt: async () => ({
      kind: "success" as const,
      data: {
        type: "identifier",
        text: "foo",
        startLine: 2,
        startCharacter: 9,
        endLine: 2,
        endCharacter: 12,
        ancestry: [
          {
            type: "variable_declarator",
            startLine: 2,
            startCharacter: 9,
            endLine: 2,
            endCharacter: 12,
          },
        ],
      },
    }),
    outline: async () => ({
      kind: "success" as const,
      data: [
        {
          name: "widget",
          kind: "function",
          startLine: 1,
          startCharacter: 1,
          endLine: 4,
          endCharacter: 1,
          children: [],
        },
      ],
    }),
    imports: async () => ({ kind: "success" as const, data: [] }),
    exports: async () => ({
      kind: "success" as const,
      data: [
        {
          name: "widget",
          kind: "function",
          startLine: 1,
          startCharacter: 1,
          endLine: 4,
          endCharacter: 1,
        },
      ],
    }),
  });
}

describe("code_inspect tool", () => {
  it("is registered as an active public tool", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_inspect");
    expect(tool).toBeDefined();
    expect(tool.name).toBe("code_inspect");
    expect(typeof tool.execute).toBe("function");
  });

  it("has a position-only schema", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_inspect") as {
      parameters?: { properties?: Record<string, unknown> };
    };

    const props = tool.parameters?.properties;
    expect(props).toBeDefined();
    expect(props).toHaveProperty("file");
    expect(props).toHaveProperty("line");
    expect(props).toHaveProperty("character");
    expect(props).toHaveProperty("maxResults");
    expect(props).not.toHaveProperty("targetId");
    expect(props).not.toHaveProperty("symbol");
    expect(props).not.toHaveProperty("path");
  });

  it("requires file, line, and character", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_inspect");
    const result = (await tool.execute(
      "inspect-missing-anchor",
      { file: "src/index.ts" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("line");
    expect(result.content[0].text).toContain("character");
  });

  it("returns best-effort point inspection sections with nearby diagnostics", async () => {
    registerInspectProviders();
    mockReadyLsp({
      fileDiagnostics: vi.fn().mockResolvedValue([
        {
          severity: 1,
          message: "Cannot assign to 'foo' because it is a constant.",
          range: {
            start: { line: 1, character: 8 },
            end: { line: 1, character: 11 },
          },
        },
      ]),
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_inspect");
    const result = (await tool.execute(
      "inspect-best-effort",
      { file: "src/index.ts", line: 2, character: 10 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: { type: string; data?: { confidence?: string } };
    };

    expect(result.content[0].text).toContain("Inspect");
    expect(result.content[0].text).toContain("Node");
    expect(result.content[0].text).toContain("Hover");
    expect(result.content[0].text).toContain("Definition");
    expect(result.content[0].text).toContain("Diagnostics");
    expect(result.content[0].text).toContain("Code Actions");
    expect(result.content[0].text).toContain("Enclosing symbol");
    expect(result.content[0].text).toContain("Remove unused import");
    expect(result.content[0].text).toContain("Cannot assign to 'foo'");
    expect(result.details?.type).toBe("inspect");
  });

  it("reports explicit unavailable sections instead of heuristic guesses", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_inspect");
    const result = (await tool.execute(
      "inspect-unavailable",
      { file: "src/index.ts", line: 2, character: 10 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("Unavailable");
    expect(result.content[0].text).not.toContain("heuristic");
  });

  it("renders ancestry with positional data instead of collapsing to type names", async () => {
    registerInspectProviders();
    mockReadyLsp();

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_inspect");
    const result = (await tool.execute(
      "inspect-ancestry-positions",
      { file: "src/index.ts", line: 2, character: 10 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    const text = result.content[0].text;
    expect(text).toContain("Ancestry");
    // Should contain the type name
    expect(text).toContain("variable_declarator");
    // Should contain positional data from the structured ancestry entry
    expect(text).toContain("L2:9");
    expect(text).toContain("L2:12");
  });
});
