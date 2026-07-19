import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  getDefaultWorkspaceRuntime,
  type SemanticProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import codeIntelligenceExtension from "../../../../src/extension.ts";

const mockLspFns = vi.hoisted(() => ({
  getWorkspaceLspRuntime: vi.fn<(cwd: string) => unknown>(),
}));

vi.mock("@mrclrchtr/supi-lsp/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-lsp/api")>();
  return {
    ...actual,
    getWorkspaceLspRuntime: mockLspFns.getWorkspaceLspRuntime,
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

  mockLspFns.getWorkspaceLspRuntime.mockReturnValue({
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
    waitUntilReadyForFile: ReturnType<typeof vi.fn>;
    fileDiagnostics: ReturnType<typeof vi.fn>;
    recoverDiagnostics: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const runtime = {
    waitUntilReadyForFile: vi.fn().mockResolvedValue({ kind: "ready" }),
    fileDiagnostics: vi.fn().mockResolvedValue([]),
    recoverDiagnostics: vi.fn().mockResolvedValue({ recovered: false }),
    ...overrides,
  };

  mockLspFns.getWorkspaceLspRuntime.mockReturnValue({
    kind: "ready",
    runtime,
  });

  return runtime;
}

function registerInspectProviders(
  semanticOverrides: Partial<
    Pick<SemanticProvider, "hover" | "definition" | "codeActionTitles">
  > = {},
) {
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
    ...semanticOverrides,
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
    callSites: async (_f) => ({ kind: "success" as const, data: [] }),
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
    expect(props).toHaveProperty("point");
    expect(props).toHaveProperty("maxResults");
    expect(props).not.toHaveProperty("file");
    expect(props).not.toHaveProperty("line");
    expect(props).not.toHaveProperty("character");
    expect(props).not.toHaveProperty("targetId");
    expect(props).not.toHaveProperty("symbol");
    expect(props).not.toHaveProperty("path");
  });

  it("suppresses semantic sections when file readiness fails but keeps structural facts", async () => {
    const hover = vi.fn(async () => ({ contents: "const foo: number" }));
    const definition = vi.fn(async () => []);
    const codeActionTitles = vi.fn(async () => []);
    registerInspectProviders({ hover, definition, codeActionTitles });
    const fileDiagnostics = vi.fn(async () => null);
    mockReadyLsp({
      waitUntilReadyForFile: vi
        .fn()
        .mockResolvedValue({ kind: "unavailable", reason: "file client lost" }),
      fileDiagnostics,
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const result = (await getTool(pi, "code_inspect").execute(
      "inspect-degraded",
      { point: { file: "src/index.ts", line: 2, character: 9 } },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ text: string }>;
      details?: { type: "inspect"; data: { confidence: string; unavailableSections: string[] } };
    };

    expect(hover).not.toHaveBeenCalled();
    expect(definition).not.toHaveBeenCalled();
    expect(codeActionTitles).not.toHaveBeenCalled();
    expect(fileDiagnostics).not.toHaveBeenCalled();
    expect(result.details?.data.confidence).toBe("structural");
    expect(result.details?.data.unavailableSections).toEqual(
      expect.arrayContaining(["hover", "definition", "diagnostics", "codeActions"]),
    );
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
      { point: { file: "src/index.ts", line: 2, character: 10 } },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: { type: string; data?: { confidence?: string; nextQueries?: string[] } };
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
    if (result.details?.type === "inspect") {
      expect(result.details.data?.nextQueries).toEqual(
        expect.arrayContaining([
          expect.stringContaining('code_orientation with focus.path "src/index.ts"'),
        ]),
      );
      expect(result.details.data?.nextQueries).not.toEqual(
        expect.arrayContaining([expect.stringContaining("`code_orientation` with `file:")]),
      );
    }
  });

  it("discloses truncated code action facts in markdown and details", async () => {
    registerInspectProviders();
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic(tmpDir, {
      references: async () => [],
      implementation: async () => [],
      documentSymbols: async () => [],
      workspaceSymbols: async () => [],
      codeActionTitles: async () => [
        { title: "Action one", kind: "quickfix" },
        { title: "Action two", kind: "quickfix" },
      ],
    });
    mockReadyLsp();

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_inspect");
    const result = (await tool.execute(
      "inspect-code-actions-truncated",
      { point: { file: "src/index.ts", line: 2, character: 10 }, maxResults: 1 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: {
        type: "inspect";
        data?: {
          evidenceLists?: Array<{
            key: string;
            totalCount: number | null;
            shownCount: number;
            omittedCount: number | null;
          }>;
        };
      };
    };

    expect(result.content[0].text).toContain("Action one");
    expect(result.content[0].text).not.toContain("Action two");
    expect(result.content[0].text).toContain("_(showing 1 of 2; 1 omitted)_");
    expect(result.details?.data?.evidenceLists).toContainEqual({
      key: "inspect.codeActions",
      totalCount: 2,
      shownCount: 1,
      omittedCount: 1,
      partialReason: null,
    });
  });

  it("throws when every inspection substrate is unavailable", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_inspect");
    await expect(
      tool.execute(
        "inspect-unavailable",
        { point: { file: "src/index.ts", line: 2, character: 10 } },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      ),
    ).rejects.toThrow("No semantic, structural, or diagnostic provider");
  });

  it("renders ancestry with positional data instead of collapsing to type names", async () => {
    registerInspectProviders();
    mockReadyLsp();

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_inspect");
    const result = (await tool.execute(
      "inspect-ancestry-positions",
      { point: { file: "src/index.ts", line: 2, character: 10 } },
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
