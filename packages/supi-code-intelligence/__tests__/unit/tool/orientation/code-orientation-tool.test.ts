import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type CodeQueryResult,
  completedCodeQuery,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import codeIntelligenceExtension from "../../../../src/extension.ts";
import { clearMockRuntime, registerMockProvider } from "../../../helpers/register-mock-runtime.ts";

const mockLspFns = vi.hoisted(() => ({
  getWorkspaceLspRuntime: vi.fn<(cwd: string) => unknown>(),
}));

vi.mock("@mrclrchtr/supi-lsp/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-lsp/api")>();
  return { ...actual, getWorkspaceLspRuntime: mockLspFns.getWorkspaceLspRuntime };
});

let tmpDir: string;
let homeDir: string;

function emptyEvidence() {
  return {
    requested: 0,
    confirmed: 0,
    unconfirmed: 0,
    failed: 0,
    removed: 0,
    documents: [],
  } as const;
}

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-orientation-"));
  homeDir = mkdtempSync(path.join(os.tmpdir(), "code-orientation-home-"));
  writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "ctx-ws" }, null, 2));
  mockLspFns.getWorkspaceLspRuntime.mockReturnValue({
    kind: "unavailable",
    reason: "no active session",
  });
});

afterEach(() => {
  clearMockRuntime();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(homeDir, { recursive: true, force: true });
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
    { target: { anchor: { file, line, character } } },
    undefined,
    undefined,
    makeCtx({ cwd: tmpDir }),
  )) as { details?: { data?: { targets?: Array<{ targetId: string }> } } };

  const targetId = resolveResult.details?.data?.targets?.[0]?.targetId;
  expect(targetId).toBeDefined();
  return targetId as string;
}

function markLspReady(runtimeOverrides: Record<string, unknown> = {}): void {
  const { fileDiagnostics: rawFileDiagnostics, ...rest } = runtimeOverrides;
  const query = rawFileDiagnostics as ((...args: unknown[]) => Promise<unknown>) | undefined;
  const fileDiagnostics = async (...args: unknown[]): Promise<CodeQueryResult<unknown[]>> => {
    const value = query ? await query(...args) : [];
    if (typeof value === "object" && value !== null && "kind" in value) {
      return value as CodeQueryResult<unknown[]>;
    }
    return value === null
      ? unavailableCodeQuery("diagnostics unavailable")
      : completedCodeQuery(value as unknown[]);
  };
  mockLspFns.getWorkspaceLspRuntime.mockReturnValue({
    kind: "ready",
    runtime: {
      waitUntilReadyForFile: vi.fn(async () => ({ kind: "ready" })),
      fileDiagnostics,
      ...rest,
    },
  });
}

function registerBasicSymbolProvider(): void {
  registerMockProvider(tmpDir, {
    documentSymbols: async () =>
      completedCodeQuery([
        {
          name: "widget",
          kind: "Function",
          file: path.join(tmpDir, "src/widget.ts"),
          declarationAnchor: { line: 8, character: 1 },
          nameAnchor: { line: 8, character: 17 },
          container: null,
          nesting: "top-level" as const,
        },
      ]),
    hover: async () => completedCodeQuery({ contents: "function widget(): number" }),
  });
  markLspReady();
}

