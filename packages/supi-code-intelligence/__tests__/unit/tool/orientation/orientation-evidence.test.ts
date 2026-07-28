import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { completedCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
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

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "orientation-evidence-"));
  writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "test-workspace" }));
  mockLspFns.getWorkspaceLspRuntime.mockReturnValue({
    kind: "unavailable",
    reason: "no active session",
  });
});

afterEach(() => {
  clearMockRuntime();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

function writeSource(relativePath: string, source: string): void {
  const target = path.join(tmpDir, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, source);
}

function markLspReady(fileDiagnostics: () => Promise<unknown>): void {
  mockLspFns.getWorkspaceLspRuntime.mockReturnValue({
    kind: "ready",
    runtime: {
      waitUntilReadyForFile: vi.fn(async () => ({ kind: "ready" })),
      fileDiagnostics,
    },
  });
}

describe("code_orientation evidence sections", () => {
  it("keeps file outline/import/export facts provider-backed with independent exact bounds", async () => {
    writeSource("src/widget.ts", "export const widget = 1;\n");
    registerMockProvider(tmpDir, {
      outline: async () => ({
        kind: "success",
        data: [
          {
            name: "widget",
            kind: "variable",
            startLine: 1,
            startCharacter: 1,
            endLine: 1,
            endCharacter: 20,
          },
          {
            name: "other",
            kind: "variable",
            startLine: 2,
            startCharacter: 1,
            endLine: 2,
            endCharacter: 20,
          },
        ],
      }),
      imports: async () => ({
        kind: "success",
        data: [
          {
            moduleSpecifier: "node:path",
            startLine: 1,
            startCharacter: 1,
            endLine: 1,
            endCharacter: 20,
          },
        ],
      }),
      exports: async () => ({
        kind: "success",
        data: [
          {
            name: "widget",
            kind: "variable",
            startLine: 1,
            startCharacter: 1,
            endLine: 1,
            endCharacter: 20,
          },
        ],
      }),
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const result = (await getTool(pi, "code_orientation").execute(
      "provider-file-facts",
      { focus: { path: "src/widget.ts" }, maxResults: 1 },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ text: string }>;
      details?: {
        data?: { sections?: Array<{ key: string; evidenceLists: Array<Record<string, unknown>> }> };
      };
    };

    expect(result.content[0]?.text).toContain("## Provider outline");
    expect(result.content[0]?.text).toContain("## Provider imports");
    expect(result.content[0]?.text).toContain("## Provider exports");
    expect(result.content[0]?.text).toContain("showing 1 of 2; 1 omitted");
    expect(result.details?.data?.sections).toContainEqual(
      expect.objectContaining({
        key: "structural.outline",
        evidenceLists: [expect.objectContaining({ totalCount: 2, shownCount: 1, omittedCount: 1 })],
      }),
    );
  });

  it("discloses capped precise-target diagnostics in Markdown and structured details", async () => {
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
    markLspReady(async () =>
      completedCodeQuery([
        {
          severity: 1,
          message: "first",
          range: { start: { line: 0, character: 1 }, end: { line: 0, character: 2 } },
        },
        {
          severity: 2,
          message: "second",
          range: { start: { line: 0, character: 3 }, end: { line: 0, character: 4 } },
        },
        {
          severity: 2,
          message: "third",
          range: { start: { line: 0, character: 5 }, end: { line: 0, character: 6 } },
        },
      ]),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const result = (await getTool(pi, "code_orientation").execute(
      "target-diagnostic-bounds",
      {
        focus: { target: { anchor: { file: "src/widget.ts", line: 1, character: 17 } } },
        maxResults: 1,
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ text: string }>;
      details?: {
        data?: { sections?: Array<{ key: string; evidenceLists: Array<Record<string, unknown>> }> };
      };
    };

    expect(result.content[0]?.text).toContain("showing 1 of 3; 2 omitted");
    expect(result.details?.data?.sections).toContainEqual(
      expect.objectContaining({
        key: "diagnostics",
        evidenceLists: [expect.objectContaining({ totalCount: 3, shownCount: 1, omittedCount: 2 })],
      }),
    );
  });
});
