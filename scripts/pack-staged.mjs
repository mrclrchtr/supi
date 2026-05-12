#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  const packageJsonPath = join(packageDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(`No package.json found in ${packageDir}`);
  }

  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (!pkg.name) {
    throw new Error(`Package at ${packageDir} is missing a name`);
  }

  return pkg;
}

export function packStaged(packageDir, options = {}) {
  const dryRun = options.dryRun ?? false;
  const outDir = resolve(options.outDir ?? process.cwd());
  const pkg = assertPackageDir(packageDir);
  const stageRoot = mkdtempSync(join(tmpdir(), "supi-pack-"));
  const stageDir = join(stageRoot, basename(packageDir));

  try {
    mkdirSync(stageDir, { recursive: true });
    execFileSync("cp", ["-RL", `${packageDir}/.`, stageDir]);

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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const tarballPath = packStaged(args.packageDir, {
    dryRun: args.dryRun,
    outDir: args.outDir,
  });

  if (tarballPath) {
    console.log(tarballPath);
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
