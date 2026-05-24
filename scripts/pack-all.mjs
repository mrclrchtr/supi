#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "..");

function runPackage(pkgDir) {
  return new Promise((resolvePromise) => {
    const proc = spawn("node", ["scripts/publish.mjs", pkgDir], {
      cwd: workspaceRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => {
      stdout += d;
    });
    proc.stderr.on("data", (d) => {
      stderr += d;
    });

    proc.on("close", (code) => {
      resolvePromise({ pkgDir, code, stdout, stderr });
    });

    proc.on("error", (err) => {
      resolvePromise({ pkgDir, code: -1, stdout: "", stderr: err.message });
    });
  });
}

async function main() {
  const pkgsDir = join(workspaceRoot, "packages");
  const packages = readdirSync(pkgsDir, { withFileTypes: true })
    .filter(
      (dirent) =>
        dirent.isDirectory() &&
        dirent.name.startsWith("supi-") &&
        existsSync(join(pkgsDir, dirent.name, "package.json")),
    )
    .map((dirent) => join("packages", dirent.name));

  if (packages.length === 0) {
    console.error("No supi packages found in packages/");
    process.exit(1);
  }

  const concurrency = availableParallelism?.() ?? 4;
  const results = [];
  let index = 0;

  async function worker() {
    while (index < packages.length) {
      const pkg = packages[index++];
      results.push(await runPackage(pkg));
    }
  }

  const poolSize = Math.min(concurrency, packages.length);
  await Promise.all(Array.from({ length: poolSize }, () => worker()));

  // Sort by package name for deterministic output
  results.sort((a, b) => a.pkgDir.localeCompare(b.pkgDir));

  let failed = 0;
  for (const r of results) {
    if (r.code === 0) {
      console.log(`\u2713 ${r.pkgDir}`);
    } else {
      failed++;
      console.log(`\u2717 ${r.pkgDir} (exit ${r.code})`);
      if (r.stderr) {
        process.stderr.write(r.stderr);
      }
    }
  }

  if (failed > 0) {
    console.error(`\n${failed}/${results.length} packages failed`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} packages verified`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
