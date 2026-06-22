#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { rewriteStagedManifests } from "./staged-manifests.mjs";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    outDir: process.cwd(),
    packageDir: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--out-dir") {
      index += 1;
      if (index >= argv.length) {
        throw new Error("Missing value for --out-dir");
      }
      args.outDir = resolve(argv[index]);
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (args.packageDir) {
      throw new Error("Only one package directory may be provided");
    }
    args.packageDir = resolve(arg);
  }

  if (!args.packageDir) {
    throw new Error(
      "Usage: node scripts/pack-staged.mjs <package-dir> [--dry-run] [--out-dir <dir>]",
    );
  }

  return args;
}

function assertPackageDir(packageDir) {
  const resolvedDir = resolve(packageDir);

  // Guard against path traversal: reject system directories and check
  // that the resolved path doesn't escape via normalization tricks.
  if (
    resolvedDir === "/" ||
    resolvedDir.startsWith("/etc") ||
    resolvedDir.startsWith("/tmp") ||
    resolvedDir.startsWith("/dev")
  ) {
    throw new Error(`Refusing to operate on system directory: ${resolvedDir}`);
  }

  const packageJsonPath = join(resolvedDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(`No package.json found in ${resolvedDir}`);
  }

  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (!pkg.name) {
    throw new Error(`Package at ${resolvedDir} is missing a name`);
  }

  return pkg;
}

/**
 * Remove broken symlinks that would cause cp -RL to fail.
 * pnpm's hoisted linker creates dangling .bin entries (e.g.,
 * node_modules/.bin/vitest). Use find -L to follow workspace
 * symlinks and remove any broken symlinks before the copy.
 */
function removeKnownBrokenSymlinks(packageDir) {
  try {
    execFileSync(
      "find",
      ["-L", packageDir, "-type", "l", "!", "-exec", "test", "-e", "{}", ";", "-delete"],
      { stdio: "ignore" },
    );
  } catch {
    // find exits non-zero when any directory is inaccessible (harmless)
  }
}

/**
 * Remove @mrclrchtr symlinks that would create cp -RL cycles.
 *
 * pnpm hoists transitive workspace packages into a package's
 * node_modules/@mrclrchtr/. When A bundles B and B's node_modules
 * contains a hoisted symlink back to A, cp -RL follows the symlink
 * chain into B then back to A — a cycle.
 *
 * This happens in two flavors:
 * 1. devDependency symlinks: supi-X appears as a devDep of supi-Y,
 *    and supi-Y bundles supi-X. cp -RL copies supi-Y which contains
 *    supi-X as a devDep symlink, which leads back.
 * 2. hoisting artifacts: pnpm places supi-X in supi-Y's node_modules
 *    even though supi-Y never declared it as a dependency. These
 *    stray symlinks also create cycles when the hoisted package
 *    bundles the current package.
 *
 * The function recurses into remaining @mrclrchtr dependencies to
 * clean nested symlinks at every level, breaking all transitive
 * cycles. Both devDependencies and hoisted non-dependency symlinks
 * are safe to remove: devDeps are never shipped, and hoisted
 * non-dependency packages are pnpm artifacts that would not appear
 * in the published tarball.
 */
function removeCyclicSymlinks(packageDir) {
  const visited = new Set();

  function removeMrclrchtrSymlink(dir, depName) {
    const symlinkPath = join(dir, "node_modules", ...depName.split("/"));
    let stat;
    try {
      stat = lstatSync(symlinkPath);
    } catch {
      return; // Symlink doesn't exist — nothing to remove
    }
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      rmSync(symlinkPath, { recursive: true, force: true });
    }
  }

  /**
   * Remove @mrclrchtr symlinks from node_modules that should not
   * be copied into the staged tree:
   * - devDependencies (never shipped)
   * - packages not declared in dependencies or devDependencies
   *   (pnpm hoisting artifacts that create cp -RL cycles)
   */
  function removeNonProductionMrclrchtrSymlinks(dir, pkg) {
    const declared = new Set([
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
    ]);
    const mrclrchtrDir = join(dir, "node_modules", "@mrclrchtr");
    let entries;
    try {
      entries = readdirSync(mrclrchtrDir, { withFileTypes: true });
    } catch {
      return; // Directory doesn't exist — nothing to clean
    }

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const depName = `@mrclrchtr/${entry.name}`;
      if (!declared.has(depName)) {
        // Not a declared dependency — hoisted artifact. Remove it.
        removeMrclrchtrSymlink(dir, depName);
      } else if (Object.keys(pkg.devDependencies || {}).includes(depName)) {
        // Declared devDependency — safe to remove; not shipped.
        removeMrclrchtrSymlink(dir, depName);
      }
    }
  }

  /**
   * Recurse into remaining @mrclrchtr dependencies to clean their
   * nested symlinks as well.
   */
  function recurseIntoMrclrchtrDeps(dir) {
    const mrclrchtrDir = join(dir, "node_modules", "@mrclrchtr");
    let entries;
    try {
      entries = readdirSync(mrclrchtrDir, { withFileTypes: true });
    } catch {
      return; // Directory doesn't exist — nothing to recurse into
    }

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      cleanDir(join(mrclrchtrDir, entry.name));
    }
  }

  function cleanDir(dir) {
    // Resolve the real path so shared workspace symlinks are deduplicated
    let realDir;
    try {
      realDir = realpathSync(dir);
    } catch {
      return; // Broken symlink — nothing to clean
    }
    if (visited.has(realDir)) return;
    visited.add(realDir);

    const pkgPath = join(dir, "package.json");
    if (!existsSync(pkgPath)) return;

    let pkg;
    try {
      pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    } catch {
      return;
    }

    removeNonProductionMrclrchtrSymlinks(dir, pkg);
    recurseIntoMrclrchtrDeps(dir);
  }

  cleanDir(packageDir);
}

