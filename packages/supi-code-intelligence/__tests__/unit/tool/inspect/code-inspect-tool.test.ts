import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  completedCodeQuery,
  getDefaultWorkspaceRuntime,
  type SemanticProvider,
  type StructuralProvider,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import codeIntelligenceExtension from "../../../../src/extension.ts";

const mockLspFns = vi.hoisted(() => ({
  getWorkspaceLspRuntime: vi.fn<(cwd: string) => unknown>(),
}));

vi.mock("@mrclrchtr/supi-lsp/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-lsp/api")>();
  return { ...actual, getWorkspaceLspRuntime: mockLspFns.getWorkspaceLspRuntime };
});

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-inspect-"));
  writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "inspect-ws" }));
  mkdirSync(path.join(tmpDir, "src"), { recursive: true });
  writeFileSync(
    path.join(tmpDir, "src", "index.ts"),
    [
      "export class Widget {",
      "  method() {",
      "    const foo = 1;",
      "    return foo;",
      "  }",
      "}",
      "",
    ].join("\n"),
  );
  mockReadyLsp();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  getDefaultWorkspaceRuntime().clearAll();
  vi.clearAllMocks();
});

function mockReadyLsp(
  options: {
    waitUntilReadyForFile?: ReturnType<typeof vi.fn>;
    fileDiagnostics?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const runtime = {
    waitUntilReadyForFile:
      options.waitUntilReadyForFile ?? vi.fn().mockResolvedValue({ kind: "ready" }),
    fileDiagnostics: options.fileDiagnostics ?? vi.fn().mockResolvedValue(completedCodeQuery([])),
  };
  mockLspFns.getWorkspaceLspRuntime.mockReturnValue({ kind: "ready", runtime });
  return runtime;
}

function registerSemantic(overrides: Partial<SemanticProvider> = {}): void {
  getDefaultWorkspaceRuntime().registerSemantic(tmpDir, {
    references: async () => completedCodeQuery([]),
    implementation: async () => completedCodeQuery([]),
    documentSymbols: async () => completedCodeQuery([]),
    workspaceSymbols: async () => completedCodeQuery([]),
    hover: async () => completedCodeQuery({ contents: "const foo: number" }),
    definition: async () =>
      completedCodeQuery([
        {
          uri: `file://${path.join(tmpDir, "src", "helper.ts")}`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 },
          },
        },
      ]),
    ...overrides,
  });
}

function registerStructural(overrides: Partial<StructuralProvider> = {}): void {
  const unsupported = async () => unavailableCodeQuery("not configured") as never;
  getDefaultWorkspaceRuntime().registerStructural(tmpDir, {
    calleesAt: unsupported,
    nodeAt: async () => ({
      kind: "success",
      data: {
        type: "identifier",
        text: "foo",
        startLine: 3,
        startCharacter: 11,
        endLine: 3,
        endCharacter: 14,
        ancestry: [
          {
            type: "variable_declarator",
            startLine: 3,
            startCharacter: 5,
            endLine: 3,
            endCharacter: 18,
          },
        ],
      },
    }),
    outline: async () => ({
      kind: "success",
      data: [
        {
          name: "Widget",
          kind: "class",
          startLine: 1,
          startCharacter: 1,
          endLine: 6,
          endCharacter: 2,
          children: [
            {
              name: "method",
              kind: "method",
              startLine: 2,
              startCharacter: 3,
              endLine: 5,
              endCharacter: 4,
            },
          ],
        },
      ],
    }),
    imports: async () => ({ kind: "success", data: [] }),
    exports: async () => ({ kind: "success", data: [] }),
    callSites: async () => ({ kind: "success", data: [] }),
    ...overrides,
  });
}

async function executeInspect(point = { file: "src/index.ts", line: 3, character: 12 }) {
  const pi = createPiMock();
  codeIntelligenceExtension(pi as never);
  return getTool(pi, "code_inspect").execute(
    "inspect",
    { point },
    undefined,
    undefined,
    makeCtx({ cwd: tmpDir }),
  );
}

