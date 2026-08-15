import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ArchitectureModel, ModuleInfo } from "../../../src/analysis/architecture/model.ts";
import { renderOverview } from "../../../src/overview/overview.ts";
import { buildOverviewData } from "../../../src/overview/overview-data.ts";

const LONG_DESCRIPTION = `Module zero ${"details ".repeat(12)}`;

describe("first-turn overview", () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ci-overview-"));
    // One module root contains a real .ts file so language detection observes it.
    fs.mkdirSync(path.join(workspaceRoot, "packages/module-0/src"), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceRoot, "packages/module-0/src/a.ts"),
      "export const a = 1;\n",
    );
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  function moduleInfo(index: number): ModuleInfo {
    return {
      name: `module-${index}`,
      description: index === 0 ? LONG_DESCRIPTION : `Module ${index}`,
      root: path.join(workspaceRoot, `packages/module-${index}`),
      relativePath: `packages/module-${index}`,
      manifestPath: `packages/module-${index}/package.json`,
      fields: [{ field: "main", value: "src/index.ts" }],
      dependencySections: [],
    };
  }

  function architectureModel(): ArchitectureModel {
    const modules = Array.from({ length: 10 }, (_, index) => moduleInfo(index));
    return {
      root: workspaceRoot,
      rootManifest: {
        status: "complete",
        path: "package.json",
        reason: null,
        package: null,
      },
      topology: {
        kind: "workspace",
        status: "complete",
        source: { path: "pnpm-workspace.yaml", field: "packages" },
        reason: null,
        failedPackageManifestCount: 0,
      },
      modules,
      edges: modules.slice(1).map((module) => ({
        from: "module-0",
        to: module.name ?? module.relativePath,
        field: "dependencies",
        specifier: "workspace:*",
        manifestPath: "packages/module-0/package.json",
      })),
      name: "workspace",
      description: "Test workspace",
    };
  }

  it("renders every discovered module and relationship without truncation", () => {
    const data = buildOverviewData(architectureModel());
    expect(data).not.toBeNull();
    if (!data) throw new Error("Expected overview data");

    expect(data.modules).toHaveLength(10);
    const output = renderOverview(data);
    const moduleZero = output.split("\n").find((line) => line.startsWith("- **module-0**"));

    expect(moduleZero).toContain("module-9");
    expect(output).not.toContain("omitted");
  });

  it("keeps structural facts only and omits free-text manifest descriptions", () => {
    const data = buildOverviewData(architectureModel());
    if (!data) throw new Error("Expected overview data");

    const output = renderOverview(data);

    expect(output).not.toContain(LONG_DESCRIPTION);
    expect(output).not.toContain("Test workspace");
    expect(output).not.toContain("Module 1");
  });

  it("labels structural facts as untrusted repository evidence", () => {
    const data = buildOverviewData(architectureModel());
    if (!data) throw new Error("Expected overview data");

    const output = renderOverview(data);

    expect(output).toContain("untrusted evidence");
    expect(output).toContain("not instructions");
  });

  it("keeps module names, dependencies, entrypoints, and detected languages", () => {
    const data = buildOverviewData(architectureModel());
    if (!data) throw new Error("Expected overview data");

    const output = renderOverview(data);

    expect(output).toContain("# Project: Code Intelligence Overview");
    expect(output).toContain("**workspace**");
    expect(output).toContain("- **module-0** → module-1, module-2");
    expect(output).toContain("[main: src/index.ts]");
    expect(output).toContain("**Detected:** ts");
    expect(output).toContain("code_orientation");
  });
});
