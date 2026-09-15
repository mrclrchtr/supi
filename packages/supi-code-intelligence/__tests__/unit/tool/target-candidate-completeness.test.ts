import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { completedCodeQuery, partialCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import codeIntelligenceExtension from "../../../src/extension.ts";
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
  it("keeps provider-limited totals and only exposes visible handles in resolve and Orientation", async () => {
    registerLimitedProvider();
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, undefined, homeDir);

    const resolve = (await getTool(pi, "code_resolve").execute(
      "limited-resolve",
      { target: { symbol: { query: "Widget" } }, maxResults: 1 },
      undefined,
      undefined,
      makeCtx({ cwd }),
    )) as PublicResult;
    const orientation = (await getTool(pi, "code_orientation").execute(
      "limited-orientation",
      { focus: { target: { symbol: { query: "Widget" } } }, maxResults: 1 },
      undefined,
      undefined,
      makeCtx({ cwd }),
    )) as PublicResult;

    const expected = {
      totalCount: null,
      shownCount: 1,
      omittedCount: 1,
      partialReason: "provider-limited",
    };
    expect(resolve.details?.data?.evidenceLists).toContainEqual(
      expect.objectContaining({ key: "resolve.candidates", ...expected }),
    );
    expect(resolve.details?.displaySections).toContainEqual(
      expect.objectContaining({ key: "resolve.candidates", ...expected }),
    );
    expect(resolve.details?.data?.candidates).toHaveLength(1);
    expect(resolve.details?.data?.targetCount).toBe(2);
    expect(resultText(resolve)).toContain(
      "showing 1; 1 collected omitted; more may exist — provider-limited",
    );
    expect(resultText(resolve)).not.toContain("of 2");
    expect(resultText(resolve)).not.toContain("src/b.ts");

    expect(orientation.details?.data?.evidenceLists).toContainEqual(
      expect.objectContaining({ key: "orientation.candidates", ...expected }),
    );
    expect(orientation.details?.displaySections).toContainEqual(
      expect.objectContaining({ key: "orientation.candidates", ...expected }),
    );
    expect(orientation.details?.data?.candidates).toHaveLength(1);
    expect(resultText(orientation)).toContain(
      "showing 1; 1 collected omitted; more may exist — provider-limited",
    );
    expect(resultText(orientation)).not.toContain("of 2");
    expect(resultText(orientation)).not.toContain("src/b.ts");
  });

  it.each([
    {
      name: "kind mismatch",
      symbol: { query: "Widget", symbolKind: "interface" as const },
      message: "No Orientation target matched provider kind interface.",
      nextQuery: "Retry without symbolKind, use an observed provider kind, or focus one handle",
      contentMarker: "# No Orientation target matched provider kind `interface`",
    },
    {
      name: "ambiguity",
      symbol: { query: "Widget" },
      message: "Multiple Orientation targets require one candidate.",
      nextQuery: "Use one candidate handle as focus.target.handle",
      contentMarker: "# Multiple Orientation targets",
    },
  ])(
    "keeps Orientation $name content and status while exposing selection metadata",
    async (case_) => {
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

      expect(orientation.details?.status).toBe("completed");
      expect(orientation.details?.message).toBe(case_.message);
      expect(resultText(orientation)).toContain(case_.contentMarker);
      expect(resultText(orientation)).toContain("Widget");
      expect(resultText(orientation)).not.toContain(case_.nextQuery);
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
    },
  );
});
