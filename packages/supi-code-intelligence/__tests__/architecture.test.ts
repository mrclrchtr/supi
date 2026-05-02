import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildArchitectureModel,
  findModuleForPath,
  getDependencies,
  getDependents,
} from "../architecture.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-arch-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeJson(dir: string, file: string, data: unknown) {
  writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2));
}

describe("buildArchitectureModel", () => {
  it("returns null for empty directory", async () => {
    const model = await buildArchitectureModel(tmpDir);
    expect(model).toBeNull();
  });

  it("returns null for directory with no source files and no manifest", async () => {
    writeFileSync(path.join(tmpDir, "README.md"), "# Hello");
    const model = await buildArchitectureModel(tmpDir);
    expect(model).toBeNull();
  });

  it("returns minimal model when source files exist but no manifest", async () => {
    writeFileSync(path.join(tmpDir, "index.ts"), "export const x = 1;");
    const model = await buildArchitectureModel(tmpDir);
    expect(model).not.toBeNull();
    expect(model?.modules).toHaveLength(0);
    expect(model?.name).toBe(path.basename(tmpDir));
  });

  it("builds single-package model from package.json", async () => {
    writeJson(tmpDir, "package.json", {
      name: "my-app",
      description: "A test app",
      main: "index.js",
    });
    const model = await buildArchitectureModel(tmpDir);
    expect(model).not.toBeNull();
    expect(model?.name).toBe("my-app");
    expect(model?.description).toBe("A test app");
    expect(model?.modules).toHaveLength(1);
    expect(model?.modules[0].name).toBe("my-app");
    expect(model?.modules[0].entrypoints).toContain("index.js");
  });

  it("detects workspace modules from pnpm-workspace.yaml", async () => {
    writeJson(tmpDir, "package.json", { name: "root" });
    writeFileSync(path.join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");

    const pkgDir = path.join(tmpDir, "packages", "pkg-a");
    mkdirSync(pkgDir, { recursive: true });
    writeJson(pkgDir, "package.json", {
      name: "@test/pkg-a",
      description: "Package A",
    });

    const pkgBDir = path.join(tmpDir, "packages", "pkg-b");
    mkdirSync(pkgBDir, { recursive: true });
    writeJson(pkgBDir, "package.json", {
      name: "@test/pkg-b",
      description: "Package B",
      dependencies: { "@test/pkg-a": "workspace:*" },
    });

    const model = await buildArchitectureModel(tmpDir);
    expect(model).not.toBeNull();
    expect(model?.modules).toHaveLength(2);

    const pkgA = model?.modules.find((m) => m.name === "@test/pkg-a");
    const pkgB = model?.modules.find((m) => m.name === "@test/pkg-b");
    expect(pkgA).toBeDefined();
    expect(pkgB).toBeDefined();
    expect(pkgB?.internalDeps).toContain("@test/pkg-a");
  });

  it("builds dependency edges between workspace modules", async () => {
    writeJson(tmpDir, "package.json", { name: "root" });
    writeFileSync(path.join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");

    const core = path.join(tmpDir, "packages", "core");
    mkdirSync(core, { recursive: true });
    writeJson(core, "package.json", { name: "@t/core" });

    const app = path.join(tmpDir, "packages", "app");
    mkdirSync(app, { recursive: true });
    writeJson(app, "package.json", {
      name: "@t/app",
      dependencies: { "@t/core": "workspace:*" },
    });

    const model = await buildArchitectureModel(tmpDir);
    expect(model?.edges).toHaveLength(1);
    expect(model?.edges[0]).toEqual({ from: "@t/app", to: "@t/core" });
  });

  it("marks leaf modules correctly", async () => {
    writeJson(tmpDir, "package.json", { name: "root" });
    writeFileSync(path.join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");

    const core = path.join(tmpDir, "packages", "core");
    mkdirSync(core, { recursive: true });
    writeJson(core, "package.json", { name: "@t/core" });

    const app = path.join(tmpDir, "packages", "app");
    mkdirSync(app, { recursive: true });
    writeJson(app, "package.json", {
      name: "@t/app",
      dependencies: { "@t/core": "workspace:*" },
    });

    const model = await buildArchitectureModel(tmpDir);
    const coreModule = model?.modules.find((m) => m.name === "@t/core");
    const appModule = model?.modules.find((m) => m.name === "@t/app");
    expect(coreModule?.isLeaf).toBe(false); // core is depended on
    expect(appModule?.isLeaf).toBe(true); // app has no dependents
  });

  it("detects pi extension entrypoints", async () => {
    writeJson(tmpDir, "package.json", {
      name: "pi-ext",
      pi: { extensions: ["./ext.ts"] },
    });
    const model = await buildArchitectureModel(tmpDir);
    expect(model?.modules[0].entrypoints).toContain("./ext.ts");
  });

  it("distinguishes internal and external dependencies", async () => {
    writeJson(tmpDir, "package.json", { name: "root" });
    writeFileSync(path.join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");

    const pkg = path.join(tmpDir, "packages", "pkg");
    mkdirSync(pkg, { recursive: true });
    writeJson(pkg, "package.json", {
      name: "@t/pkg",
      dependencies: {
        "@t/other": "workspace:*",
        lodash: "^4.0.0",
      },
    });

    const other = path.join(tmpDir, "packages", "other");
    mkdirSync(other, { recursive: true });
    writeJson(other, "package.json", { name: "@t/other" });

    const model = await buildArchitectureModel(tmpDir);
    const pkgMod = model?.modules.find((m) => m.name === "@t/pkg");
    expect(pkgMod?.internalDeps).toContain("@t/other");
    expect(pkgMod?.externalDeps).toContain("lodash");
  });
});

// biome-ignore lint/security/noSecrets: function name in test describe
describe("findModuleForPath", () => {
  it("finds the most specific module for a file path", async () => {
    writeJson(tmpDir, "package.json", { name: "root" });
    writeFileSync(path.join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");

    const pkgDir = path.join(tmpDir, "packages", "core");
    mkdirSync(pkgDir, { recursive: true });
    writeJson(pkgDir, "package.json", { name: "@t/core" });
    writeFileSync(path.join(pkgDir, "index.ts"), "");

    const model = await buildArchitectureModel(tmpDir);
    expect(model).not.toBeNull();

    const found = findModuleForPath(
      model as NonNullable<typeof model>,
      path.join(pkgDir, "index.ts"),
    );
    expect(found?.name).toBe("@t/core");
  });

  it("returns null for paths outside any module", async () => {
    writeJson(tmpDir, "package.json", { name: "root" });
    const model = await buildArchitectureModel(tmpDir);
    expect(model).not.toBeNull();
    const found = findModuleForPath(model as NonNullable<typeof model>, "/nonexistent/file.ts");
    expect(found).toBeNull();
  });
});

describe("getDependents / getDependencies", () => {
  it("returns modules that depend on a given module", async () => {
    writeJson(tmpDir, "package.json", { name: "root" });
    writeFileSync(path.join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");

    for (const name of ["core", "app", "cli"]) {
      const d = path.join(tmpDir, "packages", name);
      mkdirSync(d, { recursive: true });
      const deps = name === "core" ? {} : { "@t/core": "workspace:*" };
      writeJson(d, "package.json", { name: `@t/${name}`, dependencies: deps });
    }

    const model = await buildArchitectureModel(tmpDir);
    expect(model).not.toBeNull();

    const dependents = getDependents(model as NonNullable<typeof model>, "@t/core");
    const names = dependents.map((m) => m.name);
    expect(names).toContain("@t/app");
    expect(names).toContain("@t/cli");
    expect(names).not.toContain("@t/core");
  });

  it("returns dependencies as ModuleInfo objects", async () => {
    writeJson(tmpDir, "package.json", { name: "root" });
    writeFileSync(path.join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");

    const core = path.join(tmpDir, "packages", "core");
    mkdirSync(core, { recursive: true });
    writeJson(core, "package.json", { name: "@t/core" });

    const app = path.join(tmpDir, "packages", "app");
    mkdirSync(app, { recursive: true });
    writeJson(app, "package.json", {
      name: "@t/app",
      dependencies: { "@t/core": "workspace:*" },
    });

    const model = await buildArchitectureModel(tmpDir);
    expect(model).not.toBeNull();
    const deps = getDependencies(model as NonNullable<typeof model>, "@t/app");
    expect(deps).toHaveLength(1);
    expect(deps[0].name).toBe("@t/core");
  });
});
