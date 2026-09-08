#!/usr/bin/env node
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { packStaged } from "./pack-staged.mjs";
import { validateReleaseCheckout } from "./release-validation.mjs";

// Validate the complete release before any registry check, pack, or publish.
const pkgMap = validateReleaseCheckout();

// Build reverse-dependency graph and in-degree map.
const graph = new Map();
const inDegree = new Map();

for (const path of pkgMap.keys()) {
  graph.set(path, []);
  inDegree.set(path, 0);
}

for (const [path, pkg] of pkgMap) {
  const deps = {
    ...pkg.dependencies,
    ...pkg.peerDependencies,
    ...pkg.optionalDependencies,
  };
  for (const [depName, depSpec] of Object.entries(deps)) {
    if (!depSpec.startsWith("workspace:")) continue;
    for (const [otherPath, otherPkg] of pkgMap) {
      if (otherPkg.name === depName) {
        inDegree.set(path, inDegree.get(path) + 1);
        graph.get(otherPath).push(path);
        break;
      }
    }
  }
}

// Kahn's algorithm.
const queue = [];
for (const [path, degree] of inDegree) {
  if (degree === 0) queue.push(path);
}

const sorted = [];
while (queue.length > 0) {
  const path = queue.shift();
  sorted.push(path);
  for (const dependent of graph.get(path)) {
    inDegree.set(dependent, inDegree.get(dependent) - 1);
    if (inDegree.get(dependent) === 0) {
      queue.push(dependent);
    }
  }
}

if (sorted.length !== pkgMap.size) {
  console.error("Cycle detected in workspace dependencies among released packages.");
  process.exit(1);
}

const tarballDir = mkdtempSync(join(tmpdir(), "supi-publish-"));

async function publishAll() {
  for (const path of sorted) {
    const pkg = pkgMap.get(path);
    const { name, version } = pkg;

    // Idempotent skip — handles retries without failing.
    try {
      execSync(`npm view "${name}@${version}" version`, { stdio: "pipe" });
      console.log(`${name}@${version} already published — skipping`);
      continue;
    } catch {
      // Not published yet; proceed.
    }

    console.log(`Packing ${name}@${version} from staged copy ...`);
    const tarballPath = await packStaged(resolve(path), { outDir: tarballDir });

    console.log(`Publishing ${name}@${version} from ${tarballPath} ...`);
    execSync(`npm publish "${tarballPath}" --access public --provenance`, {
      stdio: "inherit",
    });
  }
}

try {
  await publishAll();
} finally {
  rmSync(tarballDir, { recursive: true, force: true });
}
