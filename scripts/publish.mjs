#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { packStaged } from "./pack-staged.mjs";
import { verifyTarball } from "./verify-tarball.mjs";

function parseArgs(argv) {
  const args = {
    publish: false,
    packageDir: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--publish") {
      args.publish = true;
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
    throw new Error("Usage: node scripts/publish.mjs <package-dir> [--publish]");
  }

  return args;
}

/**
 * Validate a resolved package directory path:
 * - Must exist
 * - Must contain a package.json
 * - Must not be a system or temporary directory
 */
function validatePackageDir(packageDir) {
  const packageJsonPath = join(packageDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(`No package.json found in ${packageDir}`);
  }
  // Guard against path traversal: reject system directories
  // to prevent operating on unexpected locations.
  if (packageDir === "/" || packageDir.startsWith("/etc") || packageDir.startsWith("/tmp") || packageDir.startsWith("/dev")) {
    throw new Error(`Refusing to operate on system directory: ${packageDir}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  validatePackageDir(args.packageDir);

  // Ensure output dir exists (packStaged requires it)
  const outDir = join(tmpdir(), "supi-publish");
  mkdirSync(outDir, { recursive: true });

  const tarballPath = packStaged(args.packageDir, { outDir });
  console.log(`Packed: ${tarballPath}`);

  verifyTarball(tarballPath);
  console.log("Verified: OK");

  if (args.publish) {
    execFileSync("npm", ["publish", tarballPath], { stdio: "inherit" });
    console.log("Published.");
  } else {
    console.log("Ready to publish.");
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
