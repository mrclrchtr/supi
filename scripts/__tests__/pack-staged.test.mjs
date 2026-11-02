import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    expect(verifyTarball(tarball)).toBe(true);
    const notes = execFileSync("tar", ["-xOf", tarball, "package/CHANGELOG.md"], {
      encoding: "utf8",
    });
    expect(notes).toBe(readFileSync("packages/supi-ask-user/CHANGELOG.md", "utf8"));
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
    expect(verifyTarball(tarball, { release: true })).toBe(true);
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
