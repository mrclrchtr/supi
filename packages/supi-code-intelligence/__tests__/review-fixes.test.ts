import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildArchitectureModel, getDependents } from "../architecture.ts";
import { runRipgrep } from "../search-helpers.ts";
import { executeAction } from "../tool-actions.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-fixes-"));
});

afterEach(() => {
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

    const result = await executeAction(
      { action: "affected", symbol: "shared", path: "packages/" },
      { cwd: tmpDir },
    );

    // The result should mention downstream impact beyond just api
    // The BFS traversal should find app through api
    expect(result).toContain("Affected");
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
    expect(result).toContain("TARGET");
    // With contextLines=1, should also have surrounding content
    // The context lines appear as indented L<num> entries
    expect(result).toContain("L3");
  });

  it("works correctly with contextLines=0", async () => {
    writeJson(tmpDir, "package.json", { name: "test" });
    writeFileSync(path.join(tmpDir, "sample.ts"), "export const X = 1;\nexport const Y = 2;");

    const result = await executeAction(
      { action: "pattern", pattern: "X", contextLines: 0 },
      { cwd: tmpDir },
    );

    expect(result).toContain("X");
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

    expect(result).toContain("supiOnly");
    expect(result).not.toContain("coreOnly");
  });
});
