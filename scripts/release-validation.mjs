import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION_CORE = "(?:0|[1-9][0-9]*)";
const PRERELEASE_ID = "(?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)";
const RELEASE_VERSION_PATTERN = new RegExp(
  `^${VERSION_CORE}\\.${VERSION_CORE}\\.${VERSION_CORE}(?:-${PRERELEASE_ID}(?:\\.${PRERELEASE_ID})*)?(?:\\+[0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*)?$`,
);

function invalidField(field, expected, actual) {
  return new Error(
    `${field}: expected ${expected}; actual ${JSON.stringify(actual) ?? "<missing>"}`,
  );
}

function readJsonObject(path) {
  let value;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    throw new Error(`${path}: expected a readable JSON object; actual ${cause.message}`, {
      cause,
    });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidField(path, "a JSON object", value);
  }
  return value;
}

function requireVersion(field, actual, expected) {
  if (actual !== expected) throw invalidField(field, JSON.stringify(expected), actual);
}

function readPublicPackage(manifestPath, releaseVersion) {
  const pkg = readJsonObject(manifestPath);
  if (pkg.private !== undefined && typeof pkg.private !== "boolean") {
    throw invalidField(`${manifestPath}#private`, "a boolean or an absent field", pkg.private);
  }
  if (pkg.private === true) return null;
  if (typeof pkg.name !== "string" || !pkg.name.trim()) {
    throw invalidField(`${manifestPath}#name`, "a non-empty package name", pkg.name);
  }
  requireVersion(`${manifestPath}#version`, pkg.version, releaseVersion);
  return pkg;
}

/**
 * Check the release identity and all public package versions before npm access.
 * RELEASE_SHA and RELEASE_VERSION must be root outputs from Release Please.
 * Read packages only from the current checkout. Never select a subset from paths_released.
 * The workflow also checks required inputs before checkout, when this script is not available.
 *
 * @returns {Map<string, object>} Validated public manifests, keyed by package path.
 */
export function validateReleaseCheckout() {
  const { RELEASE_SHA: releaseSha, RELEASE_VERSION: releaseVersion } = process.env;
  if (typeof releaseSha !== "string" || !/^[0-9a-f]{40}$/.test(releaseSha)) {
    throw invalidField("RELEASE_SHA", "a 40-character lowercase commit SHA", releaseSha);
  }
  if (typeof releaseVersion !== "string" || !RELEASE_VERSION_PATTERN.test(releaseVersion)) {
    throw invalidField("RELEASE_VERSION", "a SemVer version without a v prefix", releaseVersion);
  }

  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (head !== releaseSha) throw invalidField("HEAD", JSON.stringify(releaseSha), head);
  requireVersion("package.json#version", readJsonObject("package.json").version, releaseVersion);
  requireVersion(
    '.release-please-manifest.json["."]',
    readJsonObject(".release-please-manifest.json")["."],
    releaseVersion,
  );

  const packages = new Map();
  for (const entry of readdirSync("packages", { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const path = join("packages", entry.name);
    const pkg = readPublicPackage(join(path, "package.json"), releaseVersion);
    if (pkg) packages.set(path, pkg);
  }
  if (packages.size === 0) {
    throw invalidField("packages/", "at least one public package", 0);
  }
  return packages;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  try {
    const packages = validateReleaseCheckout();
    console.log(
      `Validated release ${process.env.RELEASE_VERSION}: ${packages.size} public packages.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
