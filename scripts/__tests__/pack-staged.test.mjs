import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeNestedPackageFixture } from "./helpers/pack-fixture.mjs";

// pack-staged runs npm pack which is slow
const SLOW_TIMEOUT = 120_000;

import { packStaged } from "../pack-staged.mjs";
import { verifyTarball } from "../verify-tarball.mjs";

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

// Packing a workspace package copies its bundled dependencies and runs npm pack, which takes
// seconds. Tests only read the tarballs, so each package is packed at most once per file.
const sharedOutDir = mkdtempSync(join(tmpdir(), "supi-pack-shared-"));
const packedWorkspacePackages = new Map();
afterAll(() => {
  rmSync(sharedOutDir, { recursive: true, force: true });
});

function packWorkspacePackage(packageDir) {
  if (!packedWorkspacePackages.has(packageDir)) {
    const outDir = mkdtempSync(join(sharedOutDir, "pack-"));
    packedWorkspacePackages.set(packageDir, packStaged(packageDir, { outDir }));
  }
  return packedWorkspacePackages.get(packageDir);
}

/** Install a tarball into an empty project and return a resolver as seen from that project. */
function installForResolution(tarballPath, packageName, projectDir) {
  const unpackDir = mkdtempSync(join(projectDir, "unpack-"));
  execFileSync("tar", ["-xzf", tarballPath, "-C", unpackDir]);
  const destDir = join(projectDir, "node_modules", ...packageName.split("/"));
  mkdirSync(dirname(destDir), { recursive: true });
  renameSync(join(unpackDir, "package"), destDir);
  return createRequire(join(projectDir, "entry.ts"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function makeChangelogTarball(parentDir, content, fields = {}) {
  const packageDir = join(parentDir, "package");
  mkdirSync(packageDir, { recursive: true });
  writeJson(join(packageDir, "package.json"), {
    name: "extension-fixture",
    version: "1.0.0",
    pi: { extensions: ["./src/extension.ts"] },
    ...fields,
  });
  if (content !== undefined) writeFileSync(join(packageDir, "CHANGELOG.md"), content);
  const archive = join(parentDir, "extension.tgz");
  execFileSync("tar", ["-czf", archive, "-C", parentDir, "package"]);
  return archive;
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
  "./git": "./src/git.ts",
  "./llm": "./src/llm.ts",
  "./model-selection": "./src/model-selection.ts",
  "./package.json": "./package.json",
  "./path": "./src/path.ts",
  "./report": "./src/report.ts",
  "./retired-packages": "./src/retired-packages.ts",
  "./project": "./src/project.ts",
  "./prompt-surface": "./src/prompt-surface.ts",
  "./session": "./src/session.ts",
  "./settings": "./src/settings.ts",
  "./spill": "./src/spill.ts",
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
  let outDir = null;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), "supi-test-"));
  });

  afterEach(() => {
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  it("rejects an Extension Package tarball without its own changelog", () => {
    expect(() => verifyTarball(makeChangelogTarball(outDir))).toThrow(/CHANGELOG\.md/);
  });

  it("allows prepared notes while packing but rejects them for publication", () => {
    const archive = makeChangelogTarball(outDir, "## [1.1.0]\n\n- Upcoming improvement.\n");
    expect(verifyTarball(archive)).toBe(true);
    expect(() => verifyTarball(archive, { release: true })).toThrow(
      "version 1.1.0 is newer than package version 1.0.0",
    );
  });

  it.each([
    ["no entries", "# Changelog\n", "at least one versioned entry"],
    ["empty entry", "## [1.0.0]\n\n### Fixes\n<!-- pending -->\n", "empty entry"],
    ["invalid heading", "## Unreleased\n\n- A fix.\n", "invalid version heading"],
    ["partial version", "## [1.0]\n\n- A fix.\n", "invalid version heading"],
    ["leading zero", "## [01.0.0]\n\n- A fix.\n", "invalid version heading"],
    [
      "duplicate version",
      "## [1.0.0]\n\n- A fix.\n\n## [1.0.0]\n\n- Another fix.\n",
      "duplicate version",
    ],
    [
      "reversed versions",
      "## [1.0.0]\n\n- A fix.\n\n## [2.0.0]\n\n- Another fix.\n",
      "descending order",
    ],
  ])("rejects a shipped changelog with %s", (_name, content, error) => {
    expect(() => verifyTarball(makeChangelogTarball(outDir, content))).toThrow(error);
  });

  it("does not publish stable-version notes in an earlier prerelease of the same version", () => {
    const archive = makeChangelogTarball(outDir, "## [1.0.0]\n\n- Stable behavior.\n", {
      version: "1.0.0-rc.1+build.2",
    });
    expect(verifyTarball(archive)).toBe(true);
    expect(() => verifyTarball(archive, { release: true })).toThrow(
      "newer than package version 1.0.0-rc.1+build.2",
    );
  });

  it("retains skipped-release history and accepts an unchanged package's older last entry", () => {
    const archive = makeChangelogTarball(
      outDir,
      "# Changelog\r\n\r\n## [1.0.0]\r\n\r\n- A fix.\r\n\r\n## 0.9.0\r\n\r\n- Earlier behavior.\r\n",
      { version: "1.2.0" },
    );
    expect(verifyTarball(archive, { release: true })).toBe(true);
  });

  it("rejects a changelog symlink even when its target is inside the package", () => {
    makeChangelogTarball(outDir);
    writeFileSync(join(outDir, "package", "notes.md"), "## [1.0.0]\n\n- A fix.\n");
    symlinkSync("notes.md", join(outDir, "package", "CHANGELOG.md"));
    const archive = join(outDir, "extension.tgz");
    execFileSync("tar", ["-czf", archive, "-C", outDir, "package"]);
    expect(() => verifyTarball(archive)).toThrow("expected a readable regular file");
  });

  it("removes dangling bin symlinks before copying the package tree", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    const packageDir = makePackageWithBrokenBinLink(outDir);

    const tarball = await packStaged(packageDir, { outDir });

    const entries = listTarballEntries(tarball);
    expect(entries).toContain("package/src/index.js");
  });

  it("rewrites LSP root and bundled manifests and preserves bundled dependencies", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    const tarball = await packWorkspacePackage("packages/supi-lsp");

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
    const tarball = await packStaged(makeNestedPackageFixture(outDir), { outDir });
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
    const tarball = await packWorkspacePackage("packages/supi-ask-user");

    const pkg = extractJson(tarball, "package/package.json");
    const entries = listTarballEntries(tarball);
    expectExplicitSurface(pkg, entries);
    expect(verifyTarball(tarball)).toBe(true);
    const notes = execFileSync("tar", ["-xOf", tarball, "package/CHANGELOG.md"], {
      encoding: "utf8",
    });
    expect(notes).toBe(readFileSync("packages/supi-ask-user/CHANGELOG.md", "utf8"));
  });

  it("publishes library-only surface for packages/supi-core", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    const tarball = await packWorkspacePackage("packages/supi-core");

    const pkg = extractJson(tarball, "package/package.json");
    const entries = listTarballEntries(tarball);

    // supi-core is library-only — no pi key, no ./extension export
    expect(pkg.main).toBe("src/api.ts");
    expect(pkg.exports).toEqual(CORE_EXPORTS);
    expect(pkg.pi).toBeUndefined();
    expect(entries).toContain("package/src/api.ts");
    expect(entries).toContain("package/src/tui.ts");
    expect(entries).not.toContain("package/src/extension.ts");
    expect(verifyTarball(tarball, { release: true })).toBe(true);
  });

  it("publishes explicit api and extension subpaths for packages/supi-web", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    const tarball = await packWorkspacePackage("packages/supi-web");

    const pkg = extractJson(tarball, "package/package.json");
    const entries = listTarballEntries(tarball);
    expectExplicitSurface(pkg, entries);
  });

  it("publishes explicit api and extension subpaths for packages/supi-settings", {
    timeout: SLOW_TIMEOUT,
  }, async () => {
    const tarball = await packWorkspacePackage("packages/supi-settings");

    const pkg = extractJson(tarball, "package/package.json");
    const entries = listTarballEntries(tarball);
    expectExplicitSurface(pkg, entries);
  });
});

