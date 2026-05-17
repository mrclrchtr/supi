#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
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
      [
        "-L",
        packageDir,
        "-type",
        "l",
        "!",
        "-exec",
        "test",
        "-e",
        "{}",
        ";",
        "-exec",
        "rm",
        "{}",
        ";",
      ],
      { stdio: "ignore" },
    );
  } catch {
    // find exits non-zero when any directory is inaccessible (harmless)
  }
}

function stageWorkspacePackage(packageDir, stageDir) {
  removeKnownBrokenSymlinks(packageDir);
  execFileSync("cp", ["-RL", `${packageDir}/.`, stageDir]);
}

function stageMetaPackageSource(packageDir, stageDir) {
  for (const entry of readdirSync(packageDir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    cpSync(join(packageDir, entry.name), join(stageDir, entry.name), {
      recursive: true,
      dereference: true,
      force: true,
    });
  }
}

function collectWorkspacePackages(packageDir) {
  const packagesDir = dirname(packageDir);
  const map = new Map();

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(packagesDir, entry.name);
    const manifestPath = join(dir, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (typeof manifest.name === "string") {
      map.set(manifest.name, { dir, manifest });
    }
  }

  return map;
}

function resolveWorkspaceSpec(spec, version) {
  if (spec === "workspace:*") return version;
  if (spec === "workspace:^") return `^${version}`;
  if (spec === "workspace:~") return `~${version}`;
  if (spec.startsWith("workspace:")) return spec.slice("workspace:".length);
  return spec;
}

function rewriteMetaRootManifest(stageDir, workspacePackages) {
  const manifestPath = join(stageDir, "package.json");
  const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));

  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    const deps = pkg[field];
    if (!deps || typeof deps !== "object") continue;
    for (const [depName, depSpec] of Object.entries(deps)) {
      if (typeof depSpec !== "string" || !depSpec.startsWith("workspace:")) continue;
      const workspacePkg = workspacePackages.get(depName);
      if (!workspacePkg) {
        throw new Error(`Unable to resolve workspace dependency for meta-package: ${depName}`);
      }
      deps[depName] = resolveWorkspaceSpec(depSpec, workspacePkg.manifest.version);
    }
  }

  delete pkg.devDependencies;
  if (pkg.bundledDependencies && !pkg.bundleDependencies) {
    pkg.bundleDependencies = pkg.bundledDependencies;
  }

  writeFileSync(manifestPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

async function installMetaPackageBundles(stageDir, workspacePackages, bundledDependencies) {
  if (!Array.isArray(bundledDependencies) || bundledDependencies.length === 0) return;

  const tarballDir = mkdtempSync(join(tmpdir(), "supi-meta-bundles-"));

  try {
    for (const depName of bundledDependencies) {
      const workspacePkg = workspacePackages.get(depName);
      if (!workspacePkg) {
        throw new Error(`Unable to resolve bundled workspace package: ${depName}`);
      }

      const tarball = await packStaged(workspacePkg.dir, { outDir: tarballDir });
      const unpackDir = mkdtempSync(join(tmpdir(), "supi-meta-unpack-"));
      const destDir = join(stageDir, "node_modules", ...depName.split("/"));

      try {
        execFileSync("tar", ["-xzf", tarball, "-C", unpackDir]);
        mkdirSync(dirname(destDir), { recursive: true });
        rmSync(destDir, { recursive: true, force: true });
        cpSync(join(unpackDir, "package"), destDir, {
          recursive: true,
          dereference: true,
          force: true,
        });
      } finally {
        rmSync(unpackDir, { recursive: true, force: true });
      }
    }
  } finally {
    rmSync(tarballDir, { recursive: true, force: true });
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

    if (pkg.name === "@mrclrchtr/supi") {
      const workspacePackages = collectWorkspacePackages(packageDir);
      stageMetaPackageSource(packageDir, stageDir);
      rewriteMetaRootManifest(stageDir, workspacePackages);
      await installMetaPackageBundles(stageDir, workspacePackages, pkg.bundledDependencies);
    } else {
      // cp -RL dereferences symlinks (needed for pnpm workspace symlinks) but
      // fails on broken symlinks created by pnpm's hoisted linker. Remove
      // broken symlinks before the copy so cp -RL succeeds.
      stageWorkspacePackage(packageDir, stageDir);

      // Rewrite staged manifests to npm-compatible publish manifests
      await rewriteStagedManifests(stageDir);
    }

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
