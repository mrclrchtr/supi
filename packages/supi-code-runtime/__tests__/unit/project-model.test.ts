import { describe, expect, it } from "vitest";
import type { ArchitectureModel, ModuleInfo } from "../../src/api.ts";

describe("ArchitectureModel types", () => {
  it("type-checks a minimal model", () => {
    const model: ArchitectureModel = {
      root: "/project",
      name: "my-project",
      description: "A test project",
      modules: [],
      edges: [],
    };
    expect(model.name).toBe("my-project");
  });

  it("type-checks a module with internal deps", () => {
    const mod: ModuleInfo = {
      name: "@scope/pkg-a",
      description: "Package A",
      root: "/project/packages/a",
      relativePath: "packages/a",
      entrypoints: ["./src/index.ts"],
      isLeaf: false,
      internalDeps: ["@scope/pkg-b"],
      externalDeps: ["lodash"],
    };
    expect(mod.name).toBe("@scope/pkg-a");
    expect(mod.internalDeps).toContain("@scope/pkg-b");
  });
});
