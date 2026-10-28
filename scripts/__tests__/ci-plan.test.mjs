import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCiFixture } from "./helpers/ci-fixture.mjs";

let repo;
beforeEach(() => {
  repo = createCiFixture();
});
afterEach(() => {
  repo.cleanup();
});
const root = "repos/mrclrchtr/supi";
const response = (body) => ({ body });

function pushResponses(pr = repo.pr) {
  return {
    [`GET ${root}/commits/${repo.sha}/pulls?per_page=100&page=1`]: response([pr]),
    [`GET ${root}/pulls/42`]: response(pr),
  };
}

function releaseMerge() {
  const base = repo.sha;
  repo.git(["checkout", "-qb", "release"]);
  for (const path of [
    "package.json",
    "packages/a-app/package.json",
    "packages/z-core/package.json",
  ]) {
    repo.updateJson(path, { version: "6.3.2" });
  }
  repo.writeJson(".release-please-manifest.json", { ".": "6.3.2" });
  writeFileSync(join(repo.cwd, "CHANGELOG.md"), "# Changelog\n\n## 6.3.2\n\n* Fix\n");
  repo.git(["add", "CHANGELOG.md"]);
  const head = repo.commit();
  repo.git(["checkout", "-q", "main"]);
  repo.git(["merge", "--no-ff", "release", "-m", "chore: release 6.3.2"]);
  const sha = repo.git(["rev-parse", "HEAD"]);
  const pr = {
    ...repo.pr,
    merged: false,
    title: "chore: release 6.3.2",
    base: { ...repo.pr.base, sha: base },
    head: { ...repo.pr.head, sha: head },
  };
  return { sha, pr };
}

function runPr(pr, sha = repo.sha) {
  return repo.runScript("ci-plan.mjs", {
    event: { pull_request: pr },
    overrides: { GITHUB_EVENT_NAME: "pull_request", GITHUB_SHA: sha },
  });
}

describe("fast PR verification", () => {
  it("uses fast checks for ordinary PRs without GitHub API access", () => {
    const result = runPr({ ...repo.pr, user: { login: "contributor" } });
    expect(result.status, result.stderr).toBe(0);
    expect(result.outputs).toEqual({ mode: "pr", sha: repo.sha, version: "", "release-pr": "" });
    expect(result.calls).toEqual([]);
  });

  it("only grants the metadata path to a trusted version-only release PR", () => {
    const { sha, pr } = releaseMerge();
    const result = runPr(pr, sha);
    expect(result.status, result.stderr).toBe(0);
    expect(result.outputs).toEqual({ mode: "metadata", sha, version: "6.3.2", "release-pr": "" });
    for (const untrusted of [
      { user: { login: "contributor", type: "User" } },
      { head: { ...pr.head, repo: { full_name: "fork/supi" } } },
      { head: { ...pr.head, ref: "release-lookalike" } },
      { labels: [] },
      { title: "chore: release 99.0.0" },
    ]) {
      expect(runPr({ ...pr, ...untrusted }, sha).outputs.mode).toBe("pr");
    }
  }, 10_000);

  it.each(["dependency", "code", "symlink", "stale-parent"])(
    "falls back to ordinary checks for unexpected %s changes",
    (change) => {
      const { pr } = releaseMerge();
      repo.git(["reset", "--hard", pr.head.sha]);
      if (change === "dependency")
        repo.updateJson("package.json", { dependencies: { unexpected: "1.0.0" } });
      if (change === "code") {
        writeFileSync(join(repo.cwd, "unexpected.mjs"), "throw new Error('unexpected');\n");
        repo.git(["add", "unexpected.mjs"]);
      }
      if (change === "symlink") {
        repo.git(["rm", "CHANGELOG.md"]);
        repo.git([
          "update-index",
          "--add",
          "--cacheinfo",
          `120000,${repo.git(["hash-object", "package.json"])},CHANGELOG.md`,
        ]);
      }
      repo.git(["commit", "--allow-empty", "-am", "test: unexpected changes"]);
      const head = repo.git(["rev-parse", "HEAD"]);
      repo.git(["checkout", "--detach", pr.base.sha]);
      repo.git(["merge", "--no-ff", head, "-m", "test: PR merge"]);
      const sha = repo.git(["rev-parse", "HEAD"]);
      const updated = { ...pr, head: { ...pr.head, sha: head } };
      if (change === "stale-parent") updated.base = { ...pr.base, sha: "a".repeat(40) };
      expect(runPr(updated, sha).outputs.mode).toBe("pr");
    },
  );
});

