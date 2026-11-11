import { execFileSync } from "node:child_process";
import {
  firstChangelogSection,
  requireNewestReleaseCommit,
  requireReleaseCommit,
} from "./release-candidate.mjs";
import { github } from "./release-github.mjs";
import { validateReleaseCheckout } from "./release-validation.mjs";

/** Create/recover the tag and GitHub release at the verified Release Commit; never move a tag. */
function createRelease() {
  validateReleaseCheckout();
  const { RELEASE_SHA: sha, RELEASE_VERSION: version, GITHUB_REPOSITORY: repository } = process.env;
  if (requireReleaseCommit(sha) !== version) {
    throw new Error("The release commit does not match RELEASE_VERSION");
  }
  // A newer main is fine; a candidate removed from main by a force push is not.
  execFileSync("git", ["merge-base", "--is-ancestor", sha, "origin/main"], { stdio: "pipe" });
  requireNewestReleaseCommit(sha, version, "origin/main");

  // The edited first changelog section at the verified commit is the GitHub release body.
  const changelog = execFileSync("git", ["show", `${sha}:CHANGELOG.md`], { encoding: "utf8" });
  const { notes } = firstChangelogSection(changelog);
  const root = `repos/${repository}`;
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
  console.log(`Release ${tag} is ready at verified commit ${sha}.`);
}

try {
  createRelease();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
