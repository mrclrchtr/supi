import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import codeIntelligenceExtension from "../../../../src/extension.ts";
import { clearMockRuntime, registerMockProvider } from "../../../helpers/register-mock-runtime.ts";

const mockLspFns = vi.hoisted(() => ({
  getSessionLspService: vi.fn<(cwd: string) => unknown>(),
}));

vi.mock("@mrclrchtr/supi-lsp/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-lsp/api")>();
  return { ...actual, getSessionLspService: mockLspFns.getSessionLspService };
});

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-orientation-"));
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
    "orientation-resolve",
    { file, line, character },
    undefined,
    undefined,
    makeCtx({ cwd: tmpDir }),
  )) as { details?: { data?: { targets?: Array<{ targetId: string }> } } };

  const targetId = resolveResult.details?.data?.targets?.[0]?.targetId;
  expect(targetId).toBeDefined();
  return targetId as string;
}

function registerBasicSymbolProvider(): void {
  registerMockProvider(tmpDir, {
    documentSymbols: async () => [
      {
        name: "widget",
        kind: "Function",
        file: path.join(tmpDir, "src/widget.ts"),
        declarationAnchor: { line: 8, character: 1 },
        nameAnchor: { line: 8, character: 17 },
        container: null,
      },
    ],
    hover: async () => ({ contents: "function widget(): number" }),
  });
}

