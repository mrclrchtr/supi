import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { github, requireReleasePullRequest } from "./release-github.mjs";
import { validateReleaseCheckout } from "./release-validation.mjs";

/** Create/recover a release at the verified SHA; never ask Release Please to choose a moving target. */
function createRelease() {
  validateReleaseCheckout();
  const {
    RELEASE_SHA: sha,
    RELEASE_VERSION: version,
    RELEASE_PR: number,
    GITHUB_REPOSITORY: repository,
  } = process.env;
  if (!/^[1-9][0-9]*$/.test(number ?? "")) throw new Error("Expected a release PR number");
  const root = `repos/${repository}`;
  const pr = github(`${root}/pulls/${number}`);
  requireReleasePullRequest(pr, repository, sha, version);
  // A newer main is fine; a candidate removed from main by a force push is not.
  execFileSync("git", ["merge-base", "--is-ancestor", sha, "origin/main"], { stdio: "pipe" });

  const section = readFileSync("CHANGELOG.md", "utf8").split(/^## /m)[1];
  const heading = section?.split("\n")[0];
  const headingVersion = heading?.match(/^(?:\[([^\]]+)\]|(\S+))/);
  if ((headingVersion?.[1] ?? headingVersion?.[2]) !== version) {
    throw new Error("The first changelog entry must match the release version");
  }
  const notes = section.slice(section.indexOf("\n") + 1).trim();
  if (!notes) throw new Error("Expected non-empty release notes");
  const tag = `v${version}`;
  const tagPath = encodeURIComponent(tag);
  const existingTag = github(`${root}/git/ref/tags/${tagPath}`, { allowMissing: true });
  if (existingTag) {
    // The commit endpoint peels annotated tags too. Existing tags must never be moved.
    if (github(`${root}/commits/${tagPath}`).sha !== sha) {
      throw new Error("Existing release tag points to a different commit");
    }
  }
  const release = github(`${root}/releases/tags/${tagPath}`, { allowMissing: true });
  if (release && (!existingTag || release.tag_name !== tag || release.draft !== false)) {
    throw new Error("Existing release is missing its tag, mismatched, or unpublished");
  }
  if (!existingTag) {
    github(`${root}/git/refs`, { method: "POST", body: { ref: `refs/tags/${tag}`, sha } });
  }
  if (!release) {
    github(`${root}/releases`, {
      method: "POST",
      body: {
        tag_name: tag,
        target_commitish: sha,
        name: tag,
        body: notes,
        draft: false,
        prerelease: version.split("+")[0].includes("-"),
      },
    });
  }
  // Release Please uses these labels to distinguish outstanding merges from completed releases.
  github(`${root}/issues/${number}/labels`, {
    method: "POST",
    body: { labels: ["autorelease: tagged"] },
  });
  github(`${root}/issues/${number}/labels/${encodeURIComponent("autorelease: pending")}`, {
    method: "DELETE",
    allowMissing: true,
  });
  console.log(`Release ${tag} is ready at verified commit ${sha}.`);
}

try {
  createRelease();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
