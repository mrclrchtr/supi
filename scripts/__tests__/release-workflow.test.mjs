// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub Actions expressions are literal test data.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReleaseFixture } from "./helpers/release-fixture.mjs";

const workflow = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
const releaseJob = workflow.split("\n  release-please:\n")[1].split("\n  publish:\n")[0];
const publishJob = workflow.split("\n  publish:\n")[1];
const steps = publishJob.split(/^ {6}- /m).slice(1);
const identityStep = steps.find((step) => step.startsWith("name: Require release identity\n"));
const identityCommand = identityStep.split("run: |\n")[1].replace(/^ {10}/gm, "");
const checkoutStep = steps.find((step) => step.includes("uses: actions/checkout@"));
const retryStep = steps.find((step) => step.startsWith("name: Resolve retry release\n"));
const retryCommand = retryStep?.split("run: |\n")[1].replace(/^ {10}/gm, "") ?? "exit 99";

function runRetry(fixture, overrides = {}) {
  const output = join(fixture.cwd, "retry-env");
  const log = join(fixture.cwd, "gh-calls");
  const result = spawnSync(
    "bash",
    [
      "-e",
      "-o",
      "pipefail",
      "-c",
      `gh() {
        printf '%s\\n' "$*" >> "$TEST_GH_LOG"
        case "$1" in
          release) printf '%s\\n' "$TEST_GH_RELEASE"; return "$TEST_GH_RELEASE_STATUS" ;;
          api) printf '%s\\n' "$TEST_GH_SHA"; return "$TEST_GH_API_STATUS" ;;
          *) return 1 ;;
        esac
      }
      ${retryCommand}`,
    ],
    {
      cwd: fixture.cwd,
      encoding: "utf8",
      env: {
        ...fixture.env,
        GH_REPO: "mrclrchtr/supi",
        PUBLISH_TAG: "v6.3.1",
        GITHUB_ENV: output,
        TEST_GH_LOG: log,
        TEST_GH_RELEASE: JSON.stringify({ tagName: "v6.3.1", isDraft: false }),
        TEST_GH_RELEASE_STATUS: "0",
        TEST_GH_API_STATUS: "0",
        TEST_GH_SHA: fixture.sha,
        ...overrides,
      },
    },
  );
  return {
    ...result,
    env: existsSync(output)
      ? Object.fromEntries(
          readFileSync(output, "utf8")
            .trim()
            .split("\n")
            .map((line) => line.split("=")),
        )
      : {},
    calls: existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [],
  };
}

function jobCondition(job) {
  return (
    job
      .match(/^ {4}if: >-\n((?: {6}.+\n)+)/m)?.[1]
      .trim()
      .replace(/\s+/g, " ") ?? job.match(/^ {4}if: (.+)$/m)?.[1]
  );
}

