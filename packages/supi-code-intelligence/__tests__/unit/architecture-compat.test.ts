import { describe, expect, it } from "vitest";
import type { ArchitectureModel, ModuleInfo } from "../../src/architecture.ts";
import {
  buildArchitectureModel,
  findModuleForPath,
  getDependencies,
  getDependents,
} from "../../src/architecture.ts";

describe("architecture.ts compatibility wrapper", () => {
  it("exports the ArchitectureModel type", () => {
    const model: ArchitectureModel = {
      root: "/proj",
      name: "test",
      description: null,
      modules: [],
      edges: [],
    };
    expect(model.root).toBe("/proj");
  });

  it("exports ModuleInfo type", () => {
    const mod: ModuleInfo = {
      name: "@scope/pkg",
      description: null,
      root: "/proj/pkg",
      relativePath: "pkg",
      entrypoints: ["./src/index.ts"],
      isLeaf: true,
      internalDeps: [],
      externalDeps: ["lodash"],
    };
    expect(mod.name).toBe("@scope/pkg");
  });

  it("exports query functions", () => {
    expect(typeof findModuleForPath).toBe("function");
    expect(typeof getDependents).toBe("function");
    expect(typeof getDependencies).toBe("function");
    expect(typeof buildArchitectureModel).toBe("function");
  });

  // biome-ignore lint/security/noSecrets: false positive on describe name
  describe("findModuleForPath compatibility", () => {
    it("returns null for empty model", () => {
      const model: ArchitectureModel = {
        root: "/proj",
        name: null,
        description: null,
        modules: [],
        edges: [],
      };
      expect(findModuleForPath(model, "/proj/src/file.ts")).toBeNull();
    });
  });

  describe("getDependents compatibility", () => {
    it("returns empty for no internal deps", () => {
      const model: ArchitectureModel = {
        root: "/proj",
        name: null,
        description: null,
        modules: [
          {
            name: "@scope/a",
            description: null,
            root: "/proj/a",
            relativePath: "a",
            entrypoints: [],
            isLeaf: true,
            internalDeps: [],
            externalDeps: [],
          },
        ],
        edges: [],
      };
      expect(getDependents(model, "@scope/a")).toEqual([]);
    });
  });

  describe("getDependencies compatibility", () => {
    it("returns empty for unknown module", () => {
      const model: ArchitectureModel = {
        root: "/proj",
        name: null,
        description: null,
        modules: [],
        edges: [],
      };
      expect(getDependencies(model, "unknown")).toEqual([]);
    });
  });
});
