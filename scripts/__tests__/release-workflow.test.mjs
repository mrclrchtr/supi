// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub Actions expressions are literal test data.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCiFixture } from "./helpers/ci-fixture.mjs";

const workflow = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
const job = (name) => workflow.split(`\n  ${name}:\n`)[1]?.split(/^ {2}[\w-]+:\n/m)[0] ?? "";
const root = "repos/mrclrchtr/supi";
const response = (body) => ({ body });
let repo;
beforeEach(() => {
  repo = createCiFixture();
});
afterEach(() => {
  repo.cleanup();
});

function responses() {
  return {
    [`GET ${root}/git/ref/tags/v6.3.1`]: { status: 404 },
    [`GET ${root}/releases/tags/v6.3.1`]: { status: 404 },
    [`POST ${root}/git/refs`]: response({}),
    [`POST ${root}/releases`]: response({}),
  };
}
const writes = (result) => result.calls.filter(({ method }) => method !== "GET");

describe("verified-commit release creation", () => {
  it("tags the verified candidate, not newer main, with only that version's release notes", () => {
    repo.updateJson("package.json", { version: "6.4.0" });
    const main = repo.commit();
    repo.git(["update-ref", "refs/remotes/origin/main", main]);
    repo.git(["checkout", "--detach", repo.sha]);
    const result = repo.runScript("create-release.mjs", { responses: responses() });
    expect(result.status, result.stderr).toBe(0);
    expect(writes(result)).toEqual([
      {
        endpoint: `${root}/git/refs`,
        method: "POST",
        body: { ref: "refs/tags/v6.3.1", sha: repo.sha },
      },
      {
        endpoint: `${root}/releases`,
        method: "POST",
        body: {
          tag_name: "v6.3.1",
          target_commitish: repo.sha,
          name: "v6.3.1",
          body: "### Fixes\n\n* A release fix",
          draft: false,
          prerelease: false,
        },
      },
    ]);
  });

  it.each(["checkout", "package-version", "subject", "changelog", "ancestry"])(
    "rejects invalid %s before any write",
    (fault) => {
      const api = responses();
      const overrides = {};
      if (fault === "checkout") overrides.RELEASE_SHA = "a".repeat(40);
      if (fault === "package-version")
        repo.updateJson("packages/a-app/package.json", { version: "9.0.0" });
      if (fault === "subject") {
        repo.git(["commit", "--amend", "-qm", "fix: not a release"]);
        overrides.RELEASE_SHA = repo.git(["rev-parse", "HEAD"]);
        repo.git(["update-ref", "refs/remotes/origin/main", overrides.RELEASE_SHA]);
      }
      if (fault === "changelog") {
        writeFileSync(join(repo.cwd, "CHANGELOG.md"), "## 6.4.0\n\nWrong release\n");
        repo.git(["commit", "-qam", "chore: release 6.3.1"]);
        overrides.RELEASE_SHA = repo.git(["rev-parse", "HEAD"]);
        repo.git(["update-ref", "refs/remotes/origin/main", overrides.RELEASE_SHA]);
      }
      if (fault === "ancestry")
        repo.git(["update-ref", "refs/remotes/origin/main", `${repo.sha}~1`]);
      const result = repo.runScript("create-release.mjs", { responses: api, overrides });
      expect(result.status).not.toBe(0);
      expect(writes(result)).toEqual([]);
    },
  );

  it("refuses to tag a Release Commit superseded on main by a newer one for the same version", () => {
    repo.git(["commit", "--allow-empty", "-qm", "fix: verification failure"]);
    repo.git(["commit", "--allow-empty", "-qm", "chore: release 6.3.1"]);
    repo.git(["update-ref", "refs/remotes/origin/main", "HEAD"]);
    repo.git(["checkout", "-q", "--detach", repo.sha]);
    const result = repo.runScript("create-release.mjs", { responses: responses() });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("superseded");
    expect(writes(result)).toEqual([]);
  });

  it("rejects a future package changelog before creating tags", () => {
    repo.updateJson("packages/a-app/package.json", { pi: { extensions: ["./extension.ts"] } });
    writeFileSync(
      join(repo.cwd, "packages/a-app/CHANGELOG.md"),
      "## [6.4.0]\n\n- Future behavior.\n",
    );
    const result = repo.runScript("create-release.mjs", { responses: responses() });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("newer than package version 6.3.1");
    expect(writes(result)).toEqual([]);
  });

  it("never moves an existing tag to the candidate", () => {
    const api = responses();
    api[`GET ${root}/git/ref/tags/v6.3.1`] = response({ object: { type: "tag" } });
    api[`GET ${root}/commits/v6.3.1`] = response({ sha: "a".repeat(40) });
    const result = repo.runScript("create-release.mjs", { responses: api });
    expect(result.status).not.toBe(0);
    expect(writes(result)).toEqual([]);
  });

  it.each([false, true])(
    "recovers after a previous run created the tag (release exists: %s)",
    (exists) => {
      const api = responses();
      api[`GET ${root}/git/ref/tags/v6.3.1`] = response({ object: { type: "tag" } });
      api[`GET ${root}/commits/v6.3.1`] = response({ sha: repo.sha });
      if (exists)
        api[`GET ${root}/releases/tags/v6.3.1`] = response({ tag_name: "v6.3.1", draft: false });
      const result = repo.runScript("create-release.mjs", { responses: api });
      expect(result.status, result.stderr).toBe(0);
      expect(writes(result).some(({ endpoint }) => endpoint === `${root}/git/refs`)).toBe(false);
      expect(writes(result).filter(({ endpoint }) => endpoint === `${root}/releases`)).toHaveLength(
        exists ? 0 : 1,
      );
    },
  );

  it.each([403, 500])("does not mistake HTTP %s for an absent tag", (status) => {
    const api = responses();
    api[`GET ${root}/git/ref/tags/v6.3.1`] = { status };
    const result = repo.runScript("create-release.mjs", { responses: api });
    expect(result.status).not.toBe(0);
    expect(writes(result)).toEqual([]);
  });

  it("does not create a release after a conflicting concurrent tag creation", () => {
    const api = responses();
    api[`POST ${root}/git/refs`] = { status: 422 };
    const result = repo.runScript("create-release.mjs", { responses: api });
    expect(result.status).not.toBe(0);
    expect(writes(result)).toEqual([
      {
        endpoint: `${root}/git/refs`,
        method: "POST",
        body: { ref: "refs/tags/v6.3.1", sha: repo.sha },
      },
    ]);
  });

  it("refuses an existing draft release", () => {
    const api = responses();
    api[`GET ${root}/git/ref/tags/v6.3.1`] = response({});
    api[`GET ${root}/commits/v6.3.1`] = response({ sha: repo.sha });
    api[`GET ${root}/releases/tags/v6.3.1`] = response({ tag_name: "v6.3.1", draft: true });
    const result = repo.runScript("create-release.mjs", { responses: api });
    expect(result.status).not.toBe(0);
    expect(writes(result)).toEqual([]);
  });
});

