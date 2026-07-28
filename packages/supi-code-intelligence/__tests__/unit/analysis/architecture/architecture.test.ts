import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildArchitectureModel } from "../../../../src/analysis/architecture/discovery.ts";
import { findModuleForPath } from "../../../../src/analysis/architecture/model.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-arch-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function write(relativePath: string, content: string): void {
  const target = path.join(tmpDir, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function writeJson(relativePath: string, value: unknown): void {
  write(relativePath, JSON.stringify(value, null, 2));
}

describe("buildArchitectureModel", () => {
  it("reports unavailable topology instead of inferring source-only project structure", async () => {
    write("src/Main.java", "class Main {}\n");

    const model = await buildArchitectureModel(tmpDir);

    expect(model.topology).toMatchObject({
      kind: "unavailable",
      status: "unavailable",
    });
    expect(model.modules).toEqual([]);
    expect(model.rootManifest).toMatchObject({ status: "unavailable" });
  });

  it("preserves declared manifest fields and dependency sections without entrypoint precedence", async () => {
    writeJson("package.json", {
      name: "app",
      description: "App package",
      main: "src/main.ts",
      module: "src/module.ts",
      exports: { ".": "./src/api.ts", "./cli": "./src/cli.ts" },
      bin: { app: "./src/cli.ts" },
      pi: { extensions: ["./src/extension.ts"] },
      bundledDependencies: ["left-pad"],
      dependencies: { "left-pad": "^1.0.0" },
      devDependencies: { vitest: "^4.0.0" },
      optionalDependencies: {},
      peerDependencies: { typescript: "^6.0.0" },
    });

    const model = await buildArchitectureModel(tmpDir);
    const pkg = model.modules[0];

    expect(model.topology).toMatchObject({ kind: "single-package", status: "complete" });
    expect(pkg?.fields.map((field) => field.field)).toEqual(
      expect.arrayContaining([
        "main",
        "module",
        "exports",
        "bin",
        "pi.extensions",
        "bundledDependencies",
      ]),
    );
    expect(pkg?.dependencySections.map((section) => section.field)).toEqual([
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ]);
  });

  it("parses inline pnpm YAML and applies leading exclusions through the glob engine", async () => {
    writeJson("package.json", { name: "root" });
    write("pnpm-workspace.yaml", "packages: ['packages/*', '!packages/private']\n");
    writeJson("packages/public/package.json", { name: "@test/public" });
    writeJson("packages/private/package.json", { name: "@test/private" });
    write("packages/not-a-directory.txt", "not a package directory");

    const model = await buildArchitectureModel(tmpDir);

    expect(model.topology).toMatchObject({
      kind: "workspace",
      status: "complete",
      source: { path: "pnpm-workspace.yaml", field: "packages" },
    });
    expect(model.modules.map((module) => module.name)).toEqual(["@test/public"]);
  });

  it("finds an enclosing workspace when called from a member package", async () => {
    writeJson("package.json", { name: "root" });
    write("pnpm-workspace.yaml", "packages:\n  - packages/*\n");
    writeJson("packages/app/package.json", { name: "@test/app" });
    mkdirSync(path.join(tmpDir, "packages/app/src"), { recursive: true });

    const model = await buildArchitectureModel(path.join(tmpDir, "packages/app/src"));

    expect(model.root).toBe(tmpDir);
    expect(model.modules.map((module) => module.name)).toEqual(["@test/app"]);
  });

  it("uses package membership and the declaring manifest field for workspace relationships", async () => {
    writeJson("package.json", { name: "root", workspaces: { packages: ["packages/*"] } });
    writeJson("packages/core/package.json", { name: "@test/core" });
    writeJson("packages/app/package.json", {
      name: "@test/app",
      dependencies: { "@test/core": "^1.0.0", lodash: "^4.0.0" },
      devDependencies: { "@test/core": "^1.0.0" },
    });

    const model = await buildArchitectureModel(tmpDir);

    expect(model.topology.source).toEqual({ path: "package.json", field: "workspaces.packages" });
    expect(model.edges).toEqual([
      {
        from: "@test/app",
        to: "@test/core",
        field: "dependencies",
        specifier: "^1.0.0",
        manifestPath: "packages/app/package.json",
      },
      {
        from: "@test/app",
        to: "@test/core",
        field: "devDependencies",
        specifier: "^1.0.0",
        manifestPath: "packages/app/package.json",
      },
    ]);
  });

  it("reports malformed configuration as unavailable rather than approximating its members", async () => {
    writeJson("package.json", { name: "root" });
    write("pnpm-workspace.yaml", "packages: [\n");
    writeJson("packages/app/package.json", { name: "@test/app" });

    const model = await buildArchitectureModel(tmpDir);

    expect(model.topology).toMatchObject({ kind: "unavailable", status: "unavailable" });
    expect(model.topology.reason).toContain("Could not parse pnpm-workspace.yaml");
    expect(model.modules).toEqual([]);
  });

  it("fails closed for unsupported workspace glob syntax", async () => {
    writeJson("package.json", { name: "root", workspaces: ["packages/{app,core}"] });
    writeJson("packages/app/package.json", { name: "@test/app" });

    const model = await buildArchitectureModel(tmpDir);

    expect(model.topology).toMatchObject({ kind: "unavailable", status: "unavailable" });
    expect(model.topology.reason).toContain("Unsupported workspace pattern");
  });

  it("fails closed when an inclusion follows an exclusion", async () => {
    writeJson("package.json", {
      name: "root",
      workspaces: ["packages/*", "!packages/private", "packages/private/reincluded"],
    });

    const model = await buildArchitectureModel(tmpDir);

    expect(model.topology).toMatchObject({ kind: "unavailable", status: "unavailable" });
    expect(model.topology.reason).toContain("re-include");
  });

  it("marks topology partial when a matched package manifest cannot be parsed", async () => {
    writeJson("package.json", { name: "root", workspaces: ["packages/*"] });
    writeJson("packages/valid/package.json", { name: "@test/valid" });
    write("packages/broken/package.json", "{ bad JSON");

    const model = await buildArchitectureModel(tmpDir);

    expect(model.topology).toMatchObject({
      kind: "workspace",
      status: "partial",
      failedPackageManifestCount: 1,
    });
    expect(model.modules.map((module) => module.name)).toEqual(["@test/valid"]);
  });

  it("finds the most specific parsed package for a path", async () => {
    writeJson("package.json", { name: "root", workspaces: ["packages/*"] });
    writeJson("packages/core/package.json", { name: "@test/core" });
    write("packages/core/src/index.ts", "export {};\n");

    const model = await buildArchitectureModel(tmpDir);

    expect(findModuleForPath(model, path.join(tmpDir, "packages/core/src/index.ts"))?.name).toBe(
      "@test/core",
    );
  });
});
