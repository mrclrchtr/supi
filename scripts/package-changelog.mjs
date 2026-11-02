import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

const VERSION = "(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)";
const HEADING = new RegExp(`^## (?:\\[(${VERSION})\\]|(${VERSION}))$`);

function numericVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) throw new Error(`Invalid package version: ${version}`);
  const parts = match.slice(1).map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error(`Invalid package version: ${version}`);
  return parts;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function readEntries(content, path) {
  const entries = [];
  let current;
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      const match = HEADING.exec(line.trimEnd());
      if (!match) throw new Error(`${path}: invalid version heading: ${line}`);
      const version = match[1] ?? match[2];
      current = { version, parts: numericVersion(version), lines: [] };
      entries.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (entries.length === 0) throw new Error(`${path}: expected at least one versioned entry`);
  validateEntries(entries, path);
  return entries;
}

function validateEntries(entries, path) {
  const seen = new Set();
  let previous;
  for (const entry of entries) {
    const body = entry.lines.join("\n").replace(/<!--[\s\S]*?-->/g, "");
    if (!body.split("\n").some((line) => line.trim() && !/^#{1,6}\s/.test(line))) {
      throw new Error(`${path}: empty entry for ${entry.version}`);
    }
    if (seen.has(entry.version)) throw new Error(`${path}: duplicate version ${entry.version}`);
    if (previous && compareVersions(previous, entry.parts) <= 0) {
      throw new Error(`${path}: versions must be in descending order`);
    }
    seen.add(entry.version);
    previous = entry.parts;
  }
}

/**
 * Validate a public Extension Package's own, regular CHANGELOG.md; other packages are exempt.
 * Development may prepare future entries. Notes use numeric release headings because Pi compares
 * numeric version cores only. A prerelease cannot publish notes for its not-yet-released stable core.
 */
export function validatePackageChangelog(packageDir, manifest, { release = false } = {}) {
  if (
    manifest.private === true ||
    !Array.isArray(manifest.pi?.extensions) ||
    !manifest.pi.extensions.length
  ) {
    return;
  }
  const path = join(packageDir, "CHANGELOG.md");
  if (manifest.pi.changelogPath !== undefined) {
    throw new Error(`${path}: use Pi's default changelog path, without pi.changelogPath`);
  }
  let content;
  try {
    if (!lstatSync(path).isFile()) throw new Error("not a regular file");
    content = readFileSync(path, "utf8");
  } catch (cause) {
    throw new Error(`${path}: expected a readable regular file; actual ${cause.message}`, {
      cause,
    });
  }
  const entries = readEntries(content, path);
  if (!release) return;
  const comparison = compareVersions(entries[0].parts, numericVersion(manifest.version));
  const prerelease = manifest.version.split("+")[0].includes("-");
  if (comparison > 0 || (comparison === 0 && prerelease)) {
    throw new Error(
      `${path}: version ${entries[0].version} is newer than package version ${manifest.version}`,
    );
  }
}
