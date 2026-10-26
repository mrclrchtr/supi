#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  if (argv.length !== 1) {
    throw new Error("Usage: node scripts/verify-tarball.mjs <tarball-path>");
  }
  return argv[0];
}

export function verifyTarball(tarballPath) {
  // 1. Check for ../ entries
  const listing = execFileSync("tar", ["-tzf", tarballPath], { encoding: "utf8" });
  const entries = listing.trim().split("\n").filter(Boolean);
  const badEntries = entries.filter((e) => e.includes(".."));

  if (badEntries.length > 0) {
    const msg = [
      `Tarball contains ${badEntries.length} path(s) with '..':`,
      ...badEntries.map((e) => `  ${e}`),
    ].join("\n");
    throw new Error(msg);
  }

  // 3. Check for workspace: protocol in any packed package.json
  const manifestEntries = entries.filter((e) => e.endsWith("/package.json"));
  const dirtyEntries = [];

  for (const entry of manifestEntries) {
    const content = execFileSync("tar", ["-xOf", tarballPath, entry], {
      encoding: "utf8",
    });
    if (content.includes("workspace:")) {
      dirtyEntries.push(entry);
    }
    if (JSON.parse(content).name === "@mrclrchtr/supi-code-intelligence") {
      verifyGradleArtifacts(entry.slice(0, -"package.json".length), entries);
    }
  }

  if (dirtyEntries.length > 0) {
    const msg = [
      `Tarball contains ${dirtyEntries.length} package.json with 'workspace:' protocol:`,
      ...dirtyEntries.map((e) => `  ${e}`),
    ].join("\n");
    throw new Error(msg);
  }

  // 4. Check extraction succeeds
  const extractDir = mkdtempSync(join(tmpdir(), "supi-verify-"));
  try {
    execFileSync("tar", ["-xzf", tarballPath, "-C", extractDir]);
  } catch (err) {
    throw new Error(`Tarball extraction failed: ${tarballPath}`, { cause: err });
  } finally {
    rmSync(extractDir, { recursive: true, force: true });
  }

  return true;
}

/** Check direct and transitively bundled Code Intelligence packages retain the JVM runtime assets. */
function verifyGradleArtifacts(prefix, entries) {
  for (const required of [
    "gradle-helper/lib/supi-gradle-observation.jar",
    "gradle-helper/lib/gradle-tooling-api-9.4.0.jar",
    "gradle-helper/lib/slf4j-api-2.0.17.jar",
    "gradle-helper/lib/slf4j-simple-2.0.17.jar",
    "gradle-helper/licenses/LICENSE-gradle-tooling-api.txt",
    "gradle-helper/licenses/NOTICE-gradle.txt",
    "gradle-helper/licenses/LICENSE-slf4j.txt",
    "gradle-helper/licenses/DEPENDENCIES.md",
  ]) {
    if (!entries.includes(`${prefix}${required}`)) {
      throw new Error(`Code Intelligence package is missing bundled Gradle artifact: ${required}`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    verifyTarball(args);
    console.log("OK");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main();
}
