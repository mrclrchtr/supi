import { describe, expect, it } from "vitest";
import type { ArchitectureModel, ModuleInfo } from "../../../src/analysis/architecture/model.ts";
import { renderOverview } from "../../../src/overview/overview.ts";
import { buildOverviewData } from "../../../src/overview/overview-data.ts";

const LONG_DESCRIPTION = `Module zero ${"details ".repeat(12)}`;

function moduleInfo(index: number): ModuleInfo {
  return {
    name: `module-${index}`,
    description: index === 0 ? LONG_DESCRIPTION : `Module ${index}`,
    root: `/workspace/packages/module-${index}`,
    relativePath: `packages/module-${index}`,
    manifestPath: `packages/module-${index}/package.json`,
    fields: [{ field: "main", value: "src/index.ts" }],
    dependencySections: [],
  };
}

function architectureModel(): ArchitectureModel {
  const modules = Array.from({ length: 10 }, (_, index) => moduleInfo(index));
  return {
    root: "/workspace",
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

describe("first-turn overview", () => {
  it("renders every discovered module and relationship without truncation", () => {
    const data = buildOverviewData(architectureModel());
    expect(data).not.toBeNull();
    if (!data) throw new Error("Expected overview data");

    expect(data.modules).toHaveLength(10);
    const output = renderOverview(data);
    const moduleZero = output.split("\n").find((line) => line.startsWith("- **module-0**"));

    expect(moduleZero).toContain("module-9");
    expect(moduleZero).toContain(LONG_DESCRIPTION);
    expect(output).not.toContain("omitted");
  });
});
