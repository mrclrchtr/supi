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
const untagged = { [`GET ${root}/git/ref/tags/v6.3.1`]: { status: 404 } };

function ordinaryCommit(subject = "fix: ordinary change") {
  repo.git(["commit", "--allow-empty", "-qm", subject]);
  return repo.git(["rev-parse", "HEAD"]);
}

function push(sha = repo.sha, responses = untagged) {
  return repo.runScript("ci-plan.mjs", {
    event: { after: sha },
    responses,
    overrides: { GITHUB_SHA: sha },
  });
}

describe("fast PR verification", () => {
  it("uses fast checks for every PR without GitHub API access, including release commits", () => {
    const result = repo.runScript("ci-plan.mjs", {
      event: { pull_request: { title: "chore: release 6.3.1" } },
      overrides: { GITHUB_EVENT_NAME: "pull_request" },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.outputs).toEqual({ mode: "pr", sha: repo.sha, version: "", release: "" });
    expect(result.calls).toEqual([]);
  });
});

describe("release candidate planning", () => {
  it("does no heavy work or API access on an ordinary main push", () => {
    const sha = ordinaryCommit();
    const result = push(sha, {});
    expect(result.status, result.stderr).toBe(0);
    expect(result.outputs.mode).toBe("none");
    expect(result.calls).toEqual([]);
  });

  it("selects full verification and the pushed SHA for an untagged Release Commit", () => {
    const result = push();
    expect(result.status, result.stderr).toBe(0);
    expect(result.outputs).toEqual({
      mode: "full",
      sha: repo.sha,
      version: "6.3.1",
      release: "true",
    });
  });

  it("accepts a re-pushed Release Commit for a still-untagged version", () => {
    repo.git(["commit", "--allow-empty", "-qm", "fix: verification failure"]);
    const sha = ordinaryCommit("chore: release 6.3.1");
    expect(push(sha).outputs).toMatchObject({ mode: "full", sha, version: "6.3.1" });
  });

  it.each(["package-version", "changelog-version", "empty-notes", "bad-version", "squash-suffix"])(
    "fails planning instead of skipping a malformed Release Commit: %s",
    (fault) => {
      let subject = "chore: release 6.3.1";
      if (fault === "package-version") repo.updateJson("package.json", { version: "6.3.0" });
      if (fault === "changelog-version")
        writeFileSync(join(repo.cwd, "CHANGELOG.md"), "## 6.3.0\n\n* Old\n");
      if (fault === "empty-notes") writeFileSync(join(repo.cwd, "CHANGELOG.md"), "## 6.3.1\n\n");
      if (fault === "bad-version") subject = "chore: release latest";
      if (fault === "squash-suffix") subject = "chore: release 6.3.1 (#42)";
      repo.git(["add", "-A"]);
      repo.git(["commit", "--allow-empty", "-qm", subject]);
      const result = push(repo.git(["rev-parse", "HEAD"]));
      expect(result.status).not.toBe(0);
      expect(result.outputs).toEqual({});
    },
  );

  it("rejects a Release Commit whose version is already tagged at another commit", () => {
    const result = push(repo.sha, {
      [`GET ${root}/git/ref/tags/v6.3.1`]: response({ object: {} }),
      [`GET ${root}/commits/v6.3.1`]: response({ sha: "a".repeat(40) }),
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("prepare a new version");
    expect(result.outputs).toEqual({});
  });

  it("keeps a candidate whose tag already points at it, so tag/release recovery can finish", () => {
    const result = push(repo.sha, {
      [`GET ${root}/git/ref/tags/v6.3.1`]: response({ object: {} }),
      [`GET ${root}/commits/v6.3.1`]: response({ sha: repo.sha }),
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.outputs.release).toBe("true");
  });

  it("does not turn API failures into a successful no-release decision", () => {
    const result = push(repo.sha, { [`GET ${root}/git/ref/tags/v6.3.1`]: { status: 500 } });
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
    expect(result.outputs).toEqual({ mode: "full", sha: repo.sha, version: "", release: "" });
  });

  it("retries a Release Commit at its SHA even after main advances", () => {
    const main = ordinaryCommit();
    const result = dispatch({ release_sha: repo.sha }, untagged, { GITHUB_SHA: main });
    expect(result.status, result.stderr).toBe(0);
    expect(result.outputs).toEqual({
      mode: "full",
      sha: repo.sha,
      version: "6.3.1",
      release: "true",
    });
  });

  it("rejects a Release Commit superseded by a newer one for the same version", () => {
    repo.git(["commit", "--allow-empty", "-qm", "fix: verification failure"]);
    const main = ordinaryCommit("chore: release 6.3.1");
    const result = dispatch({ release_sha: repo.sha }, untagged, { GITHUB_SHA: main });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("superseded");
    expect(result.calls).toEqual([]);
  });

  it("rejects a valid Release Commit that is not on main before API access", () => {
    repo.git(["checkout", "-qb", "side"]);
    const side = ordinaryCommit("chore: release 6.3.1");
    repo.git(["checkout", "-q", "main"]);
    const main = ordinaryCommit();
    const result = dispatch({ release_sha: side }, untagged, { GITHUB_SHA: main });
    expect(result.status).not.toBe(0);
    expect(result.outputs).toEqual({});
    expect(result.calls).toEqual([]);
  });

  it("rejects a release_sha that is not a Release Commit", () => {
    const main = ordinaryCommit();
    const result = dispatch({ release_sha: main }, untagged, { GITHUB_SHA: main });
    expect(result.status).not.toBe(0);
    expect(result.outputs).toEqual({});
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
    expect(result.outputs).toEqual({ mode: "full", sha: repo.sha, version: "6.3.1", release: "" });
  });

  it.each([
    [{ publish_tag: "v6.3.1", release_sha: "a".repeat(40) }, {}],
    [{ publish_tag: "main" }, {}],
    [{ publish_tag: "v6.3.1\nx=y" }, {}],
    [{ release_sha: "--help" }, {}],
    [{ release_sha: "a".repeat(40) }, {}],
    [{ release_sha: "SHA" }, { GITHUB_REF: "refs/heads/other" }],
  ])("rejects invalid retry input before API access: %j", (inputs, overrides) => {
    if (inputs.release_sha === "SHA") inputs.release_sha = repo.sha;
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