describe("release workflow handoff", () => {
  it("allows planned ancestor skips only after every required release dependency succeeds", () => {
    expect(jobCondition(releaseJob)).toBe(
      "!cancelled() && github.event_name == 'push' && github.ref == 'refs/heads/main' && " +
        "needs.actionlint.result == 'success' && needs.conventional-commits.result == 'success' && needs.verify.result == 'success'",
    );
  });
  it("passes root release outputs without a trigger-commit fallback", () => {
    expect(releaseJob).toContain("release_sha: ${{ steps.release.outputs.sha }}");
    expect(releaseJob).toContain("release_version: ${{ steps.release.outputs.version }}");
    expect(publishJob).toContain("RELEASE_SHA: ${{ needs.release-please.outputs.release_sha }}");
    expect(publishJob).toContain(
      "RELEASE_VERSION: ${{ needs.release-please.outputs.release_version }}",
    );
    expect(checkoutStep).toContain("ref: ${{ env.RELEASE_SHA }}");
    expect(releaseJob).toContain("needs: [actionlint, conventional-commits, verify]");
    expect(publishJob).toContain(
      "needs: [release-please, actionlint, conventional-commits, verify]",
    );
  });

  function canPublish({
    event = "push",
    ref = "refs/heads/main",
    tag = "",
    cancelled = false,
    releaseResult = "success",
    created = "true",
    checks = {},
  } = {}) {
    return runInNewContext(jobCondition(publishJob).replace(/needs\.([\w-]+)/g, 'needs["$1"]'), {
      cancelled: () => cancelled,
      github: { event_name: event, ref },
      inputs: { publish_tag: tag },
      needs: {
        "release-please": { result: releaseResult, outputs: { releases_created: created } },
        actionlint: { result: "success" },
        "conventional-commits": { result: "success" },
        verify: { result: "success" },
        ...checks,
      },
    });
  }

  it("only automatically publishes a newly created release on main", () => {
    expect(canPublish()).toBe(true);
    for (const overrides of [
      { created: "false" },
      { releaseResult: "failure" },
      { releaseResult: "skipped" },
      { event: "pull_request", tag: "v6.3.1" },
      { ref: "refs/heads/other" },
      { cancelled: true },
    ]) {
      expect(canPublish(overrides), JSON.stringify(overrides)).toBe(false);
    }
  });

  it("only retries an explicitly selected tag from a manual run on main", () => {
    const manual = { event: "workflow_dispatch", releaseResult: "skipped", created: "" };
    expect(canPublish(manual)).toBe(false);
    expect(canPublish({ ...manual, tag: "v6.3.1" })).toBe(true);
    expect(canPublish({ ...manual, tag: "v6.3.1", ref: "refs/heads/other" })).toBe(false);
    expect(canPublish({ ...manual, tag: "v6.3.1", cancelled: true })).toBe(false);
  });

  it.each(["actionlint", "conventional-commits", "verify"])(
    "requires %s to succeed before either publication path",
    (check) => {
      for (const result of ["failure", "cancelled", "skipped", ""]) {
        const checks = { [check]: { result } };
        expect(canPublish({ checks })).toBe(false);
        expect(
          canPublish({
            event: "workflow_dispatch",
            tag: "v6.3.1",
            releaseResult: "skipped",
            checks,
          }),
        ).toBe(false);
      }
    },
  );

  it("resolves manual retries before the shared checkout and validation guards", () => {
    expect(workflow).toContain("      publish_tag:");
    expect(retryStep).toContain("if: github.event_name == 'workflow_dispatch'");
    expect(retryStep).toContain("PUBLISH_TAG: ${{ inputs.publish_tag }}");
    expect(retryStep).toContain("GH_TOKEN: ${{ github.token }}");
    expect(retryStep).toContain("GH_REPO: ${{ github.repository }}");
    // npm trusted publishing requires the official GitHub-hosted runner.
    expect(publishJob).toMatch(/^ {4}runs-on: ubuntu-latest$/m);
    expect(steps[0]).toBe(retryStep);
    expect(steps[1]).toBe(identityStep);
    expect(steps[2]).toBe(checkoutStep);
    expect(steps[3]).toContain("run: node scripts/release-validation.mjs");
    expect(steps[4]).toContain("uses: ./.github/actions/setup-pnpm");
    expect(steps[5]).toContain("run: node scripts/publish-released.mjs");
    expect(steps).toHaveLength(6);
  });

  it.each([
    ["RELEASE_SHA", undefined],
    ["RELEASE_SHA", ""],
    ["RELEASE_SHA", "main"],
    ["RELEASE_SHA", "abc1234"],
    ["RELEASE_VERSION", undefined],
    ["RELEASE_VERSION", ""],
  ])("stops before checkout when %s is %j", (field, value) => {
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", identityCommand], {
      encoding: "utf8",
      env: {
        ...process.env,
        RELEASE_SHA: "a".repeat(40),
        RELEASE_VERSION: "6.3.1",
        [field]: value,
      },
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`${field}: expected`);
    expect(result.stdout).toContain("actual");
  });

  it.each(["automatic", "manual"])(
    "%s publication uses the release checkout, not an older trigger or newer main",
    (mode) => {
      const fixture = createReleaseFixture({ version: "6.3.0" });
      try {
        const triggerSha = fixture.sha;
        for (const path of [
          "package.json",
          "packages/a-app/package.json",
          "packages/z-core/package.json",
        ]) {
          fixture.updateJson(path, { version: "6.3.1" });
        }
        fixture.writeJson(".release-please-manifest.json", { ".": "6.3.1" });
        fixture.writeJson("packages/release-only/package.json", {
          name: "@mrclrchtr/release-only",
          version: "6.3.1",
          private: false,
        });
        const releaseSha = fixture.commit();
        fixture.git([
          "-c",
          "tag.gpgsign=false",
          "tag",
          "-a",
          "v6.3.1",
          "-m",
          "Release",
          releaseSha,
        ]);
        rmSync(join(fixture.cwd, "packages/release-only"), { recursive: true });
        fixture.writeJson("packages/main-only/package.json", {
          name: "@mrclrchtr/main-only",
          version: "6.4.0",
        });
        const mainSha = fixture.commit();
        fixture.git(["checkout", "--detach", triggerSha]);

        const env = {
          ...fixture.env,
          RELEASE_SHA: mode === "manual" ? "" : releaseSha,
          RELEASE_VERSION: mode === "manual" ? "" : "6.3.1",
          GITHUB_SHA: mode === "manual" ? mainSha : triggerSha,
        };
        if (mode === "manual") {
          const retry = runRetry(fixture, {
            TEST_GH_SHA: fixture.git(["rev-parse", "v6.3.1^{commit}"]),
          });
          expect(retry.status, retry.stderr).toBe(0);
          Object.assign(env, retry.env);
        }
        const guard = spawnSync("bash", ["-e", "-o", "pipefail", "-c", identityCommand], {
          cwd: fixture.cwd,
          env,
          encoding: "utf8",
        });
        expect(guard.status, guard.stderr).toBe(0);
        const ref = checkoutStep.match(/^ {10}ref: (.+)$/m)[1];
        fixture.git([
          "checkout",
          "--detach",
          ref.replace("${{ env.RELEASE_SHA }}", env.RELEASE_SHA),
        ]);
        expect(fixture.git(["rev-parse", "HEAD"])).toBe(releaseSha);
        expect(fixture.git(["rev-parse", "main"])).toBe(mainSha);

        const validation = fixture.run(env, { validateOnly: true });
        expect(validation.status, validation.stderr).toBe(0);
        expect(fixture.events()).toEqual([]);
        const publication = fixture.run(env);
        expect(publication.status, publication.stderr).toBe(0);
        expect(
          fixture
            .events()
            .filter((event) => event.args[0] === "publish")
            .map((event) => ({
              name: event.manifest.name,
              version: event.manifest.version,
            })),
        ).toEqual([
          { name: "@mrclrchtr/release-only", version: "6.3.1" },
          { name: "@mrclrchtr/test-core", version: "6.3.1" },
          { name: "@mrclrchtr/test-app", version: "6.3.1" },
        ]);
      } finally {
        fixture.cleanup();
      }
    },
  );
});

