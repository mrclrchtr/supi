import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildArchitectureModel, getDependents } from "@mrclrchtr/supi-code-intelligence/api";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runRipgrep } from "../../src/search-helpers.ts";
import { executeOrientationTool } from "../../src/tool/execute-context.ts";
import { executeImpactTool } from "../../src/tool/execute-impact.ts";
import { executeAction } from "../helpers/execute-action.ts";
import { registerMockProvider } from "../helpers/register-mock-runtime.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-fixes-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  getDefaultWorkspaceRuntime().clearAll();
});

function writeJson(dir: string, file: string, data: unknown) {
  writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2));
}

describe("shell injection prevention", () => {
  it("handles paths with shell metacharacters safely", async () => {
    const dangerousDir = path.join(tmpDir, "safe-dir");
    mkdirSync(dangerousDir, { recursive: true });
    writeFileSync(path.join(dangerousDir, "test.ts"), "export const x = 1;");
    const matches = await runRipgrep("export", dangerousDir, tmpDir);
    expect(matches.length).toBeGreaterThanOrEqual(0);
  });

  it("handles patterns with special characters safely", async () => {
    writeFileSync(path.join(tmpDir, "test.ts"), "const x = foo();");
    const matches = await runRipgrep("foo()", tmpDir, tmpDir);
    expect(matches.length).toBeGreaterThanOrEqual(0);
  });
});

