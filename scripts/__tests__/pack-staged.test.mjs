import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeNestedPackageFixture } from "./helpers/pack-fixture.mjs";

// pack-staged runs npm pack which is slow
const SLOW_TIMEOUT = 120_000;

import { packStaged } from "../pack-staged.mjs";

function extractJson(tarballPath, manifestPath) {
  const out = execFileSync("tar", ["-xOf", tarballPath, manifestPath], {
    encoding: "utf8",
  });
  return JSON.parse(out);
}

function listTarballEntries(tarballPath) {
  const listing = execFileSync("tar", ["-tzf", tarballPath], {
    encoding: "utf8",
  });
  return listing.trim().split("\n").filter(Boolean);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function makePackageWithBrokenBinLink(parentDir) {
  const packageDir = join(parentDir, "dangling-bin-package");
  mkdirSync(join(packageDir, "node_modules", ".bin"), { recursive: true });
  mkdirSync(join(packageDir, "src"), { recursive: true });
  writeJson(join(packageDir, "package.json"), {
    name: "dangling-bin-package",
    version: "0.0.0",
    main: "src/index.js",
    files: ["src"],
  });
  writeFileSync(join(packageDir, "src", "index.js"), "export const ok = true;\n");
  symlinkSync("../vitest/vitest.mjs", join(packageDir, "node_modules", ".bin", "vitest"));
  return packageDir;
}

const CORE_EXPORTS = {
  "./api": "./src/api.ts",
  "./config": "./src/config.ts",
  "./context": "./src/context.ts",
  "./debug": "./src/debug.ts",
  "./evidence-badge": "./src/evidence-badge.ts",
  "./footer-registry": "./src/footer-registry.ts",
  "./llm": "./src/llm.ts",
  "./model-selection": "./src/model-selection.ts",
  "./package.json": "./package.json",
  "./path": "./src/path.ts",
  "./report": "./src/report.ts",
  "./project": "./src/project.ts",
  "./prompt-surface": "./src/prompt-surface.ts",
  "./session": "./src/session.ts",
  "./settings": "./src/settings.ts",
  "./spinner-frames": "./src/spinner-frames.ts",
  "./status-spinner": "./src/status-spinner.ts",
  "./terminal": "./src/terminal.ts",
  "./tui": "./src/tui.ts",
};

const MINIMAL_EXPORTS = {
  "./api": "./src/api.ts",
  "./extension": "./src/extension.ts",
  "./package.json": "./package.json",
};

function expectExplicitSurface(pkg, entries) {
  expect(pkg.main).toBe("src/api.ts");
  expect(pkg.exports).toEqual(MINIMAL_EXPORTS);
  expect(pkg.pi?.extensions).toContain("./src/extension.ts");
  expect(entries).toContain("package/src/api.ts");
  expect(entries).toContain("package/src/extension.ts");
}

describe("packStaged clean manifest", () => {
  /** @type {string | null} */
  let tarball = null;
  let outDir = null;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), "supi-test-"));
  });

  afterEach(() => {
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  it("removes dangling bin symlinks before copying the package tree", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    const packageDir = makePackageWithBrokenBinLink(outDir);

    tarball = await packStaged(packageDir, { outDir });

    const entries = listTarballEntries(tarball);
    expect(entries).toContain("package/src/index.js");
  });

  it("rewrites LSP root and bundled manifests and preserves bundled dependencies", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    tarball = await packStaged("packages/supi-lsp", { outDir });

    const pkg = extractJson(tarball, "package/package.json");
    expect(JSON.stringify(pkg)).not.toContain("workspace:");
    expect(pkg.devDependencies).toBeUndefined();
    expect(Array.isArray(pkg.bundledDependencies)).toBe(true);
    expect(pkg.bundledDependencies.length).toBeGreaterThan(0);

    const sourcePkg = JSON.parse(
      readFileSync(join(process.cwd(), "packages/supi-lsp/package.json"), "utf8"),
    );
    expect(pkg.bundledDependencies).toEqual(sourcePkg.bundledDependencies);

    const corePkg = extractJson(tarball, "package/node_modules/@mrclrchtr/supi-core/package.json");
    expect(JSON.stringify(corePkg)).not.toContain("workspace:");
    expect(corePkg.devDependencies).toBeUndefined();
    expect(corePkg.bundledDependencies).toBeUndefined();
  });

  it("rewrites nested workspace bundles without copying a transitive development cycle", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    tarball = await packStaged(makeNestedPackageFixture(outDir), { outDir });
    const childPath = "package/node_modules/@mrclrchtr/fixture-child";
    const leafPath = `${childPath}/node_modules/@mrclrchtr/fixture-leaf`;
    const entries = listTarballEntries(tarball);
    const manifests = entries.filter((entry) => entry.endsWith("/package.json"));
    expect(manifests.sort()).toEqual(
      ["package/package.json", `${childPath}/package.json`, `${leafPath}/package.json`].sort(
        (a, b) => (a < b ? -1 : a > b ? 1 : 0),
      ),
    );

    const app = extractJson(tarball, "package/package.json");
    expect(app.dependencies).toEqual({ "@mrclrchtr/fixture-child": "2.3.4" });
    expect(app.bundledDependencies).toEqual(["@mrclrchtr/fixture-child"]);
    const child = extractJson(tarball, `${childPath}/package.json`);
    expect(child.dependencies).toEqual({ "@mrclrchtr/fixture-leaf": "^3.4.5" });
    expect(child.bundledDependencies).toEqual(["@mrclrchtr/fixture-leaf"]);
    const leaf = extractJson(tarball, `${leafPath}/package.json`);
    expect(leaf.name).toBe("@mrclrchtr/fixture-leaf");
    expect(leaf.version).toBe("3.4.5");
    expect(leaf.devDependencies).toBeUndefined();
    expect(entries).toContain(`${leafPath}/src/index.js`);
  });

  it("publishes explicit api and extension subpaths for packages/supi-ask-user", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    tarball = await packStaged("packages/supi-ask-user", { outDir });

    const pkg = extractJson(tarball, "package/package.json");
    const entries = listTarballEntries(tarball);
    expectExplicitSurface(pkg, entries);
  });

  it("publishes library-only surface for packages/supi-core", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    tarball = await packStaged("packages/supi-core", { outDir });

    const pkg = extractJson(tarball, "package/package.json");
    const entries = listTarballEntries(tarball);

    // supi-core is library-only — no pi key, no ./extension export
    expect(pkg.main).toBe("src/api.ts");
    expect(pkg.exports).toEqual(CORE_EXPORTS);
    expect(pkg.pi).toBeUndefined();
    expect(entries).toContain("package/src/api.ts");
    expect(entries).toContain("package/src/tui.ts");
    expect(entries).not.toContain("package/src/extension.ts");
  });

  it("publishes explicit api and extension subpaths for packages/supi-web", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    tarball = await packStaged("packages/supi-web", { outDir });

    const pkg = extractJson(tarball, "package/package.json");
    const entries = listTarballEntries(tarball);
    expectExplicitSurface(pkg, entries);
  });

  it("publishes explicit api and extension subpaths for packages/supi-settings", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    tarball = await packStaged("packages/supi-settings", { outDir });

    const pkg = extractJson(tarball, "package/package.json");
    const entries = listTarballEntries(tarball);
    expectExplicitSurface(pkg, entries);
  });
});
