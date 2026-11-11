import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { firstChangelogSection, releaseSubjectVersion } from "./release-candidate.mjs";
import { validateReleaseIdentity } from "./release-validation.mjs";

const STABLE = /^(\d+)\.(\d+)\.(\d+)$/;

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

const git = (...args) => run("git", args).trim();
// Resolve the workspace-pinned binary; `pnpm exec` would add noise and slow repeated calls.
const cliff = (...args) => run(process.env.GIT_CLIFF ?? "git-cliff", args);

function compareVersions(left, right) {
  const a = STABLE.exec(left).slice(1).map(Number);
  const b = STABLE.exec(right).slice(1).map(Number);
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Root plus every non-private package share the release version. */
function lockstepManifests() {
  const paths = ["package.json"];
  for (const entry of readdirSync("packages", { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join("packages", entry.name, "package.json");
    try {
      if (readJson(path).private !== true) paths.push(path);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return paths;
}

/** Return public Extension Package directories, which own package changelogs. */
function extensionPackages() {
  return lockstepManifests()
    .filter((path) => path !== "package.json")
    .filter((path) => (readJson(path).pi?.extensions?.length ?? 0) > 0)
    .map((path) => path.slice(0, -"/package.json".length));
}

function setVersion(path, version) {
  const text = readFileSync(path, "utf8");
  const pkg = JSON.parse(text);
  if (pkg.version === version) return false;
  // Keep key order and the file's indentation; manifests are tool-formatted JSON.
  const indent = /^[ \t]+/m.exec(text)?.[0] ?? "";
  writeFileSync(path, `${JSON.stringify({ ...pkg, version }, null, indent)}\n`);
  return true;
}

function latestTag() {
  const tags = git("tag", "--list", "v*.*.*", "--merged", "HEAD")
    .split("\n")
    .map((tag) => tag.slice(1))
    .filter((version) => STABLE.test(version))
    .sort(compareVersions);
  return tags.at(-1) ?? "";
}

/** The newest Release Commit for an untagged version, if main already carries one. */
function pendingReleaseCommit(version) {
  for (const sha of git("log", "--format=%H", "--first-parent", "-n", "200").split("\n")) {
    if (releaseSubjectVersion(sha) === version) return sha;
  }
  return "";
}

function selectVersion(requested, previous) {
  const current = readJson("package.json").version;
  const tagged = (version) => git("tag", "--list", `v${version}`) !== "";
  let version = requested;
  if (!version) {
    version =
      STABLE.test(current) &&
      !tagged(current) &&
      (!previous || compareVersions(current, previous) > 0)
        ? current
        : cliff("--bumped-version").trim().replace(/^v/, "");
    // git-cliff returns the latest tag when nothing is release-relevant.
    if (version === previous) throw new Error(`No release-relevant commits since v${previous}`);
  }
  validateReleaseIdentity("0".repeat(40), version);
  if (!STABLE.test(version)) throw new Error(`${version}: prepare stable versions only`);
  if (tagged(version)) throw new Error(`v${version} already exists; choose a newer version`);
  if (previous && compareVersions(version, previous) <= 0) {
    throw new Error(`${version} must be newer than the latest tag v${previous}`);
  }
  return version;
}

function requireCleanMain() {
  if (git("status", "--porcelain")) throw new Error("Working tree must be clean");
  if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") throw new Error("Prepare on main");
  let upstream;
  try {
    upstream = git("rev-parse", "--verify", "origin/main");
  } catch (cause) {
    throw new Error("origin/main is missing; fetch it first", { cause });
  }
  if (upstream !== git("rev-parse", "HEAD")) {
    throw new Error("main must match origin/main; pull or push first");
  }
}

/** Keep curated notes of a pending version: rename them instead of stacking a second section. */
function requireNoOtherPendingSection(first, version, previous) {
  if (first === version || !STABLE.test(first) || git("tag", "--list", `v${first}`) !== "") return;
  if (previous && compareVersions(first, previous) <= 0) return;
  throw new Error(
    `CHANGELOG.md starts with untagged ${first}; rename that heading to ${version} and commit, or omit --version`,
  );
}

/** Insert a section before the first version section so the "# Changelog" title stays on top. */
function insertSection(changelog, section) {
  const index = changelog.search(/^## /m);
  const head = index === -1 ? `${changelog.trimEnd()}\n\n` : changelog.slice(0, index);
  const rest = index === -1 ? "" : changelog.slice(index);
  writeFileSync("CHANGELOG.md", `${head}${section}\n\n${rest}`.replace(/\n*$/, "\n"));
}

/** Package notes may still be missing from an earlier attempt, so drafts span the whole release. */
function packageDrafts(previous, tag) {
  const releaseArgs = previous ? [`v${previous}..HEAD`] : ["--unreleased"];
  const packages = [];
  for (const dir of extensionPackages()) {
    const notes = cliff(
      ...releaseArgs,
      "--tag",
      tag,
      "--strip",
      "all",
      "--include-path",
      `${dir}/**`,
    )
      .trim()
      .split("\n")
      .filter((line) => line.startsWith("* ") || line.startsWith("### "));
    if (notes.some((line) => line.startsWith("* "))) packages.push({ dir, notes });
  }
  return packages;
}

/**
 * Prepare a SuPi release in the working tree for agent editing. Never commits, tags, or pushes.
 * Re-preparing an untagged version keeps the edited changelog section and drafts only root
 * commits added since the previous Release Commit for that version. Package drafts always span
 * all commits since the latest tag.
 */
export function prepareRelease({ version: requested = "" } = {}) {
  requireCleanMain();
  const previous = latestTag();
  const version = selectVersion(requested, previous);
  const tag = `v${version}`;
  const pending = pendingReleaseCommit(version);
  const range = pending ? `${pending}..HEAD` : previous ? `v${previous}..HEAD` : "";
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const first = firstChangelogSection(changelog).version;
  requireNoOtherPendingSection(first, version, previous);
  const reprepared = first === version;

  const draft = cliff(
    ...(range ? [range] : ["--unreleased"]),
    "--tag",
    tag,
    "--strip",
    "all",
  ).trim();
  if (!reprepared && !draft) {
    throw new Error(`No release-relevant commits since ${previous ? `v${previous}` : "the start"}`);
  }
  const changed = lockstepManifests().filter((path) => setVersion(path, version));
  if (!reprepared) {
    insertSection(changelog, draft);
    changed.push("CHANGELOG.md");
  }
  return {
    version,
    previous,
    range,
    reprepared,
    changed,
    draft: draft || "(no new release-relevant commits)",
    packages: packageDrafts(previous, tag),
  };
}

function report(result) {
  const lines = [
    `# Prepared SuPi ${result.version}`,
    "",
    `- Previous tag: ${result.previous ? `v${result.previous}` : "none"}`,
    `- Commit range: ${result.range || "all"}`,
    `- Changed files: ${result.changed.length ? result.changed.join(", ") : "none"}`,
    "",
  ];
  if (result.reprepared) {
    lines.push(
      `## Re-prepared ${result.version}`,
      "",
      `CHANGELOG.md already starts with ${result.version}; its notes were kept. Add these new commits where relevant:`,
      "",
      result.draft,
      "",
    );
  } else {
    lines.push(
      "## Root draft",
      "",
      "CHANGELOG.md now starts with this draft:",
      "",
      result.draft,
      "",
    );
  }
  lines.push(
    "## Package drafts",
    "",
    `Commits since ${result.previous ? `v${result.previous}` : "the start"} touching each Extension Package:`,
    "",
  );
  if (result.packages.length === 0)
    lines.push("No Extension Package has release-relevant commits.", "");
  for (const { dir, notes } of result.packages) {
    lines.push(
      `### ${dir}`,
      "",
      ...notes.map((line) => (line.startsWith("### ") ? `#${line}` : line)),
      "",
    );
  }
  lines.push(
    "## Next steps",
    "",
    "1. Curate the first CHANGELOG.md section; it becomes the GitHub release body.",
    "2. Add user-relevant entries to package CHANGELOG.md files (docs/conventions/package-changelogs.md).",
    `3. Review git diff, then commit "chore: release ${result.version}" (add --allow-empty when nothing changed) and push to main.`,
  );
  return lines.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const { values } = parseArgs({ options: { version: { type: "string" } } });
    console.log(report(prepareRelease(values)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
