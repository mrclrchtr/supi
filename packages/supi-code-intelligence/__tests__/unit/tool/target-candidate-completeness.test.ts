import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { completedCodeQuery, partialCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import codeIntelligenceExtension from "../../../src/extension.ts";
import { renderOrientationResult } from "../../../src/tool/code_orientation/tui.ts";
import { renderResolveResult } from "../../../src/tool/code_resolve/tui.ts";
import type { ToolResult } from "../../../src/ui/tui/common.ts";
import { clearMockRuntime, registerMockProvider } from "../../helpers/register-mock-runtime.ts";

const mockLspFns = vi.hoisted(() => ({
  getWorkspaceLspRuntime: vi.fn<(cwd: string) => unknown>(),
}));

vi.mock("@mrclrchtr/supi-lsp/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-lsp/api")>();
  return { ...actual, getWorkspaceLspRuntime: mockLspFns.getWorkspaceLspRuntime };
});

interface PublicResult {
  content: Array<{ type: string; text?: string }>;
  details?: {
    status?: string;
    message?: string;
    data?: {
      evidenceLists?: Array<Record<string, unknown>>;
      candidates?: Array<Record<string, unknown>>;
      nextQueries?: string[];
      targetCount?: unknown;
    };
    displaySections?: Array<Record<string, unknown>>;
  };
}

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;

beforeAll(() => initTheme("dark"));

let cwd: string;
let homeDir: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "target-candidate-output-"));
  homeDir = mkdtempSync(path.join(os.tmpdir(), "target-candidate-output-home-"));
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ name: "target-candidate-ws" }));
  writeSource("src/a.ts", "export class Widget {}\n");
  writeSource("src/b.ts", "export class Widget {}\n");
  mockLspFns.getWorkspaceLspRuntime.mockReturnValue({
    kind: "unavailable",
    reason: "no active session",
  });
});

