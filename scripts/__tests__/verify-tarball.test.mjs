import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { verifyTarball } from "../verify-tarball.mjs";

const TARBALL_DIR = mkdtempSync(join(tmpdir(), "supi-verify-test-"));

afterAll(() => {
  rmSync(TARBALL_DIR, { recursive: true, force: true });
});

/**
 * Create a temporary .tgz with the given package.json content at the given
 * manifest path (e.g. "package/package.json" or
 * "package/node_modules/@scope/pkg/package.json").
 *
 * The manifestPath is relative to the tarball root (must start with package/).
 */
function createTarball(packageJson, manifestPath = "package/package.json") {
  const tmp = mkdtempSync(join(tmpdir(), "supi-verify-fixture-"));

  // Ensure parent directory exists
  const fullPath = join(tmp, manifestPath);
  mkdirSync(dirname(fullPath), { recursive: true });

  // Write the package.json
  writeFileSync(fullPath, JSON.stringify(packageJson), "utf-8");

  // Create the tarball
  const tarballPath = join(
    TARBALL_DIR,
    `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tgz`,
  );
  execFileSync("tar", ["-czf", tarballPath, "-C", tmp, "package"]);

  rmSync(tmp, { recursive: true, force: true });
  return tarballPath;
}

function createCleanTarball() {
  return createTarball({
    name: "test-pkg",
    version: "1.0.0",
    dependencies: { lodash: "^4.17.21" },
  });
}

function createDirtyTarball() {
  return createTarball({
    name: "test-pkg",
    version: "1.0.0",
    dependencies: { "@scope/core": "workspace:*" },
  });
}

function createDirtyNestedTarball() {
  return createTarball(
    {
      name: "@scope/leaf",
      version: "1.0.0",
      dependencies: { foo: "workspace:*" },
    },
    "package/node_modules/@scope/leaf/package.json",
  );
}

function createDirtyParentPlusNestedTarball() {
  const tmp = mkdtempSync(join(tmpdir(), "supi-verify-fixture-"));

  // Root manifest (clean)
  mkdirSync(join(tmp, "package", "node_modules", "@scope", "child"), {
    recursive: true,
  });
  writeFileSync(
    join(tmp, "package", "package.json"),
    JSON.stringify({ name: "parent", version: "1.0.0" }),
    "utf-8",
  );

  // Nested manifest (dirty)
  writeFileSync(
    join(tmp, "package", "node_modules", "@scope", "child", "package.json"),
    JSON.stringify({
      name: "@scope/child",
      version: "1.0.0",
      dependencies: { core: "workspace:*" },
    }),
    "utf-8",
  );

  const tarballPath = join(
    TARBALL_DIR,
    `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tgz`,
  );
  execFileSync("tar", ["-czf", tarballPath, "-C", tmp, "package"]);
  rmSync(tmp, { recursive: true, force: true });
  return tarballPath;
}

describe("verifyTarball workspace protocol check", () => {
  it("passes a clean tarball without workspace: protocol", () => {
    const tarball = createCleanTarball();
    expect(verifyTarball(tarball)).toBe(true);
  });

  it("throws when root package.json contains workspace:*", () => {
    const tarball = createDirtyTarball();
    expect(() => verifyTarball(tarball)).toThrow(/workspace|dirty|package\.json/i);
  });

  it("throws when nested bundled package.json contains workspace:*", () => {
    const tarball = createDirtyNestedTarball();
    expect(() => verifyTarball(tarball)).toThrow(/workspace|\/package\.json/i);
  });

  it("throws when root is clean but nested bundled package.json contains workspace:*", () => {
    const tarball = createDirtyParentPlusNestedTarball();
    expect(() => verifyTarball(tarball)).toThrow(/workspace|\/package\.json|@scope\/child/i);
  });
});
