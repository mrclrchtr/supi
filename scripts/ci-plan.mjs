import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isReleaseShaped,
  requireNewestReleaseCommit,
  requireReleaseCommit,
} from "./release-candidate.mjs";
import { github } from "./release-github.mjs";
import { validateReleaseIdentity } from "./release-validation.mjs";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: "pipe" }).trim();
}

/** A version is consumed only by its tag; an existing tag may only point at this candidate. */
function requireUnconsumedVersion(repository, version, sha) {
  const tag = encodeURIComponent(`v${version}`);
  const root = `repos/${repository}`;
  if (!github(`${root}/git/ref/tags/${tag}`, { allowMissing: true })) return;
  if (github(`${root}/commits/${tag}`).sha !== sha) {
    throw new Error(`v${version} already exists at another commit; prepare a new version`);
  }
}

function releaseCandidate(repository, plan, sha) {
  const version = requireReleaseCommit(sha);
  requireNewestReleaseCommit(sha, version, plan.sha);
  requireUnconsumedVersion(repository, version, sha);
  return { ...plan, mode: "full", sha, version, release: "true" };
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

function manualPlan(event, repository, plan) {
  const { publish_tag: tag = "", release_sha: releaseSha = "" } = event.inputs ?? {};
  if (tag && releaseSha) throw new Error("Choose either publish_tag or release_sha, not both");
  if ((tag || releaseSha) && process.env.GITHUB_REF !== "refs/heads/main") {
    throw new Error("Releasing and publishing retries must run from main");
  }
  if (releaseSha && !/^[0-9a-f]{40}$/.test(releaseSha)) {
    throw new Error("release_sha: expected a 40-character lowercase commit SHA");
  }
  // Release commits must already be on main; check before any GitHub access.
  if (releaseSha) git("merge-base", "--is-ancestor", releaseSha, plan.sha);
  let selected = { ...plan, mode: "full" };
  if (tag) selected = publishingRetry(tag, repository, selected);
  if (releaseSha) selected = releaseCandidate(repository, selected, releaseSha);
  git("merge-base", "--is-ancestor", selected.sha, plan.sha);
  return selected;
}

function pushPlan(event, repository, plan) {
  if (process.env.GITHUB_REF !== "refs/heads/main" || event.after !== plan.sha) {
    throw new Error("Unexpected main push");
  }
  // Release-shaped commits that fail validation fail planning instead of passing as ordinary pushes.
  if (!isReleaseShaped(plan.sha)) return plan;
  return releaseCandidate(repository, plan, plan.sha);
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
  const plan = { mode: "none", sha, version: "", release: "" };
  switch (eventName) {
    case "pull_request":
      return { ...plan, mode: "pr" };
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
    const output = `mode=${plan.mode}\nsha=${plan.sha}\nversion=${plan.version}\nrelease=${plan.release}\n`;
    appendFileSync(process.env.GITHUB_OUTPUT, output);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `## CI verification\n\n- Mode: ${plan.mode}\n- Commit: ${plan.sha}\n- Release: ${plan.release ? `v${plan.version}` : "none"}\n- Version: ${plan.version || "none"}\n`,
      );
    }
    console.log(output);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