describe("code_inspect tool", () => {
  it("is registered with a nested point-only schema", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_inspect") as {
      parameters?: { properties?: Record<string, unknown> };
    };
    expect(tool.parameters?.properties).toHaveProperty("point");
    expect(tool.parameters?.properties).toHaveProperty("maxResults");
    expect(tool.parameters?.properties).not.toHaveProperty("file");
  });

  it("reports point facts and the narrowest recursive outline declaration", async () => {
    registerSemantic();
    registerStructural();
    mockReadyLsp({
      fileDiagnostics: vi.fn().mockResolvedValue(
        completedCodeQuery([
          {
            severity: 1,
            message: "Local failure",
            range: {
              start: { line: 2, character: 10 },
              end: { line: 2, character: 13 },
            },
          },
        ]),
      ),
    });

    const result = (await executeInspect()) as {
      content: Array<{ text: string }>;
      details?: { data: { sections: Array<{ key: string; status: string }> } };
    };
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("## Syntax node");
    expect(text).toContain("`method` (method) L2:3–L5:4");
    expect(text).toContain("const foo: number");
    expect(text).toContain("Local failure");
    expect(result.details?.data.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "node", status: "complete" }),
        expect.objectContaining({ key: "enclosingSymbol", status: "complete" }),
      ]),
    );
  });

  it("uses UTF-16 columns to distinguish declarations on the same line", async () => {
    writeFileSync(path.join(tmpDir, "src", "index.ts"), "const first = 1; const second = 2;\n");
    registerStructural({
      outline: async () => ({
        kind: "success",
        data: [
          {
            name: "first",
            kind: "variable",
            startLine: 1,
            startCharacter: 1,
            endLine: 1,
            endCharacter: 35,
          },
          {
            name: "second",
            kind: "variable",
            startLine: 1,
            startCharacter: 18,
            endLine: 1,
            endCharacter: 35,
          },
        ],
      }),
    });

    const result = (await executeInspect({ file: "src/index.ts", line: 1, character: 25 })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0]?.text).toContain("`second` (variable) L1:18–L1:35");
    expect(result.content[0]?.text).not.toContain("`first` (variable)");
  });

  it("never substitutes a diagnostic outside the nearby window", async () => {
    registerSemantic();
    registerStructural();
    mockReadyLsp({
      fileDiagnostics: vi.fn().mockResolvedValue(
        completedCodeQuery([
          {
            severity: 1,
            message: "Far-away failure",
            range: {
              start: { line: 20, character: 0 },
              end: { line: 20, character: 1 },
            },
          },
        ]),
      ),
    });

    const result = (await executeInspect()) as { content: Array<{ text: string }> };
    const text = result.content[0]?.text ?? "";
    expect(text).not.toContain("Far-away failure");
    expect(text).toContain("No diagnostics intersect the nearby window");
  });

  it("distinguishes completed-empty sections from provider failures", async () => {
    registerSemantic({
      hover: async () => {
        throw new Error("hover transport failed");
      },
      definition: async () => completedCodeQuery([]),
    });
    registerStructural();
    mockReadyLsp({
      fileDiagnostics: vi.fn().mockResolvedValue(unavailableCodeQuery("diagnostic sync failed")),
    });

    const result = (await executeInspect()) as {
      content: Array<{ text: string }>;
      details?: {
        data: { sections: Array<{ key: string; status: string; reason: string | null }> };
      };
    };
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Hover lookup failed: hover transport failed");
    expect(text).toContain("No definition result at this point");
    expect(text).toContain("diagnostic sync failed");
    expect(result.details?.data.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "hover", status: "unavailable" }),
        expect.objectContaining({ key: "definition", status: "complete", reason: null }),
        expect.objectContaining({ key: "diagnostics", status: "unavailable" }),
      ]),
    );
  });

  it("keeps structural inspection when semantic readiness times out", async () => {
    registerSemantic();
    registerStructural();
    mockReadyLsp({
      waitUntilReadyForFile: vi.fn().mockResolvedValue({ kind: "timeout" }),
    });

    const result = (await executeInspect()) as {
      content: Array<{ type: string; text: string }>;
      details?: {
        data: {
          confidence: string;
          sections: Array<{ key: string; status: string; reason: string | null }>;
        };
      };
    };
    const reason = "Semantic provider did not become ready within the wait window; retry shortly.";
    const text = result.content[0]?.text ?? "";

    expect(text).toContain(reason);
    expect(result.details?.data.confidence).toBe("structural");
    expect(result.details?.data.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "node", status: "complete" }),
        expect.objectContaining({ key: "enclosingSymbol", status: "complete" }),
        expect.objectContaining({ key: "hover", status: "unavailable", reason }),
        expect.objectContaining({ key: "definition", status: "unavailable", reason }),
        expect.objectContaining({ key: "diagnostics", status: "unavailable", reason }),
      ]),
    );
  });

  it("succeeds when completed-empty semantic sections are the only observations", async () => {
    registerSemantic({
      hover: async () => completedCodeQuery(null),
      definition: async () => completedCodeQuery([]),
    });

    const result = (await executeInspect()) as { content: Array<{ text: string }> };
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("No hover result at this point");
    expect(text).toContain("No definition result at this point");
    expect(text).toContain("No diagnostics intersect the nearby window");
  });

  it("throws only when every inspection section is unavailable", async () => {
    await expect(executeInspect()).rejects.toThrow(
      "No semantic, structural, or diagnostic provider",
    );
  });

  it("rejects directories and out-of-bounds points before semantic readiness", async () => {
    registerSemantic();
    const waitUntilReadyForFile = vi.fn().mockResolvedValue({ kind: "ready" });
    mockReadyLsp({ waitUntilReadyForFile });

    const directory = (await executeInspect({ file: "src", line: 1, character: 1 })) as {
      content: Array<{ text: string }>;
    };
    const outside = (await executeInspect({ file: "src/index.ts", line: 99, character: 1 })) as {
      content: Array<{ text: string }>;
    };
    const pastLine = (await executeInspect({
      file: "src/index.ts",
      line: 1,
      character: 999,
    })) as { content: Array<{ text: string }> };

    expect(directory.content[0]?.text).toContain("Not a regular file");
    expect(outside.content[0]?.text).toContain("beyond the end");
    expect(pastLine.content[0]?.text).toContain("beyond line 1");
    expect(waitUntilReadyForFile).not.toHaveBeenCalled();
  });

  it("renders ancestry with full UTF-16 positional ranges", async () => {
    registerSemantic();
    registerStructural();
    const result = (await executeInspect()) as { content: Array<{ text: string }> };
    expect(result.content[0]?.text).toContain("variable_declarator L3:5–L3:18");
  });
});