describe("code_orientation tool", () => {
  it("is registered as an active public tool", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_orientation");
    expect(tool).toBeDefined();
    expect(tool.name).toBe("code_orientation");
  });

  it("returns project orientation when focus is omitted", async () => {
    writeSource("src/index.ts", "export const x = 1;\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_orientation");

    const result = (await tool.execute(
      "project-orientation",
      {},
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ text: string }> };

    expect(result.content[0].text).not.toContain("**Error");
    expect(result.content[0].text).toContain("Project Brief");
  });

  it("orients around a discovered module name", async () => {
    writeFileSync(path.join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");
    const pkgDir = path.join(tmpDir, "packages", "app");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: "@t/app", description: "Main app" }, null, 2),
    );
    writeFileSync(path.join(pkgDir, "index.ts"), "export const app = 1;\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_orientation");

    const result = (await tool.execute(
      "module-orientation",
      { focus: "app" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ text: string }> };

    expect(result.content[0].text).toContain("# Module: app");
    expect(result.content[0].text).toContain("Main app");
  });

  it("reports ambiguous discovered module-name focus honestly", async () => {
    writeFileSync(path.join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");
    const appDir = path.join(tmpDir, "packages", "app");
    const otherDir = path.join(tmpDir, "packages", "other");
    mkdirSync(appDir, { recursive: true });
    mkdirSync(otherDir, { recursive: true });
    writeFileSync(path.join(appDir, "package.json"), JSON.stringify({ name: "@t/app" }));
    writeFileSync(path.join(otherDir, "package.json"), JSON.stringify({ name: "@scope/app" }));

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_orientation");

    const result = (await tool.execute(
      "ambiguous-module-focus",
      { focus: "app" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ text: string }> };

    expect(result.content[0].text).toContain("Focus is ambiguous");
    expect(result.content[0].text).toContain("@t/app");
    expect(result.content[0].text).toContain("@scope/app");
  });

  it("returns symbol orientation with definitions, docs, diagnostics, and target metadata", async () => {
    writeSource(
      "src/widget.ts",
      [
        "/**",
        " * Returns the widget value.",
        " */",
        "",
        "",
        "",
        "",
        "export function widget() { return 1; }",
      ].join("\n"),
    );
    registerBasicSymbolProvider();
    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: {
        fileDiagnostics: vi.fn(async () => [
          {
            severity: 1,
            message: "Widget diagnostic",
            range: { start: { line: 7, character: 10 }, end: { line: 7, character: 16 } },
          },
        ]),
        codeActions: vi.fn(async () => []),
        recoverDiagnostics: vi.fn(async () => ({ recovered: false })),
      },
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_orientation");

    const result = (await tool.execute(
      "symbol-orientation",
      { focus: "src/widget.ts", line: 8, character: 17 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ text: string }>;
      details?: { type: "context"; data: { target?: { targetId: string; name: string | null } } };
    };

    expect(result.content[0].text).toContain("# Code Orientation");
    expect(result.content[0].text).toContain("## Definitions");
    expect(result.content[0].text).toContain("function widget(): number");
    expect(result.content[0].text).toContain("## Docs");
    expect(result.content[0].text).toContain("Returns the widget value");
    expect(result.content[0].text).toContain("## Diagnostics");
    expect(result.content[0].text).toContain("Widget diagnostic");
    expect(result.content[0].text).toContain("## Read Next");
    expect(result.details?.data.target?.targetId).toMatch(/^tg-/);
    expect(result.details?.data.target?.name).toBe("widget");
  });

  it("does not show unrelated whole-file diagnostics for symbol orientation", async () => {
    writeSource("src/widget.ts", "export function widget() { return 1; }\nconst far = 1;\n");
    registerMockProvider(tmpDir, {
      documentSymbols: async () => [
        {
          name: "widget",
          kind: "Function",
          file: path.join(tmpDir, "src/widget.ts"),
          declarationAnchor: { line: 1, character: 1 },
          nameAnchor: { line: 1, character: 17 },
          container: null,
        },
      ],
    });
    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: {
        fileDiagnostics: vi.fn(async () => [
          {
            severity: 1,
            message: "Far diagnostic",
            range: { start: { line: 20, character: 1 }, end: { line: 20, character: 2 } },
          },
        ]),
        codeActions: vi.fn(async () => []),
        recoverDiagnostics: vi.fn(async () => ({ recovered: false })),
      },
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_orientation");

    const result = (await tool.execute(
      "near-diagnostics",
      { focus: "src/widget.ts", line: 1, character: 17 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ text: string }> };

    expect(result.content[0].text).toContain("No diagnostics found near this target");
    expect(result.content[0].text).not.toContain("Far diagnostic");
  });

  it("lets targetId win over supplied focus and coordinates", async () => {
    writeSource("src/widget.ts", "export function widget() { return 1; }\n");
    registerMockProvider(tmpDir, {
      documentSymbols: async () => [
        {
          name: "widget",
          kind: "Function",
          file: path.join(tmpDir, "src/widget.ts"),
          declarationAnchor: { line: 1, character: 1 },
          nameAnchor: { line: 1, character: 17 },
          container: null,
        },
      ],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi, "src/widget.ts", 1, 17);
    const tool = getTool(pi, "code_orientation");

    const result = (await tool.execute(
      "targetid-wins",
      { targetId, focus: "missing.ts", line: 99, character: 1 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ text: string }> };

    expect(result.content[0].text).not.toContain("**Error");
    expect(result.content[0].text).toContain("targetId");
    expect(result.content[0].text).toContain("ignored");
    expect(result.content[0].text).toContain("widget");
  });

  it("hard-errors on invalid focus in orientation mode", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_orientation");

    const result = (await tool.execute(
      "invalid-focus",
      { focus: "does-not-exist" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ text: string }> };

    expect(result.content[0].text).toContain("Focus not found");
  });

  it("returns a validation error when coordinates are supplied for a directory focus", async () => {
    mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_orientation");

    const result = (await tool.execute(
      "directory-coords",
      { focus: "src", line: 1, character: 1 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ text: string }> };

    expect(result.content[0].text).toContain("points to a directory");
    expect(result.content[0].text).toContain("points to a directory");
    expect(result.content[0].text).toContain("use `file`");
  });

  it("returns a validation error for partial coordinates", async () => {
    writeSource("src/widget.ts", "export function widget() { return 1; }\n");
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_orientation");

    const result = (await tool.execute(
      "partial-coords",
      { focus: "src/widget.ts", line: 1 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ text: string }> };

    expect(result.content[0].text).toContain("focus");
    expect(result.content[0].text).toContain("line");
    expect(result.content[0].text).toContain("character");
  });
});