function condition(
  name,
  {
    event = "push",
    ref = "refs/heads/main",
    cancelled = false,
    tag = "",
    mode = "full",
    version = "6.3.1",
    isRelease = "true",
    plan = "success",
    verify = "success",
    release = "success",
  } = {},
) {
  const expression = job(name)
    .match(/^ {4}if: >-\n((?: {6}.+\n)+)/m)[1]
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\.([\w-]+)/g, (_match, key) => `[${JSON.stringify(key)}]`);
  return runInNewContext(expression, {
    cancelled: () => cancelled,
    github: { event_name: event, ref },
    inputs: { publish_tag: tag },
    needs: {
      "ci-plan": { result: plan, outputs: { mode, version, release: isRelease } },
      verify: { result: verify },
      "create-release": { result: release },
    },
  });
}

describe("release and publishing authorization", () => {
  it("requires successful exhaustive verification before tagging or publishing", () => {
    expect(condition("create-release")).toBe(true);
    expect(condition("publish")).toBe(true);
    for (const overrides of [
      { plan: "failure" },
      { verify: "failure" },
      { verify: "cancelled" },
      { verify: "skipped" },
      { mode: "pr" },
      { mode: "none" },
      { ref: "refs/heads/other" },
      { cancelled: true },
    ]) {
      expect(condition("create-release", overrides), JSON.stringify(overrides)).toBe(false);
      expect(condition("publish", overrides), JSON.stringify(overrides)).toBe(false);
    }
    expect(condition("create-release", { isRelease: "" })).toBe(false);
    expect(condition("publish", { version: "" })).toBe(false);
    expect(condition("publish", { release: "failure" })).toBe(false);
  });

  it("only permits the no-new-release publishing path for explicit manual tag retries", () => {
    const manual = { event: "workflow_dispatch", isRelease: "", release: "skipped" };
    expect(condition("publish", manual)).toBe(false);
    expect(condition("publish", { ...manual, tag: "v6.3.1" })).toBe(true);
    expect(condition("publish", { ...manual, event: "pull_request", tag: "v6.3.1" })).toBe(false);
    expect(condition("create-release", { ...manual, tag: "v6.3.1" })).toBe(false);
  });

  it("retains the npm trusted-publisher identity, host, and verified SHA handoff", () => {
    const publish = job("publish");
    expect(publish).toMatch(/^ {4}runs-on: ubuntu-latest$/m);
    expect(publish).toContain("id-token: write");
    expect(publish).toContain("RELEASE_SHA: ${{ needs.ci-plan.outputs.sha }}");
    expect(publish).toContain("RELEASE_VERSION: ${{ needs.ci-plan.outputs.version }}");
    expect(publish).toContain("ref: ${{ env.RELEASE_SHA }}");
    const validationIndex = publish.indexOf("node .release-tools/scripts/release-validation.mjs");
    expect(validationIndex).toBeGreaterThan(-1);
    expect(validationIndex).toBeLessThan(publish.indexOf("uses: ./.github/actions/setup-pnpm"));
    expect(publish).toContain("node .release-tools/scripts/publish-released.mjs");
    expect(publish).toContain("group: supi-npm-publish");
    const release = job("create-release");
    expect(release).toContain("ref: ${{ env.RELEASE_SHA }}");
    expect(release).toContain("fetch-depth: 0");
    expect(release).toContain("node .release-tools/scripts/create-release.mjs");
    for (const body of [publish, release]) {
      expect(body).toContain("ref: ${{ github.sha }}\n          path: .release-tools");
      expect(body).toContain("sparse-checkout: scripts");
    }
  });
});