afterEach(() => {
  clearMockRuntime();
  rmSync(cwd, { recursive: true, force: true });
  rmSync(homeDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

function writeSource(relativePath: string, source: string): void {
  const file = path.join(cwd, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}

function markLspReady(): void {
  mockLspFns.getWorkspaceLspRuntime.mockReturnValue({
    kind: "ready",
    runtime: {
      waitUntilReadyForWorkspace: vi.fn(async () => ({ kind: "ready" })),
      waitUntilReadyForFile: vi.fn(async () => ({ kind: "ready" })),
    },
  });
}

function registerLimitedProvider(): void {
  registerMockProvider(cwd, {
    workspaceSymbols: async () =>
      partialCodeQuery(
        ["a.ts", "b.ts"].map((file) => ({
          name: "Widget",
          kind: "Class",
          file: path.join(cwd, "src", file),
          declarationAnchor: { line: 1, character: 1 },
          container: null,
        })),
        "one workspace-symbol route failed",
      ),
  });
  markLspReady();
}

function resultText(result: PublicResult): string {
  return result.content.map((item) => item.text ?? "").join("\n");
}

describe("public target candidate completeness", () => {
  it.each([
    {
      maxResults: 1,
      shownCount: 1,
      omittedCount: 1,
      label: "1 candidate",
    },
    { maxResults: 6, shownCount: 2, omittedCount: 0, label: "2 candidates" },
  ])("keeps the provider reason and display counts with maxResults=$maxResults", async (case_) => {
    registerLimitedProvider();
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, undefined, homeDir);

    const resolve = (await getTool(pi, "code_resolve").execute(
      "limited-resolve",
      { target: { symbol: { query: "Widget" } }, maxResults: case_.maxResults },
      undefined,
      undefined,
      makeCtx({ cwd }),
    )) as PublicResult;
    const orientation = (await getTool(pi, "code_orientation").execute(
      "limited-orientation",
      { focus: { target: { symbol: { query: "Widget" } } }, maxResults: case_.maxResults },
      undefined,
      undefined,
      makeCtx({ cwd }),
    )) as PublicResult;

    const expected = {
      completeness: "partial",
      totalCount: null,
      shownCount: case_.shownCount,
      omittedCount: case_.omittedCount,
      partialReason: "provider-limited",
      partialMessage: "one workspace-symbol route failed",
    };
    expect(resolve.details?.data?.targetCount).toBe(2);
    for (const { key, result, render } of [
      { key: "resolve.candidates", result: resolve, render: renderResolveResult },
      { key: "orientation.candidates", result: orientation, render: renderOrientationResult },
    ]) {
      expect(result.details?.data?.evidenceLists).toContainEqual(
        expect.objectContaining({ key, ...expected }),
      );
      expect(result.details?.displaySections).toContainEqual(
        expect.objectContaining({
          key,
          evidence: { key, ...expected },
          displayOmittedCount: 0,
        }),
      );
      expect(result.details?.data?.candidates).toHaveLength(case_.shownCount);
      const transcript = [false, true].map((expanded) =>
        render(result as ToolResult, { expanded, isPartial: false }, theme, undefined)
          .render(200)
          .join("\n"),
      );
      // Canonical partial phrase: shown count, collected omissions, then the reason.
      const tail = `${case_.omittedCount ? `; ${case_.omittedCount} collected omitted` : ""}; more may exist — provider-limited; one workspace-symbol route failed`;
      const [collapsed, expanded] = transcript;
      const noun = case_.shownCount === 1 ? "candidate" : "candidates";
      expect(resultText(result)).toContain(`_(showing ${case_.shownCount} ${noun}${tail})_`);
      expect(collapsed).toContain(`${case_.label}${tail}`);
      expect(expanded).toContain(`${case_.label}${tail}`);
      for (const text of [resultText(result), ...transcript]) {
        if (case_.maxResults === 1) expect(text).not.toContain("src/b.ts");
      }
    }
  });

  it.each([
    {
      name: "kind mismatch",
      symbol: { query: "Widget", symbolKind: "interface" as const },
      message: "No target matched provider kind interface.",
      nextQuery: "Retry without symbolKind, use an observed provider kind, or focus one handle",
      contentMarker: "# No target matched provider kind `interface`",
    },
    {
      name: "ambiguity",
      symbol: { query: "Widget" },
      message: "Multiple target matches require one candidate.",
      nextQuery: "Use one candidate handle as focus.target.handle",
      contentMarker: "# Multiple targets match",
    },
  ])("reports Orientation $name as a candidate selection with its recovery", async (case_) => {
    registerMockProvider(cwd, {
      workspaceSymbols: async () =>
        completedCodeQuery(
          ["a.ts", "b.ts"].map((file) => ({
            name: "Widget",
            kind: "Class",
            file: path.join(cwd, "src", file),
            declarationAnchor: { line: 1, character: 1 },
            nameAnchor: { line: 1, character: 14 },
            container: null,
          })),
        ),
    });
    markLspReady();

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, undefined, homeDir);
    const orientation = (await getTool(pi, "code_orientation").execute(
      `orientation-${case_.name}`,
      { focus: { target: { symbol: case_.symbol } } },
      undefined,
      undefined,
      makeCtx({ cwd }),
    )) as PublicResult;

    expect(orientation.details?.status).toBe("disambiguation");
    expect(orientation.details?.message).toBe(case_.message);
    expect(resultText(orientation)).toContain(case_.contentMarker);
    expect(resultText(orientation)).toContain("Widget");
    expect(resultText(orientation)).toContain(`${case_.nextQuery}.`);
    expect(orientation.details?.data?.evidenceLists).toContainEqual(
      expect.objectContaining({
        key: "orientation.candidates",
        totalCount: 2,
        shownCount: 2,
        omittedCount: 0,
        partialReason: null,
      }),
    );
    expect(orientation.details?.data?.nextQueries).toContain(case_.nextQuery);
  });
});
