import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

function expectExplicitSurface(pkg, entries) {
  expect(pkg.main).toBe("src/api.ts");
  expect(pkg.exports).toEqual({
    "./api": "./src/api.ts",
    "./extension": "./src/extension.ts",
    "./package.json": "./package.json",
  });
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

  it("produces npm-compatible root manifest for packages/supi-lsp", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    tarball = await packStaged("packages/supi-lsp", { outDir });

    const pkg = extractJson(tarball, "package/package.json");

    // Root manifest must not contain workspace: protocol
    const pkgStr = JSON.stringify(pkg);
    expect(pkgStr).not.toContain("workspace:");

    // No devDependencies should leak into publish manifest
    expect(pkg.devDependencies).toBeUndefined();

    // bundledDependencies should remain
    expect(Array.isArray(pkg.bundledDependencies)).toBe(true);
    expect(pkg.bundledDependencies.length).toBeGreaterThan(0);
  });

  it("produces npm-compatible bundled sub-package manifests for packages/supi-lsp", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    tarball = await packStaged("packages/supi-lsp", { outDir });

    // supi-lsp bundles supi-core
    const corePkg = extractJson(tarball, "package/node_modules/@mrclrchtr/supi-core/package.json");
    const coreStr = JSON.stringify(corePkg);
    expect(coreStr).not.toContain("workspace:");
    expect(corePkg.devDependencies).toBeUndefined();
  });

  it("produces npm-compatible root manifest for packages/supi (meta-package)", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    tarball = await packStaged("packages/supi", { outDir });

    const pkg = extractJson(tarball, "package/package.json");
    const pkgStr = JSON.stringify(pkg);
    expect(pkgStr).not.toContain("workspace:");
    expect(pkg.devDependencies).toBeUndefined();
    expect(Array.isArray(pkg.bundledDependencies)).toBe(true);
  });

  it("produces npm-compatible bundled sub-package manifests for packages/supi", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    tarball = await packStaged("packages/supi", { outDir });

    // Check multiple bundled sub-packages
    const bundlePaths = [
      "node_modules/@mrclrchtr/supi-lsp/package.json",
      "node_modules/@mrclrchtr/supi-code-intelligence/package.json",
      "node_modules/@mrclrchtr/supi-core/package.json",
    ];

    for (const bp of bundlePaths) {
      const subPkg = extractJson(tarball, `package/${bp}`);
      const subStr = JSON.stringify(subPkg);
      expect(subStr).not.toContain("workspace:");
      expect(subPkg.devDependencies).toBeUndefined();
    }
  });

  it("does not remove bundledDependencies from manifests", { timeout: SLOW_TIMEOUT }, async () => {
    tarball = await packStaged("packages/supi-lsp", { outDir });

    const pkg = extractJson(tarball, "package/package.json");
    expect(pkg.bundledDependencies).toEqual(["@mrclrchtr/" + "supi-core"]);

    // The bundled sub-package may or may not have its own bundledDependencies,
    // but if it does they should be preserved
    const corePkg = extractJson(tarball, "package/node_modules/@mrclrchtr/supi-core/package.json");
    // supi-core doesn't have bundledDeps in source, so it should stay absent
    expect(corePkg.bundledDependencies).toBeUndefined();
  });

  it("publishes explicit api and extension subpaths for packages/supi-ask-user", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    tarball = await packStaged("packages/supi-ask-user", { outDir });

    const pkg = extractJson(tarball, "package/package.json");
    const entries = listTarballEntries(tarball);
    expectExplicitSurface(pkg, entries);
  });

  it("publishes explicit api and extension subpaths for packages/supi-core", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    tarball = await packStaged("packages/supi-core", { outDir });

    const pkg = extractJson(tarball, "package/package.json");
    const entries = listTarballEntries(tarball);
    expectExplicitSurface(pkg, entries);
  });

  it("publishes explicit api and extension subpaths for packages/supi-web", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    tarball = await packStaged("packages/supi-web", { outDir });

    const pkg = extractJson(tarball, "package/package.json");
    const entries = listTarballEntries(tarball);
    expectExplicitSurface(pkg, entries);
  });

  it("publishes explicit api and extension subpaths for packages/supi", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    tarball = await packStaged("packages/supi", { outDir });

    const pkg = extractJson(tarball, "package/package.json");
    const entries = listTarballEntries(tarball);
    expectExplicitSurface(pkg, entries);
  });
});