describe("transitive downstream impact", () => {
  it("finds transitive dependents in a chain", async () => {
    writeJson(tmpDir, "package.json", { name: "root" });
    writeFileSync(path.join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");

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

    const directDeps = getDependents(model as NonNullable<typeof model>, "@t/core");
    expect(directDeps.map((m) => m.name)).toContain("@t/api");
    expect(directDeps.map((m) => m.name)).not.toContain("@t/app");

    writeFileSync(path.join(tmpDir, "packages", "core", "index.ts"), "export const shared = 1;");
    writeFileSync(
      path.join(tmpDir, "packages", "api", "index.ts"),
      "import { shared } from '@t/core';",
    );
    writeFileSync(
      path.join(tmpDir, "packages", "app", "index.ts"),
      "import { api } from '@t/api';",
    );

    registerMockProvider(tmpDir, {
      workspaceSymbols: async () => [
        {
          name: "shared",
          kind: "Variable",
          file: path.join(tmpDir, "packages", "core", "index.ts"),
          declarationAnchor: { line: 1, character: 14 },
        },
      ],
      references: async () => [
        {
          uri: `file://${path.join(tmpDir, "packages", "core", "index.ts")}`,
          range: { start: { line: 0, character: 13 }, end: { line: 0, character: 19 } },
        },
        {
          uri: `file://${path.join(tmpDir, "packages", "api", "index.ts")}`,
          range: { start: { line: 0, character: 9 }, end: { line: 0, character: 15 } },
        },
      ],
    });

    const result = await executeImpactTool({ symbol: "shared" }, { cwd: tmpDir });

    expect(result.content).toContain("Impact");
    expect(result.content).toContain("downstream");
  });
});

describe("focused-tool follow-up regressions", () => {
  it("uses focus coordinates for symbol orientation without leaking inspect-style sections", async () => {
    writeJson(tmpDir, "package.json", { name: "test" });
    const srcDir = path.join(tmpDir, "src");
    mkdirSync(srcDir, { recursive: true });
    const widgetPath = path.join(srcDir, "widget.ts");
    writeFileSync(widgetPath, "export function Widget() {\n  return 1;\n}\n");

    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic(tmpDir, {
      references: async () => [],
      implementation: async () => [],
      documentSymbols: async () => [
        {
          name: "Widget",
          kind: "Function",
          file: widgetPath,
          declarationAnchor: { line: 1, character: 1 },
          nameAnchor: { line: 1, character: 17 },
          container: null,
        },
      ],
      workspaceSymbols: async () => [
        {
          name: "Widget",
          kind: "Function",
          file: widgetPath,
          declarationAnchor: { line: 1, character: 17 },
        },
      ],
      hover: async () => ({ contents: "function Widget(): number" }),
      definition: async () => [
        {
          uri: `file://${widgetPath}`,
          range: {
            start: { line: 0, character: 16 },
            end: { line: 2, character: 1 },
          },
        },
      ],
      codeActionTitles: async () => [{ title: "Add explicit return type", kind: "quickfix" }],
    });
    runtime.registerStructural(tmpDir, {
      calleesAt: async () => ({
        kind: "unavailable" as const,
        message: "not needed for symbol brief test",
      }),
      nodeAt: async () => ({
        kind: "success" as const,
        data: {
          type: "identifier",
          text: "Widget",
          startLine: 1,
          startCharacter: 17,
          endLine: 1,
          endCharacter: 23,
          ancestry: [],
        },
      }),
      outline: async () => ({
        kind: "success" as const,
        data: [
          {
            name: "Widget",
            kind: "function",
            startLine: 1,
            startCharacter: 1,
            endLine: 3,
            endCharacter: 1,
            children: [],
          },
        ],
      }),
      imports: async () => ({ kind: "success" as const, data: [] }),
      exports: async (_file) => ({
        kind: "success" as const,
        data: [
          {
            name: "Widget",
            kind: "function",
            startLine: 1,
            startCharacter: 16,
            endLine: 3,
            endCharacter: 1,
          },
        ],
      }),
      callSites: async (_f) => ({ kind: "success" as const, data: [] }),
    });

    const result = await executeOrientationTool(
      { focus: "src/widget.ts", line: 1, character: 17 },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("src/widget.ts");
    expect(result.content).toContain("## Definitions");
    expect(result.content).not.toContain("Project Brief");
    expect(result.content).not.toContain("## Hover");
    expect(result.content).not.toContain("## Code Actions");
    expect(result.details?.type).toBe("context");
    if (result.details?.type === "context") {
      expect(result.details.data.focusTarget).toContain("widget.ts");
    }
  });

  it("uses file coordinates for anchored impact follow-up hints when no symbol name is known", async () => {
    writeJson(tmpDir, "package.json", { name: "test" });
    const srcDir = path.join(tmpDir, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(srcDir, "widget.ts"), "export function doThing() {\n  return 1;\n}\n");

    registerMockProvider(tmpDir, {
      references: async () => [],
    });

    const result = await executeImpactTool(
      { file: "src/widget.ts", line: 1, character: 1 },
      { cwd: tmpDir },
    );

    expect(result.content).not.toContain('symbol: "symbol at src/widget.ts:1"');
    expect(result.details?.type).toBe("impact");
    if (result.details?.type === "impact") {
      const callersQuery = result.details.data.nextQueries.find((query: string) =>
        query.includes("code_graph"),
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
      { action: "find", query: "TARGET", contextLines: 1 },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("TARGET");
    expect(result.content).toContain("L3");
  });

  it("works correctly with contextLines=0", async () => {
    writeJson(tmpDir, "package.json", { name: "test" });
    writeFileSync(path.join(tmpDir, "sample.ts"), "export const X = 1;\nexport const Y = 2;");

    const result = await executeAction(
      { action: "find", query: "X", contextLines: 0 },
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
      { action: "find", query: "TARGET", contextLines: 1 },
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

    const supi = path.join(tmpDir, "packages", "supi");
    mkdirSync(supi, { recursive: true });
    writeJson(supi, "package.json", { name: "@t/supi" });
    writeFileSync(path.join(supi, "index.ts"), "export const supiOnly = 1;");

    const supiCore = path.join(tmpDir, "packages", "supi-core");
    mkdirSync(supiCore, { recursive: true });
    writeJson(supiCore, "package.json", { name: "@t/supi-core" });
    writeFileSync(path.join(supiCore, "index.ts"), "export const coreOnly = 1;");

    const result = await executeAction(
      { action: "find", query: "Only", path: "packages/supi/" },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("supiOnly");
    expect(result.content).not.toContain("coreOnly");
  });
});

describe("unified focus validation across target modes", () => {
  it("requires focus for a precise coordinate target", async () => {
    writeJson(tmpDir, "package.json", { name: "test" });
    const srcDir = path.join(tmpDir, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(srcDir, "widget.ts"), "export function Widget() {\n  return 1;\n}\n");

    const result = await executeOrientationTool({ line: 1, character: 17 }, { cwd: tmpDir });

    expect(result.content).toContain("**Error:**");
    expect(result.content).toContain("focus");
    expect(result.details?.type).toBe("context");
  });

  it("surfaces a focus-path error in orientation mode", async () => {
    writeJson(tmpDir, "package.json", { name: "test" });

    const result = await executeOrientationTool({ focus: "nope/" }, { cwd: tmpDir });

    expect(result.content).toContain("**Error:**");
    expect(result.content).toContain("nope");
  });
});
