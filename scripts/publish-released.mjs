#!/usr/bin/env node
import { execFileSync } from "node:child_process";
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

/** Let npm resolve SemVer ranges; only E404 means no matching published version. */
function registryVersions(spec) {
  let output;
  try {
    output = execFileSync("npm", ["view", spec, "version", "--json"], {
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch (error) {
    let code;
    try {
      code = JSON.parse(error.stdout).error?.code;
    } catch {
      // Network/authentication/invalid responses must not authorize a publish or latest update.
    }
    if (code === "E404") return [];
    throw error;
  }
  const versions = JSON.parse(output);
  if (typeof versions === "string") return [versions];
  if (Array.isArray(versions) && versions.every((version) => typeof version === "string"))
    return versions;
  throw new Error(`Invalid registry versions response for ${spec}`);
}

async function publishAll() {
  for (const path of sorted) {
    const pkg = pkgMap.get(path);
    const { name, version } = pkg;

    // Idempotent skip — handles retries without failing.
    if (registryVersions(`${name}@${version}`).includes(version)) {
      console.log(`${name}@${version} already published — skipping`);
      continue;
    }
    // Publication is serialized across versions in CI. Older recovery and prereleases must
    // not regress the shared latest dist-tag or hit npm's implicit-latest version guard.
    const prerelease = version.split("+")[0].includes("-");
    const tag =
      prerelease || registryVersions(`${name}@>${version}`).length > 0
        ? `release-${version}`
        : "latest";

    console.log(`Packing ${name}@${version} from staged copy ...`);
    const tarballPath = await packStaged(resolve(path), { outDir: tarballDir });

    console.log(`Publishing ${name}@${version} from ${tarballPath} ...`);
    execFileSync(
      "npm",
      ["publish", tarballPath, "--access", "public", "--provenance", "--tag", tag],
      {
        stdio: "inherit",
      },
    );
  }
}

try {
  await publishAll();
} finally {
  rmSync(tarballDir, { recursive: true, force: true });
}