describe("packed package import surfaces", { timeout: SLOW_TIMEOUT }, () => {
  let projectDir;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "supi-import-test-"));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it.each([
    ["supi-lsp", "src/lsp.ts"],
    ["supi-core", "src/api.ts"],
  ])("resolves only the /api subpath of library package %s", async (name, deepFile) => {
    const packageName = `@mrclrchtr/${name}`;
    const tarball = await packWorkspacePackage(`packages/${name}`);
    const projectRequire = installForResolution(tarball, packageName, projectDir);

    expect(() => projectRequire.resolve(`${packageName}/api`)).not.toThrow();
    expect(() => projectRequire.resolve(`${packageName}/extension`)).toThrow();
    expect(() => projectRequire.resolve(packageName)).toThrow();
    expect(() => projectRequire.resolve(`${packageName}/${deepFile}`)).toThrow();
  });

  it("resolves explicit /api and /extension subpaths for an extension package", async () => {
    const packageName = "@mrclrchtr/supi-web";
    const tarball = await packWorkspacePackage("packages/supi-web");
    const projectRequire = installForResolution(tarball, packageName, projectDir);

    expect(() => projectRequire.resolve(`${packageName}/api`)).not.toThrow();
    expect(() => projectRequire.resolve(`${packageName}/extension`)).not.toThrow();
    expect(() => projectRequire.resolve(packageName)).toThrow();
  });
});
