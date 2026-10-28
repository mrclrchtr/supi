import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { github, isReleasePullRequest, requireReleasePullRequest } from "./release-github.mjs";
import { validateReleaseIdentity } from "./release-validation.mjs";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: "pipe" }).trim();
}

function jsonAt(sha, path) {
  return JSON.parse(git("show", `${sha}:${path}`));
}

function versionAt(sha) {
  const version = jsonAt(sha, ".release-please-manifest.json")["."];
  validateReleaseIdentity(sha, version);
  return version;
}

/** Only version fields, the release manifest, and a regular-file changelog may bypass PR checks. */
function metadataOnly(event, sha, version) {
  const { base, head } = event.pull_request;
  const parents = git("rev-list", "--parents", "-n", "1", sha).split(" ");
  if (parents.length !== 3 || parents[1] !== base.sha || parents[2] !== head.sha) return false;
  const manifests = new Set([
    "package.json",
    ...jsonAt(base.sha, "release-please-config.json").packages["."]["extra-files"],
  ]);
  const paths = git("diff", "--name-only", "--no-renames", "-z", base.sha, sha, "--")
    .split("\0")
    .filter(Boolean);
  if (!paths.includes(".release-please-manifest.json") || !paths.includes("CHANGELOG.md"))
    return false;
  return paths.every((path) => {
    if (!/^100644 blob /.test(git("ls-tree", sha, "--", path))) return false;
    if (path === "CHANGELOG.md") return true;
    const before = jsonAt(base.sha, path);
    const after = jsonAt(sha, path);
    if (path === ".release-please-manifest.json") {
      return after["."] === version && isDeepStrictEqual({ ...before, ".": version }, after);
    }
    return (
      manifests.has(path) &&
      after.version === version &&
      isDeepStrictEqual({ ...before, version }, after)
    );
  });
}

function pullRequestPlan(event, repository, plan) {
  plan.mode = "pr";
  if (!isReleasePullRequest(event.pull_request, repository)) return plan;
  // Uncertain or unexpected changes take the ordinary PR path, never a bypass.
  try {
    const version = versionAt(plan.sha);
    if (
      event.pull_request.title === `chore: release ${version}` &&
      metadataOnly(event, plan.sha, version)
    ) {
      return { ...plan, mode: "metadata", version };
    }
  } catch {
    // Ordinary checks handle malformed or non-metadata changes.
  }
  return plan;
}

function publishingRetry(tag, repository, plan) {
  if (!tag.startsWith("v")) throw new Error("publish_tag: expected a versioned release tag");
  validateReleaseIdentity(plan.sha, tag.slice(1));
  const release = github(`repos/${repository}/releases/tags/${encodeURIComponent(tag)}`);
  if (release.tag_name !== tag || release.draft !== false)
    throw new Error("Expected a published release");
  const sha = github(`repos/${repository}/commits/${encodeURIComponent(tag)}`).sha;
  validateReleaseIdentity(sha, tag.slice(1));
  return { ...plan, sha, version: tag.slice(1) };
}

function releaseCandidate(pr, repository, plan, sha = pr.merge_commit_sha) {
  if (!isReleasePullRequest(pr, repository) || pr.merged !== true)
    throw new Error("Expected a merged release PR");
  const version = versionAt(sha);
  requireReleasePullRequest(pr, repository, sha, version);
  return { ...plan, mode: "full", sha, version, releasePr: String(pr.number) };
}

function manualPlan(event, repository, plan) {
  const { publish_tag: tag = "", release_pr: number = "" } = event.inputs ?? {};
  if (tag && number) throw new Error("Choose either publish_tag or release_pr, not both");
  if ((tag || number) && process.env.GITHUB_REF !== "refs/heads/main") {
    throw new Error("Releasing and publishing retries must run from main");
  }
  let selected = { ...plan, mode: "full" };
  if (tag) selected = publishingRetry(tag, repository, selected);
  if (number) {
    if (!/^[1-9][0-9]*$/.test(number)) throw new Error("release_pr: expected a PR number");
    selected = releaseCandidate(
      github(`repos/${repository}/pulls/${number}`),
      repository,
      selected,
    );
  }
  git("merge-base", "--is-ancestor", selected.sha, plan.sha);
  return selected;
}

function pushPlan(event, repository, plan) {
  const { sha } = plan;
  if (process.env.GITHUB_REF !== "refs/heads/main" || event.after !== sha) {
    throw new Error("Unexpected main push");
  }
  // The commit association endpoint is paginated; never silently miss a candidate.
  const candidates = [];
  for (let page = 1; ; page++) {
    const prs = github(`repos/${repository}/commits/${sha}/pulls?per_page=100&page=${page}`);
    candidates.push(
      ...prs.filter((pr) => isReleasePullRequest(pr, repository) && pr.merge_commit_sha === sha),
    );
    if (prs.length < 100) break;
  }
  if (candidates.length === 0) return plan;
  if (candidates.length !== 1) throw new Error("Ambiguous release candidate");
  const pr = github(`repos/${repository}/pulls/${candidates[0].number}`);
  // The detail response must still refer to the event commit, not a different merged release.
  return releaseCandidate(pr, repository, plan, sha);
}

/** Select fast PR checks or exhaustive verification pinned to an immutable release candidate. */
export function createPlan() {
  const {
    GITHUB_EVENT_NAME: eventName,
    GITHUB_SHA: sha,
    GITHUB_REPOSITORY: repository,
  } = process.env;
  if (!/^[0-9a-f]{40}$/.test(sha ?? "") || git("rev-parse", "HEAD") !== sha) {
    throw new Error("Checkout does not match the event commit");
  }
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const plan = { mode: "none", sha, version: "", releasePr: "" };
  switch (eventName) {
    case "pull_request":
      return pullRequestPlan(event, repository, plan);
    case "workflow_dispatch":
      return manualPlan(event, repository, plan);
    case "push":
      return pushPlan(event, repository, plan);
    default:
      throw new Error("Unexpected CI event");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const plan = createPlan();
    const output = `mode=${plan.mode}\nsha=${plan.sha}\nversion=${plan.version}\nrelease-pr=${plan.releasePr}\n`;
    appendFileSync(process.env.GITHUB_OUTPUT, output);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `## CI verification\n\n- Mode: ${plan.mode}\n- Commit: ${plan.sha}\n- Release PR: ${plan.releasePr || "none"}\n- Version: ${plan.version || "none"}\n`,
      );
    }
    console.log(output);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