describe("code_orientation tool", () => {
  it("is registered as an active public tool", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, undefined, homeDir);

    const tool = getTool(pi, "code_orientation");
    expect(tool).toBeDefined();
    expect(tool.name).toBe("code_orientation");
  });

  it("returns project orientation when focus is omitted", async () => {
    writeSource("src/index.ts", "export const x = 1;\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, undefined, homeDir);
    const tool = getTool(pi, "code_orientation");

    const result = (await tool.execute(
      "project-orientation",
      {},
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ text: string }> };

    expect(result.content[0].text).not.toContain("**Error");
    expect(result.content[0].text).toContain("Workspace Orientation");
  });

  it("discloses invalidated Priority Signal diagnostics", async () => {
    writeSource("src/index.ts", "export const paymentLoader = 1;\n");
    markLspReady({
      getOutstandingDiagnosticSummary: vi.fn(() => ({
        current: false,
        entries: [
          {
            file: "src/index.ts",
            total: 1,
            errors: 1,
            warnings: 0,
            information: 0,
            hints: 0,
          },
        ],
      })),
      fileDiagnostics: vi.fn(async () => []),
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, undefined, homeDir);
    const result = (await getTool(pi, "code_orientation").execute(
      "orientation-with-stale-priority-signals",
      { focus: { path: "src/index.ts" } },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ text: string }> };

    expect(result.content[0].text).toContain("invalidated by a document or workspace change");
    expect(result.content[0].text).not.toContain("This is the current LSP snapshot");
  });

  it("renders bounded live diagnostics as Priority Signals", async () => {
    writeSource("src/index.ts", "export const paymentLoader = 1;\n");
    markLspReady({
      getOutstandingDiagnosticSummary: vi.fn(() => ({
        current: true,
        entries: [
          {
            file: "src/index.ts",
            total: 2,
            errors: 1,
            warnings: 1,
            information: 0,
            hints: 0,
          },
        ],
      })),
      fileDiagnostics: vi.fn(async () => []),
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, undefined, homeDir);
    const result = (await getTool(pi, "code_orientation").execute(
      "orientation-with-priority-signals",
      { focus: { path: "src/index.ts" } },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ text: string }> };

    expect(result.content[0].text).toContain("## Priority Signals");
    expect(result.content[0].text).toContain("Diagnostics: `src/index.ts` (2 total");
  });

  it("does not turn ambient coverage or unused-code reports into Priority Signals", async () => {
    writeSource("src/index.ts", "export const paymentLoader = 1;\n");
    writeSource(
      "coverage/coverage-summary.json",
      JSON.stringify({
        "src/index.ts": { lines: { pct: 10 }, statements: { pct: 15 } },
      }),
    );
    writeSource(
      "knip.json",
      JSON.stringify({
        files: ["src/index.ts"],
        exports: [{ file: "src/index.ts", name: "paymentLoader" }],
      }),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, undefined, homeDir);
    const result = (await getTool(pi, "code_orientation").execute(
      "orientation-with-ambient-reports",
      { focus: { path: "src/index.ts" } },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ text: string }> };

    expect(result.content[0].text).not.toContain("Priority Signals");
    expect(result.content[0].text).not.toContain("Low coverage");
    expect(result.content[0].text).not.toContain("Unused file");
    expect(result.content[0].text).not.toContain("Unused export");
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
    codeIntelligenceExtension(pi as never, undefined, homeDir);
    const tool = getTool(pi, "code_orientation");

    const result = (await tool.execute(
      "module-orientation",
      { focus: { module: "app" } },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ text: string }> };

    expect(result.content[0].text).toContain("# Directory: packages/app");
    expect(result.content[0].text).toContain("## Package manifest");
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
    codeIntelligenceExtension(pi as never, undefined, homeDir);
    const tool = getTool(pi, "code_orientation");

    const result = (await tool.execute(
      "ambiguous-module-focus",
      { focus: { module: "app" } },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ text: string }> };

    expect(result.content[0].text).toContain("Module focus is ambiguous");
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
    mockLspFns.getWorkspaceLspRuntime.mockReturnValue({
      kind: "ready",
      runtime: {
        waitUntilReadyForFile: vi.fn(async () => ({ kind: "ready" })),
        fileDiagnostics: vi.fn(async () =>
          completedCodeQuery([
            {
              severity: 1,
              message: "Widget diagnostic",
              range: { start: { line: 7, character: 10 }, end: { line: 7, character: 16 } },
            },
          ]),
        ),
        recoverDiagnostics: vi.fn(async () => ({
          attemptedClients: 0,
          restartedClients: 0,
          diagnosticEvidence: emptyEvidence(),
          staleAssessment: { suspected: false, matchedFiles: [], warning: null },
        })),
      },
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, undefined, homeDir);
    const tool = getTool(pi, "code_orientation");

    const result = (await tool.execute(
      "symbol-orientation",
      { focus: { target: { anchor: { file: "src/widget.ts", line: 8, character: 17 } } } },
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
    expect(result.content[0].text).not.toContain("\n/\n");
    expect(result.content[0].text).toContain("## Diagnostics");
    expect(result.content[0].text).toContain("Widget diagnostic");
    expect(result.content[0].text).toContain("## Read Next");
    expect(result.details?.data.target?.targetId).toMatch(/^tg-/);
    expect(result.details?.data.target?.name).toBe("widget");
  });

  it("does not show unrelated whole-file diagnostics for symbol orientation", async () => {
    writeSource("src/widget.ts", "export function widget() { return 1; }\nconst far = 1;\n");
    registerMockProvider(tmpDir, {
      documentSymbols: async () =>
        completedCodeQuery([
          {
            name: "widget",
            kind: "Function",
            file: path.join(tmpDir, "src/widget.ts"),
            declarationAnchor: { line: 1, character: 1 },
            nameAnchor: { line: 1, character: 17 },
            container: null,
            nesting: "top-level" as const,
          },
        ]),
    });
    mockLspFns.getWorkspaceLspRuntime.mockReturnValue({
      kind: "ready",
      runtime: {
        waitUntilReadyForFile: vi.fn(async () => ({ kind: "ready" })),
        fileDiagnostics: vi.fn(async () =>
          completedCodeQuery([
            {
              severity: 1,
              message: "Far diagnostic",
              range: { start: { line: 20, character: 1 }, end: { line: 20, character: 2 } },
            },
          ]),
        ),
        recoverDiagnostics: vi.fn(async () => ({
          attemptedClients: 0,
          restartedClients: 0,
          diagnosticEvidence: emptyEvidence(),
          staleAssessment: { suspected: false, matchedFiles: [], warning: null },
        })),
      },
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, undefined, homeDir);
    const tool = getTool(pi, "code_orientation");

    const result = (await tool.execute(
      "near-diagnostics",
      { focus: { target: { anchor: { file: "src/widget.ts", line: 1, character: 17 } } } },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ text: string }> };

    expect(result.content[0].text).toContain("No diagnostics found near this target");
    expect(result.content[0].text).not.toContain("Far diagnostic");
  });

  it("keeps stored-handle Orientation structural when live file readiness is lost", async () => {
    writeSource("src/widget.ts", "export function widget() { return 1; }\n");
    const hover = vi.fn(async () => completedCodeQuery({ contents: "function widget(): number" }));
    const definition = vi.fn(async () => completedCodeQuery([]));
    registerMockProvider(tmpDir, {
      documentSymbols: async () =>
        completedCodeQuery([
          {
            name: "widget",
            kind: "Function",
            file: path.join(tmpDir, "src/widget.ts"),
            declarationAnchor: { line: 1, character: 1 },
            nameAnchor: { line: 1, character: 17 },
            container: null,
            nesting: "top-level" as const,
          },
        ]),
      hover,
      definition,
      nodeAt: async () => ({
        kind: "success",
        data: {
          type: "identifier",
          text: "widget",
          startLine: 1,
          startCharacter: 17,
          endLine: 1,
          endCharacter: 23,
          ancestry: [],
        },
      }),
      outline: async () => ({
        kind: "success",
        data: [
          {
            name: "widget",
            kind: "function",
            startLine: 1,
            startCharacter: 8,
            endLine: 1,
            endCharacter: 40,
          },
        ],
      }),
    });
    markLspReady();

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, undefined, homeDir);
    const targetId = await resolveTargetId(pi, "src/widget.ts", 1, 17);
    const fileDiagnostics = vi.fn(async () => null);
    markLspReady({
      waitUntilReadyForFile: vi.fn(async () => ({
        kind: "unavailable",
        reason: "file client lost",
      })),
      fileDiagnostics,
    });

    const result = (await getTool(pi, "code_orientation").execute(
      "degraded-handle-orientation",
      { focus: { target: { handle: targetId } } },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ text: string }>;
      details?: { type: "context"; data: { confidence: string } };
    };

    expect(hover).not.toHaveBeenCalled();
    expect(definition).not.toHaveBeenCalled();
    expect(fileDiagnostics).not.toHaveBeenCalled();
    expect(result.details?.data.confidence).toBe("structural");
    expect(result.content[0].text).toContain("diagnostics require a live language server");
  });

  it("orients by a handle returned from code_resolve", async () => {
    writeSource("src/widget.ts", "export function widget() { return 1; }\n");
    registerMockProvider(tmpDir, {
      documentSymbols: async () =>
        completedCodeQuery([
          {
            name: "widget",
            kind: "Function",
            file: path.join(tmpDir, "src/widget.ts"),
            declarationAnchor: { line: 1, character: 1 },
            nameAnchor: { line: 1, character: 17 },
            container: null,
            nesting: "top-level" as const,
          },
        ]),
    });
    markLspReady();

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, undefined, homeDir);
    const targetId = await resolveTargetId(pi, "src/widget.ts", 1, 17);
    const tool = getTool(pi, "code_orientation");

    const result = (await tool.execute(
      "targetid-wins",
      { focus: { target: { handle: targetId } } },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ text: string }> };

    expect(result.content[0].text).not.toContain("**Error");
    expect(result.content[0].text).toContain("widget");
  });

  it("hard-errors on invalid focus in orientation mode", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, undefined, homeDir);
    const tool = getTool(pi, "code_orientation");

    const result = (await tool.execute(
      "invalid-focus",
      { focus: { path: "does-not-exist" } },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ text: string }> };

    expect(result.content[0].text).toContain("Focus path not found");
  });
});
