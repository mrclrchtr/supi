import { execFileSync } from "node:child_process";
import { validateReleaseIdentity } from "./release-validation.mjs";

const RELEASE_SUBJECT = /^chore: release (\S+)$/;
const RELEASE_SHAPED = /^chore: release\b/;

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: "pipe" }).trim();
}

/** Return the version named by a `chore: release X.Y.Z` subject, or "" for other commits. */
export function releaseSubjectVersion(sha) {
  return RELEASE_SUBJECT.exec(git("log", "-1", "--format=%s", sha))?.[1] ?? "";
}

/**
 * True for any subject starting with `chore: release`, including near misses such as a squash
 * title `chore: release X.Y.Z (#N)`. CI fails these instead of treating them as ordinary pushes.
 */
export function isReleaseShaped(sha) {
  return RELEASE_SHAPED.test(git("log", "-1", "--format=%s", sha));
}

/**
 * Reject a candidate superseded by a later first-parent Release Commit for the same version on
 * `head`. After a re-prepare only the newest Release Commit may consume the version.
 */
export function requireNewestReleaseCommit(sha, version, head) {
  for (const later of git("rev-list", "--first-parent", `${sha}..${head}`).split("\n")) {
    if (later && releaseSubjectVersion(later) === version) {
      throw new Error(`${sha}: superseded by Release Commit ${later} for ${version}`);
    }
  }
}

/** Return the version and notes of the first `## X.Y.Z` or `## [X.Y.Z](...)` changelog section. */
export function firstChangelogSection(changelog) {
  const section = changelog.split(/^## /m)[1] ?? "";
  const [heading, ...body] = section.split("\n");
  const match = heading.match(/^(?:\[([^\]]+)\]|(\S+))/);
  return { version: match?.[1] ?? match?.[2] ?? "", notes: body.join("\n").trim() };
}

/**
 * Validate a Release Commit at `sha` without GitHub access and return its version.
 * A Release Commit has the subject `chore: release X.Y.Z`, root package.json version X.Y.Z,
 * and a first CHANGELOG.md section for X.Y.Z with nonempty notes. Tag absence is checked by callers.
 */
export function requireReleaseCommit(sha) {
  const version = releaseSubjectVersion(sha);
  if (!version) throw new Error(`${sha}: expected a "chore: release X.Y.Z" commit`);
  validateReleaseIdentity(sha, version);
  const manifest = JSON.parse(git("show", `${sha}:package.json`)).version;
  if (manifest !== version) {
    throw new Error(`${sha}: package.json version ${manifest} does not match release ${version}`);
  }
  const section = firstChangelogSection(git("show", `${sha}:CHANGELOG.md`));
  if (section.version !== version) {
    throw new Error(`${sha}: the first CHANGELOG.md section must be ${version}`);
  }
  if (!section.notes) throw new Error(`${sha}: expected non-empty release notes`);
  return version;
}