function copyPackageTree(sourceDir, destDir) {
  removeKnownBrokenSymlinks(sourceDir);
  removeCyclicSymlinks(sourceDir);
  execFileSync("cp", ["-RL", `${sourceDir}/.`, destDir]);
}

function stageWorkspacePackage(packageDir, stageDir) {
  copyPackageTree(packageDir, stageDir);
}

/**
 * Resolve a bundled dependency name (e.g. "vscode-languageserver-protocol"
 * or "@mrclrchtr/supi-core") to the real absolute path in the workspace
 * root node_modules. Returns null when the package is not installed.
 */
function resolveBundledDepPath(depName) {
  const rootNm = resolve("node_modules");
  const candidate = join(rootNm, ...depName.split("/"));

  // For workspace packages the root node_modules entry is a symlink
  // pointing into packages/<pkg>. Follow it to the real source so
  // cp -RL dereferences the full package tree.
  if (existsSync(candidate)) {
    return candidate;
  }

  return null;
}

/**
 * Ensure a single bundled dependency is present in the staged tree.
 * Copies it from the workspace root node_modules when missing, then
 * returns its local path for recursive enqueueing.
 */
function ensureBundledDep(localNm, depName, pjPath) {
  const localPath = join(localNm, ...depName.split("/"));

  if (!existsSync(localPath)) {
    const sourcePath = resolveBundledDepPath(depName);
    if (!sourcePath) {
      console.warn(
        `Bundled dependency "${depName}" declared in ${pjPath} not found in workspace root — skipping`,
      );
      return null;
    }
    if (depName.startsWith("@mrclrchtr/")) {
      copyPackageTree(sourcePath, localPath);
    } else {
      execFileSync("cp", ["-RL", `${sourcePath}/.`, localPath]);
    }
  }

  return localPath;
}

/**
 * Recursively ensure every bundledDependency declared in a
 * package.json inside the staging tree is physically present.
 *
 * pnpm may hoist a dependency to the workspace root without creating
 * a local node_modules symlink for it.  cp -RL only copies what is
 * inside the package directory, so those hoisted deps are missing
 * from the staged copy.  We resolve them from the root node_modules
 * and copy them into place so npm pack can include them.
 */
function copyMissingBundledDeps(stageDir) {
  const queue = [stageDir];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    const pjPath = join(currentDir, "package.json");
    if (!existsSync(pjPath)) continue;

    let pkgJson;
    try {
      pkgJson = JSON.parse(readFileSync(pjPath, "utf8"));
    } catch {
      continue;
    }

    const bundled = pkgJson.bundledDependencies;
    if (!Array.isArray(bundled) || bundled.length === 0) continue;

    const localNm = join(currentDir, "node_modules");
    mkdirSync(localNm, { recursive: true });

    for (const depName of bundled) {
      const depPath = ensureBundledDep(localNm, depName, pjPath);
      if (depPath) {
        queue.push(depPath);
      }
    }
  }
}

export async function packStaged(packageDir, options = {}) {
  const dryRun = options.dryRun ?? false;
  const outDir = resolve(options.outDir ?? process.cwd());
  const pkg = assertPackageDir(packageDir);
  const stageRoot = mkdtempSync(join(tmpdir(), "supi-pack-"));
  const stageDir = join(stageRoot, basename(packageDir));

  try {
    mkdirSync(stageDir, { recursive: true });

    // cp -RL dereferences symlinks (needed for pnpm workspace symlinks) but
    // fails on broken symlinks created by pnpm's hoisted linker. Remove
    // broken symlinks before the copy so cp -RL succeeds.
    stageWorkspacePackage(packageDir, stageDir);

    // Resolve any bundledDependencies that pnpm hoisted to the workspace
    // root without creating local node_modules symlinks.
    copyMissingBundledDeps(stageDir);

    // Rewrite staged manifests to npm-compatible publish manifests
    await rewriteStagedManifests(stageDir);

    if (dryRun) {
      console.log(`Staged pack dry-run: ${pkg.name} (${packageDir})`);
      execFileSync("npm", ["pack", "--dry-run"], { cwd: stageDir, stdio: "inherit" });
      return null;
    }

    const output = execFileSync("npm", ["pack", "--json", "--pack-destination", outDir], {
      cwd: stageDir,
      encoding: "utf8",
    });
    const result = JSON.parse(output);
    if (!Array.isArray(result) || result.length === 0 || !result[0]?.filename) {
      throw new Error(`Unexpected npm pack output for ${pkg.name}: ${output}`);
    }

    return join(outDir, result[0].filename);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tarballPath = await packStaged(args.packageDir, {
    dryRun: args.dryRun,
    outDir: args.outDir,
  });

  if (tarballPath) {
    console.log(tarballPath);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
