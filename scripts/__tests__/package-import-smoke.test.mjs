import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { packStaged } from "../pack-staged.mjs";

const SLOW_TIMEOUT = 120_000;
const SUPI_SCOPE = "@mrclrchtr/";

function unpackPackage(tarballPath, packageName, projectDir) {
  const unpackDir = mkdtempSync(join(tmpdir(), "supi-unpack-"));
  execFileSync("tar", ["-xzf", tarballPath, "-C", unpackDir]);

  const destDir = join(projectDir, "node_modules", ...packageName.split("/"));
  mkdirSync(dirname(destDir), { recursive: true });
  renameSync(join(unpackDir, "package"), destDir);
  rmSync(unpackDir, { recursive: true, force: true });
}

function createProjectRequire(projectDir) {
  return createRequire(join(projectDir, "entry.ts"));
}

describe("packed package import surfaces", () => {
  let outDir;
  let projectDir;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), "supi-pack-test-"));
    projectDir = mkdtempSync(join(tmpdir(), "supi-import-test-"));
  });

  afterEach(() => {
    if (outDir) rmSync(outDir, { recursive: true, force: true });
    if (projectDir) rmSync(projectDir, { recursive: true, force: true });
  });

  it("resolves explicit /api and /extension subpaths for a standalone package and blocks root/deep imports", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    const lspPackage = `${SUPI_SCOPE}supi-lsp`;
    const tarball = await packStaged("packages/supi-lsp", { outDir });
    unpackPackage(tarball, lspPackage, projectDir);

    const projectRequire = createProjectRequire(projectDir);
    const deepPath = `${lspPackage}/src/lsp.ts`;

    expect(() => projectRequire.resolve(`${lspPackage}/api`)).not.toThrow();
    expect(() => projectRequire.resolve(`${lspPackage}/extension`)).not.toThrow();
    expect(() => projectRequire.resolve(lspPackage)).toThrow();
    expect(() => projectRequire.resolve(deepPath)).toThrow();
  });

  it("resolves explicit /api and /extension subpaths for library-only and aggregated packages", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    const corePackage = `${SUPI_SCOPE}supi-core`;
    const webPackage = `${SUPI_SCOPE}supi-web`;
    const metaPackage = `${SUPI_SCOPE}supi`;
    const cases = [
      ["packages/supi-core", corePackage],
      ["packages/supi-web", webPackage],
      ["packages/supi", metaPackage],
    ];

    for (const [packageDir, packageName] of cases) {
      const tarball = await packStaged(packageDir, { outDir });
      unpackPackage(tarball, packageName, projectDir);
    }

    const projectRequire = createProjectRequire(projectDir);

    expect(() => projectRequire.resolve(`${corePackage}/api`)).not.toThrow();
    expect(() => projectRequire.resolve(`${corePackage}/extension`)).not.toThrow();
    expect(() => projectRequire.resolve(`${webPackage}/api`)).not.toThrow();
    expect(() => projectRequire.resolve(`${webPackage}/extension`)).not.toThrow();
    expect(() => projectRequire.resolve(`${metaPackage}/api`)).not.toThrow();
    expect(() => projectRequire.resolve(`${metaPackage}/extension`)).not.toThrow();
  });
});
