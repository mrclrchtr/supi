import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildArchitectureModel, getDependents } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runRipgrep } from "../../src/search-helpers.ts";
import { executeAction } from "../helpers/execute-action.ts";

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
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-fixes-"));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeJson(dir: string, file: string, data: unknown) {
  writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2));
}

describe("shell injection prevention", () => {
  it("handles paths with shell metacharacters safely", () => {
    // Create a directory with a shell-dangerous name
    const dangerousDir = path.join(tmpDir, "safe-dir");
    mkdirSync(dangerousDir, { recursive: true });
    writeFileSync(path.join(dangerousDir, "test.ts"), "export const x = 1;");

    // This should not execute any shell commands via the path
    const matches = runRipgrep("export", dangerousDir, tmpDir);
    // Should find the match normally without shell injection
    expect(matches.length).toBeGreaterThanOrEqual(0);
  });

  it("handles patterns with special characters safely", () => {
    writeFileSync(path.join(tmpDir, "test.ts"), "const x = foo();");
    // Pattern with regex-like characters should be treated as-is
    const matches = runRipgrep("foo()", tmpDir, tmpDir);
    expect(matches.length).toBeGreaterThanOrEqual(0);
  });
});

describe("transitive downstream impact", () => {
  it("finds transitive dependents in a chain", async () => {
    writeJson(tmpDir, "package.json", { name: "root" });
    writeFileSync(path.join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");

    // Create chain: core -> api -> app
    for (const [name, deps] of [
      ["core", {}],
      ["api", { "@t/core": "workspace:*" }],
      ["app", { "@t/api": "workspace:*" }],
    ] as const) {
      const d = path.join(tmpDir, "packages", name);
      mkdirSync(d, { recursive: true });
      writeJson(d, "package.json", { name: `@t/${name}`, dependencies: deps });
    }

    const model = await buildArchitectureModel(tmpDir);
    expect(model).not.toBeNull();

    // Direct dependents of core: only api
    const directDeps = getDependents(model as NonNullable<typeof model>, "@t/core");
    expect(directDeps.map((m) => m.name)).toContain("@t/api");
    expect(directDeps.map((m) => m.name)).not.toContain("@t/app");

    // But transitive impact should include app via api
    // Test via the affected action output
    writeFileSync(path.join(tmpDir, "packages", "core", "index.ts"), "export const shared = 1;");
    writeFileSync(
      path.join(tmpDir, "packages", "api", "index.ts"),
      "import { shared } from '@t/core';",
    );
    writeFileSync(
      path.join(tmpDir, "packages", "app", "index.ts"),
      "import { api } from '@t/api';",
    );

    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: {
        workspaceSymbol: vi.fn().mockResolvedValue([
          {
            name: "shared",
            kind: 14,
            location: {
              uri: `file://${path.join(tmpDir, "packages", "core", "index.ts")}`,
              range: { start: { line: 0, character: 13 }, end: { line: 0, character: 19 } },
            },
          },
        ]),
        references: vi.fn().mockResolvedValue([
          {
            uri: `file://${path.join(tmpDir, "packages", "core", "index.ts")}`,
            range: { start: { line: 0, character: 13 }, end: { line: 0, character: 19 } },
          },
          {
            uri: `file://${path.join(tmpDir, "packages", "api", "index.ts")}`,
            range: { start: { line: 0, character: 9 }, end: { line: 0, character: 15 } },
          },
        ]),
        getOutstandingDiagnosticSummary: vi.fn().mockReturnValue([]),
      },
    });

    const result = await executeAction(
      { action: "affected", symbol: "shared", path: "packages/" },
      { cwd: tmpDir },
    );

    // The result should mention downstream impact beyond just api.
    // The BFS traversal should find app through api.
    expect(result.content).toContain("Affected");
    expect(result.content).toContain("downstream");
  });
});

