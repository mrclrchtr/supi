import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReleaseFixture } from "./release-fixture.mjs";

/** Real Git/workflow scripts with only the remote GitHub API replaced by a recording CLI. */
export function createCiFixture() {
  const fixture = createReleaseFixture();
  const repository = "mrclrchtr/supi";
  fixture.writeJson("release-please-config.json", {
    packages: {
      ".": { "extra-files": ["packages/a-app/package.json", "packages/z-core/package.json"] },
    },
  });
  writeFileSync(
    join(fixture.cwd, "CHANGELOG.md"),
    "# Changelog\n\n## [6.3.1](https://example.test) (2026-01-01)\n\n### Fixes\n\n* A release fix\n\n## 6.3.0\n\n* Previous fix\n",
  );
  fixture.git(["add", "release-please-config.json", "CHANGELOG.md"]);
  const sha = fixture.commit();
  fixture.git(["update-ref", "refs/remotes/origin/main", sha]);
  const pr = {
    number: 42,
    user: { login: "mrclrchtr-bot[bot]", type: "Bot" },
    head: {
      ref: "release-please--branches--main--components--supi-workspace",
      sha,
      repo: { full_name: repository },
    },
    base: { ref: "main", sha, repo: { full_name: repository } },
    labels: [{ name: "autorelease: pending" }],
    merged: true,
    merge_commit_sha: sha,
    title: "chore: release 6.3.1",
  };
  const log = join(fixture.cwd, "github-calls.jsonl");
  const gh = join(fixture.cwd, "test-bin", "gh");
  writeFileSync(
    gh,
    `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
const args = process.argv.slice(2);
const endpoint = args[1];
const method = args[args.indexOf("--method") + 1];
const body = args.includes("--input") ? JSON.parse(readFileSync(0, "utf8")) : undefined;
appendFileSync(process.env.TEST_GITHUB_LOG, JSON.stringify({ endpoint, method, body }) + "\\n");
const responses = JSON.parse(process.env.TEST_GITHUB_RESPONSES);
const response = responses[method + " " + endpoint];
if (!response || response.status) {
  console.error("gh: Request failed (HTTP " + (response?.status ?? 500) + ")");
  process.exit(1);
}
if (response.body !== undefined) console.log(JSON.stringify(response.body));
`,
  );
  chmodSync(gh, 0o755);
  const output = join(fixture.cwd, "workflow-output");
  const eventPath = join(fixture.cwd, "event.json");
  const env = {
    ...fixture.env,
    RELEASE_SHA: sha,
    RELEASE_VERSION: "6.3.1",
    RELEASE_PR: "42",
    GITHUB_REPOSITORY: repository,
    GITHUB_SHA: sha,
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "push",
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_OUTPUT: output,
    GITHUB_STEP_SUMMARY: join(fixture.cwd, "summary"),
    TEST_GITHUB_LOG: log,
  };
  return {
    ...fixture,
    sha,
    env,
    pr,
    runScript(script, { event = { after: sha }, responses = {}, overrides = {} } = {}) {
      writeFileSync(eventPath, JSON.stringify(event));
      writeFileSync(output, "");
      writeFileSync(log, "");
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL(`../../${script}`, import.meta.url))],
        {
          cwd: fixture.cwd,
          env: { ...env, TEST_GITHUB_RESPONSES: JSON.stringify(responses), ...overrides },
          encoding: "utf8",
          timeout: 10_000,
        },
      );
      return {
        ...result,
        outputs: Object.fromEntries(
          readFileSync(output, "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => line.split("=")),
        ),
        calls: existsSync(log)
          ? readFileSync(log, "utf8")
              .trim()
              .split("\n")
              .filter(Boolean)
              .map((line) => JSON.parse(line))
          : [],
      };
    },
  };
}