describe("manual publish retry identity", () => {
  let fixture;
  beforeEach(() => {
    fixture = createReleaseFixture();
  });
  afterEach(() => {
    fixture.cleanup();
  });

  it("resolves a published release tag to an exact commit and derives the version", () => {
    const result = runRetry(fixture);
    expect(result.status, result.stderr).toBe(0);
    expect(result.env).toEqual({ RELEASE_SHA: fixture.sha, RELEASE_VERSION: "6.3.1" });
    expect(result.calls).toEqual([
      "release view v6.3.1 --json tagName,isDraft",
      "api repos/mrclrchtr/supi/commits/v6.3.1 --jq .sha",
    ]);
  });

  it("accepts a versioned prerelease tag", () => {
    const tag = "v7.0.0-rc.1+build.2";
    const result = runRetry(fixture, {
      PUBLISH_TAG: tag,
      TEST_GH_RELEASE: JSON.stringify({ tagName: tag, isDraft: false }),
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.env.RELEASE_VERSION).toBe("7.0.0-rc.1+build.2");
  });

  it.each(["", "main", "6.3.1", "--help", "v6.3.1/other", "v6.3.1\n", "$(touch injected)"])(
    "rejects tag %j before any GitHub API access",
    (tag) => {
      const result = runRetry(fixture, { PUBLISH_TAG: tag });
      expect(result.status).toBe(1);
      expect(result.env).toEqual({});
      expect(result.calls).toEqual([]);
      expect(existsSync(join(fixture.cwd, "injected"))).toBe(false);
    },
  );

  it.each([
    { tagName: "v6.3.1", isDraft: true },
    { tagName: "v6.3.0", isDraft: false },
    { tagName: "v6.3.1" },
  ])("rejects an unpublished or mismatched release %j", (release) => {
    const result = runRetry(fixture, { TEST_GH_RELEASE: JSON.stringify(release) });
    expect(result.status).toBe(1);
    expect(result.env).toEqual({});
    expect(result.calls).toHaveLength(1);
  });

  it.each([
    { TEST_GH_RELEASE_STATUS: "1" },
    { TEST_GH_API_STATUS: "1" },
    { TEST_GH_RELEASE: "not JSON" },
    { TEST_GH_SHA: "main" },
    { TEST_GH_SHA: `${"a".repeat(40)}\nINJECTED=true` },
  ])("stops before checkout when release resolution fails: %j", (overrides) => {
    const result = runRetry(fixture, overrides);
    expect(result.status).not.toBe(0);
    expect(result.env).toEqual({});
  });
});