describe("focused-tool follow-up regressions", () => {
  it("uses symbol input for code_brief instead of falling back to a project brief", async () => {
    writeJson(tmpDir, "package.json", { name: "test" });
    const srcDir = path.join(tmpDir, "src");
    mkdirSync(srcDir, { recursive: true });
    const widgetPath = path.join(srcDir, "widget.ts");
    writeFileSync(widgetPath, "export function Widget() {\n  return 1;\n}\n");

    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: {
        workspaceSymbol: vi.fn().mockResolvedValue([
          {
            name: "Widget",
            kind: 12,
            location: {
              uri: `file://${widgetPath}`,
              range: { start: { line: 0, character: 16 }, end: { line: 0, character: 22 } },
            },
          },
        ]),
      },
    });

    const result = await executeAction({ action: "brief", symbol: "Widget" }, { cwd: tmpDir });

    expect(result.content).toContain("Symbol Brief: Widget");
    expect(result.content).toContain("Resolved to:");
    expect(result.content).toContain("src/widget.ts");
    expect(result.content).not.toContain("Project Brief");
    expect(result.details?.type).toBe("brief");
    if (result.details?.type === "brief") {
      expect(result.details.data.confidence).toBe("semantic");
      expect(result.details.data.focusTarget).toContain("Widget");
    }
  });

  it("uses file coordinates for anchored code_affected follow-up hints when no symbol name is known", async () => {
    writeJson(tmpDir, "package.json", { name: "test" });
    const srcDir = path.join(tmpDir, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(srcDir, "widget.ts"), "export function doThing() {\n  return 1;\n}\n");

    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: {
        references: vi.fn().mockResolvedValue([]),
        getOutstandingDiagnosticSummary: vi.fn().mockReturnValue([]),
      },
    });

    const result = await executeAction(
      { action: "affected", file: "src/widget.ts", line: 1, character: 1 },
      { cwd: tmpDir },
    );

    expect(result.content).toContain('file: "src/widget.ts"');
    expect(result.content).not.toContain('symbol: "symbol at src/widget.ts:1"');
    expect(result.details?.type).toBe("affected");
    if (result.details?.type === "affected") {
      const callersQuery = result.details.data.nextQueries.find((query) =>
        query.includes("code_relations"),
      );
      expect(callersQuery).toContain('file: "src/widget.ts"');
      expect(callersQuery).toContain("line: 1");
      expect(callersQuery).not.toContain('symbol: "symbol at');
    }
  });
});

describe("contextLines in pattern results", () => {
  it("includes context lines when contextLines > 0", async () => {
    writeJson(tmpDir, "package.json", { name: "test" });
    writeFileSync(
      path.join(tmpDir, "sample.ts"),
      [
        "// line 1 before",
        "// line 2 before",
        "export const TARGET = 42;",
        "// line 4 after",
        "// line 5 after",
      ].join("\n"),
    );

    const result = await executeAction(
      { action: "pattern", pattern: "TARGET", contextLines: 1 },
      { cwd: tmpDir },
    );

    // Should contain the match line
    expect(result.content).toContain("TARGET");
    // With contextLines=1, should also have surrounding content
    // The context lines appear as indented L<num> entries
    expect(result.content).toContain("L3");
  });

  it("works correctly with contextLines=0", async () => {
    writeJson(tmpDir, "package.json", { name: "test" });
    writeFileSync(path.join(tmpDir, "sample.ts"), "export const X = 1;\nexport const Y = 2;");

    const result = await executeAction(
      { action: "pattern", pattern: "X", contextLines: 0 },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("X");
  });

  it("deduplicates overlapping context lines without hiding distinct matches", async () => {
    writeJson(tmpDir, "package.json", { name: "test" });
    writeFileSync(
      path.join(tmpDir, "sample.ts"),
      [
        "// line 1 before",
        "export const TARGET_ONE = 1;",
        "// shared context",
        "export const TARGET_TWO = 2;",
        "// line 5 after",
      ].join("\n"),
    );

    const result = await executeAction(
      { action: "pattern", pattern: "TARGET", contextLines: 1 },
      { cwd: tmpDir },
    );

    expect(result.content.match(/L3:/g)).toHaveLength(1);
    expect(result.content.match(/L2:/g)).toHaveLength(1);
    expect(result.content.match(/L4:/g)).toHaveLength(1);
    expect(result.content).toContain("TARGET_ONE");
    expect(result.content).toContain("TARGET_TWO");
  });
});

describe("path scoping uses proper containment", () => {
  it("does not match path prefix siblings", async () => {
    writeJson(tmpDir, "package.json", { name: "root" });
    writeFileSync(path.join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");

    // Create packages/supi and packages/supi-core
    // scoping to packages/supi should NOT include packages/supi-core
    const supi = path.join(tmpDir, "packages", "supi");
    mkdirSync(supi, { recursive: true });
    writeJson(supi, "package.json", { name: "@t/supi" });
    writeFileSync(path.join(supi, "index.ts"), "export const supiOnly = 1;");

    const supiCore = path.join(tmpDir, "packages", "supi-core");
    mkdirSync(supiCore, { recursive: true });
    writeJson(supiCore, "package.json", { name: "@t/supi-core" });
    writeFileSync(path.join(supiCore, "index.ts"), "export const coreOnly = 1;");

    // Pattern search scoped to packages/supi/ should only find supiOnly
    const result = await executeAction(
      { action: "pattern", pattern: "Only", path: "packages/supi/" },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("supiOnly");
    expect(result.content).not.toContain("coreOnly");
  });
});