describe("release candidate planning", () => {
  it("does no heavy work on an ordinary main push", () => {
    const result = repo.runScript("ci-plan.mjs", {
      responses: {
        [`GET ${root}/commits/${repo.sha}/pulls?per_page=100&page=1`]: response([]),
      },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.outputs.mode).toBe("none");
  });

  it("selects full verification and a fixed SHA for a merged release PR", () => {
    const result = repo.runScript("ci-plan.mjs", { responses: pushResponses() });
    expect(result.status, result.stderr).toBe(0);
    expect(result.outputs).toEqual({
      mode: "full",
      sha: repo.sha,
      version: "6.3.1",
      "release-pr": "42",
    });
  });

  it("reads all association pages rather than missing a queued release", () => {
    const responses = pushResponses();
    responses[`GET ${root}/commits/${repo.sha}/pulls?per_page=100&page=1`] = response(
      Array.from({ length: 100 }, () => ({ user: {} })),
    );
    responses[`GET ${root}/commits/${repo.sha}/pulls?per_page=100&page=2`] = response([repo.pr]);
    expect(repo.runScript("ci-plan.mjs", { responses }).outputs.mode).toBe("full");
  });

  it.each([
    { merged: false },
    { merge_commit_sha: "a".repeat(40) },
    { title: "chore: release 99.0.0" },
    { user: { login: "contributor", type: "User" } },
  ])("fails closed when the detailed candidate no longer matches: %j", (fields) => {
    const responses = pushResponses();
    responses[`GET ${root}/pulls/42`] = response({ ...repo.pr, ...fields });
    const result = repo.runScript("ci-plan.mjs", { responses });
    expect(result.status).not.toBe(0);
    expect(result.outputs).toEqual({});
  });

  it("does not turn API failures into a successful no-release decision", () => {
    const result = repo.runScript("ci-plan.mjs", { responses: {} });
    expect(result.status).not.toBe(0);
    expect(result.outputs).toEqual({});
  });
});

describe("manual verification and retries", () => {
  function dispatch(inputs = {}, responses = {}, overrides = {}) {
    return repo.runScript("ci-plan.mjs", {
      event: { inputs },
      responses,
      overrides: { GITHUB_EVENT_NAME: "workflow_dispatch", ...overrides },
    });
  }

  it("runs exhaustive checks without release creation when no retry is selected", () => {
    const result = dispatch();
    expect(result.status, result.stderr).toBe(0);
    expect(result.outputs).toEqual({ mode: "full", sha: repo.sha, version: "", "release-pr": "" });
  });

  it("retries a merged candidate at its SHA even after main advances", () => {
    repo.updateJson("package.json", { version: "6.4.0" });
    const main = repo.commit();
    const result = dispatch(
      { release_pr: "42" },
      { [`GET ${root}/pulls/42`]: response(repo.pr) },
      { GITHUB_SHA: main },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.outputs).toEqual({
      mode: "full",
      sha: repo.sha,
      version: "6.3.1",
      "release-pr": "42",
    });
  });

  it("verifies an annotated tag's commit rather than the newer main checkout", () => {
    repo.git(["-c", "tag.gpgsign=false", "tag", "-a", "v6.3.1", "-m", "Release", repo.sha]);
    repo.updateJson("package.json", { version: "6.4.0" });
    const main = repo.commit();
    const result = dispatch(
      { publish_tag: "v6.3.1" },
      {
        [`GET ${root}/releases/tags/v6.3.1`]: response({ tag_name: "v6.3.1", draft: false }),
        [`GET ${root}/commits/v6.3.1`]: response({
          sha: repo.git(["rev-parse", "v6.3.1^{commit}"]),
        }),
      },
      { GITHUB_SHA: main },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.outputs).toEqual({
      mode: "full",
      sha: repo.sha,
      version: "6.3.1",
      "release-pr": "",
    });
  });

  it.each([
    [{ publish_tag: "v6.3.1", release_pr: "42" }, {}],
    [{ publish_tag: "main" }, {}],
    [{ publish_tag: "v6.3.1\nx=y" }, {}],
    [{ release_pr: "--help" }, {}],
    [{ release_pr: "42" }, { GITHUB_REF: "refs/heads/other" }],
  ])("rejects invalid retry input before API access: %j", (inputs, overrides) => {
    const result = dispatch(inputs, {}, overrides);
    expect(result.status).not.toBe(0);
    expect(result.outputs).toEqual({});
    expect(result.calls).toEqual([]);
  });

  it.each([
    { tag_name: "v6.3.1", draft: true },
    { tag_name: "v6.3.0", draft: false },
  ])("rejects an unpublished or mismatched retry release: %j", (release) => {
    const result = dispatch(
      { publish_tag: "v6.3.1" },
      { [`GET ${root}/releases/tags/v6.3.1`]: response(release) },
    );
    expect(result.status).not.toBe(0);
    expect(result.outputs).toEqual({});
  });
});
