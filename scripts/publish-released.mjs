#!/usr/bin/env node
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
/**
 * Publish packages that were released by Release Please.
 *
 * Reads the `PATHS_RELEASED` env var (JSON array of paths like `"packages/foo"`).
 * Publishes in topological order of workspace dependencies, with the meta-package
 * (`packages/supi`) always last.
 */
import { packStaged } from "./pack-staged.mjs";

const pathsReleasedJson = process.env.PATHS_RELEASED;
if (!pathsReleasedJson) {
  console.log("PATHS_RELEASED not set; nothing to publish.");
  process.exit(0);
}

let pathsReleased;
try {
  pathsReleased = JSON.parse(pathsReleasedJson);
} catch {
  console.error("PATHS_RELEASED is not valid JSON:", pathsReleasedJson);
  process.exit(1);
}

if (!Array.isArray(pathsReleased) || pathsReleased.length === 0) {
  console.log("No packages to publish.");
  process.exit(0);
}

const pkgMap = new Map();
for (const path of pathsReleased) {
  const pkgJson = JSON.parse(readFileSync(`${path}/package.json`, "utf-8"));
  pkgMap.set(path, pkgJson);
}

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

// Ensure meta-package is always published last.
const metaPath = "packages/supi";
const metaIndex = sorted.indexOf(metaPath);
if (metaIndex !== -1 && metaIndex !== sorted.length - 1) {
  sorted.splice(metaIndex, 1);
  sorted.push(metaPath);
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
