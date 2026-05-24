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

function expectLibrarySurface(pkg, entries) {
  expect(pkg.main).toBe("src/api.ts");
  expect(pkg.exports).toEqual({
    "./api": "./src/api.ts",
    "./package.json": "./package.json",
  });
  expect(pkg.pi).toBeUndefined();
  expect(entries).toContain("package/src/api.ts");
  expect(entries).not.toContain("package/src/extension.ts");
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

    // No bundledDependencies for library-only packages
    expect(pkg.bundledDependencies).toBeUndefined();

    // Library-only surface: api.ts but no extension.ts
    expect(pkg.main).toBe("src/api.ts");
    expect(pkg.exports).toEqual({
      "./api": "./src/api.ts",
      "./package.json": "./package.json",
    });
    expect(pkg.pi).toBeUndefined();
  });

  it("produces clean sub-package manifests for packages/supi-lsp (no bundled deps)", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    tarball = await packStaged("packages/supi-lsp", { outDir });

    // supi-lsp no longer bundles supi-core — it's a regular npm dependency
    const entries = listTarballEntries(tarball);
    const hasBundledCore = entries.some((e) =>
      e.startsWith("package/node_modules/@mrclrchtr/supi-core/")
    );
    expect(hasBundledCore).toBe(false);
  });

  it("packages/supi-lsp no longer exports ./extension", { timeout: SLOW_TIMEOUT }, async () => {
    tarball = await packStaged("packages/supi-lsp", { outDir });

    const pkg = extractJson(tarball, "package/package.json");
    const entries = listTarballEntries(tarball);
    expectLibrarySurface(pkg, entries);
  });

  it("packages/supi-tree-sitter exports only ./api as library", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    tarball = await packStaged("packages/supi-tree-sitter", { outDir });

    const pkg = extractJson(tarball, "package/package.json");
    const entries = listTarballEntries(tarball);
    expectLibrarySurface(pkg, entries);
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

  it("packages/supi-code-intelligence bundles supi-core and exposes explicit surfaces", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    tarball = await packStaged("packages/supi-code-intelligence", { outDir });

    const pkg = extractJson(tarball, "package/package.json");
    const entries = listTarballEntries(tarball);

    // workspace: protocol must not leak
    expect(JSON.stringify(pkg)).not.toContain("workspace:");

    // No devDependencies should leak
    expect(pkg.devDependencies).toBeUndefined();

    // bundledDependencies must include supi-core
    expect(pkg.bundledDependencies).toEqual(["@mrclrchtr/supi-core"]);

    // supi-lsp and supi-tree-sitter should NOT be bundled (library-only packages)
    expect(pkg.bundledDependencies).not.toContain("@mrclrchtr/supi-lsp");
    expect(pkg.bundledDependencies).not.toContain("@mrclrchtr/supi-tree-sitter");

    // Explicit extension surface
    expectExplicitSurface(pkg, entries);

    // Bundled supi-core must not contain workspace: protocol
    const corePkg = extractJson(tarball, "package/node_modules/@mrclrchtr/supi-core/package.json");
    expect(JSON.stringify(corePkg)).not.toContain("workspace:");
  });
});
