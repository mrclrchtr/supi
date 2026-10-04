// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub Actions expressions are literal test data.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../.github/workflows/skills-sync.yml", import.meta.url),
  "utf8",
);
const generateJob = workflow.split("\n  generate:\n")[1].split("\n  commit:\n")[0];
const commitJob = workflow.split("\n  commit:\n")[1];
const renovate = JSON.parse(
  readFileSync(new URL("../../.github/renovate.json", import.meta.url), "utf8"),
);
const temporaryRoots = [];

function command(job, name) {
  const step = job.split(/^ {6}- /m).find((text) => text.startsWith(`name: ${name}\n`));
  return step
    .split("run: |\n")[1]
    .replace(/^ {10}/gm, "")
    .trimEnd();
}

const collect = command(generateJob, "Collect generated changes");
const commit = command(commitJob, "Validate and commit generated changes");
const push = command(commitJob, "Push if the PR head is unchanged");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "supi-skills-workflow-"));
  temporaryRoots.push(root);
  const cwd = join(root, "repo");
  mkdirSync(cwd);
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    RUNNER_TEMP: root,
    GITHUB_OUTPUT: join(root, "output"),
    PATCH_FILE: join(root, "skills.patch"),
  };
  const git = (args) => {
    const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  };
  const write = (path, content) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  };
  git(["init", "-b", "main"]);
  git(["config", "user.name", "Test"]);
  git(["config", "user.email", "test@example.com"]);
  write("skills/engineering/keep/SKILL.md", "Original skill\n");
  write("skills/engineering/remove/SKILL.md", "Removed skill\n");
  write("packages/supi-skill-patches/upstream.json", '{"tag":"v1.0.0"}\n');
  write(".claude-plugin/marketplace.json", '{"plugins":[]}\n');
  write("README.md", "Outside the generated catalog\n");
  write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  git(["add", "."]);
  git(["commit", "-m", "test: initial files"]);
  const sha = git(["rev-parse", "HEAD"]);
  const run = (script, extraEnv = {}) =>
    spawnSync("bash", ["-e", "-o", "pipefail", "-c", script], {
      cwd,
      env: { ...env, ...extraEnv },
      encoding: "utf8",
    });
  return { root, cwd, env, git, write, run, sha };
}

function savePatchAndReset(repo) {
  repo.git(["add", "-A"]);
  writeFileSync(
    repo.env.PATCH_FILE,
    `${repo.git(["diff", "--cached", "--binary", "--full-index"])}\n`,
  );
  repo.git(["reset", "--hard", repo.sha]);
}

function pushFixture() {
  const repo = fixture();
  const branch = "renovate/mattpocock-skills-1.x";
  repo.git(["init", "--bare", join(repo.root, "remote.git")]);
  repo.git(["remote", "add", "origin", join(repo.root, "remote.git")]);
  repo.git(["push", "origin", `HEAD:refs/heads/${branch}`]);
  repo.write("skills/engineering/keep/SKILL.md", "Updated skill\n");
  savePatchAndReset(repo);
  const result = repo.run(commit);
  expect(result.status, result.stderr).toBe(0);
  return {
    ...repo,
    pushEnv: {
      GITHUB_REPOSITORY: "owner/repo",
      PR_NUMBER: "475",
      HEAD_SHA: repo.sha,
      HEAD_BRANCH: branch,
      PR_STATUS: `open ${repo.sha} ${branch}`,
    },
    remoteHead: () => repo.git(["ls-remote", "origin", `refs/heads/${branch}`]).split("\t")[0],
  };
}

// Stub the GitHub API only. The push uses a real local bare repository.
const pushWithApi = `gh() { printf '%s\\n' "$PR_STATUS"; }\n${push}`;

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("skill sync workflow", () => {
  it("limits the path filter to the maintenance package, including its version pin", () => {
    const paths = workflow.match(/^ {4}paths:\n((?: {6}- .+\n)+)/m)[1];
    expect(paths).toBe("      - packages/supi-skill-patches/**\n");
  });

  it("accepts only same-repository Renovate skill PRs with read-only generation", () => {
    expect(workflow).toContain("  pull_request:\n");
    expect(workflow).not.toContain("pull_request_target:");
    expect(workflow).toContain("permissions:\n  contents: read\n");
    expect(generateJob).toContain("github.event.pull_request.user.login == 'renovate[bot]'");
    expect(generateJob).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    );
    expect(generateJob).toContain(
      "startsWith(github.event.pull_request.head.ref, 'renovate/mattpocock-skills-')",
    );
    expect(generateJob).toContain("ref: ${{ github.event.pull_request.head.sha }}");
    expect(generateJob).toContain("persist-credentials: false");
    expect(generateJob).not.toContain("secrets.");
    expect(generateJob).not.toContain("continue-on-error:");
    expect(generateJob.indexOf("uses: ./.github/actions/setup-pnpm")).toBeLessThan(
      generateJob.indexOf("pnpm skills:sync"),
    );
    expect(command(generateJob, "Regenerate and check skills")).toBe(
      "pnpm skills:sync\npnpm skills:check",
    );
  });

  it("transfers only this run's artifact and keeps PR code out of the write-token job", () => {
    expect(commitJob).toContain("needs: generate");
    expect(commitJob).toContain("if: needs.generate.outputs.artifact-id != ''");
    expect(commitJob).toContain("artifact-ids: ${{ needs.generate.outputs.artifact-id }}");
    expect(commitJob).toContain("ref: ${{ env.HEAD_SHA }}");
    expect(commitJob).toContain("persist-credentials: false");
    expect(commitJob).not.toContain("uses: ./");
    expect(commitJob).not.toMatch(/run:.*(?:pnpm|node|npm)/);
    expect(commitJob.indexOf("git commit")).toBeLessThan(
      commitJob.indexOf("uses: actions/create-github-app-token@"),
    );
    expect(commitJob).toContain("private-key: ${{ secrets.MRCLRCHTR_BOT_PRIVATE_KEY }}");
    expect(push).not.toContain("--force");
  });

  it("does not upload or commit when the generated files are unchanged", () => {
    const repo = fixture();
    const result = repo.run(collect);
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(repo.env.PATCH_FILE)).toBe(false);
    expect(existsSync(repo.env.GITHUB_OUTPUT)).toBe(false);
    expect(generateJob).toContain("if: steps.changes.outputs.changed == 'true'");
  });

  it("commits changed, added, and removed output but does not collect other files", () => {
    const repo = fixture();
    repo.write("skills/engineering/keep/SKILL.md", "Updated skill\n");
    repo.write("skills/productivity/new/SKILL.md", "New skill\n");
    rmSync(join(repo.cwd, "skills/engineering/remove"), { recursive: true });
    repo.write("packages/supi-skill-patches/upstream.json", '{"tag":"v1.1.0"}\n');
    repo.write(".claude-plugin/marketplace.json", '{"plugins":["new"]}\n');
    repo.write("README.md", "Unrelated change\n");
    repo.write("pnpm-lock.yaml", "Unrelated lockfile change\n");
    repo.write("unrelated.txt", "Untracked file\n");
    const collected = repo.run(collect);
    expect(collected.status, collected.stderr).toBe(0);
    expect(readFileSync(repo.env.GITHUB_OUTPUT, "utf8")).toBe("changed=true\n");
    repo.git(["reset", "--hard", repo.sha]);
    const committed = repo.run(commit);
    expect(committed.status, committed.stderr).toBe(0);
    expect(repo.git(["diff", "--name-status", repo.sha])).toBe(
      [
        "M\t.claude-plugin/marketplace.json",
        "M\tpackages/supi-skill-patches/upstream.json",
        "M\tskills/engineering/keep/SKILL.md",
        "D\tskills/engineering/remove/SKILL.md",
        "A\tskills/productivity/new/SKILL.md",
      ].join("\n"),
    );
    expect(repo.git(["log", "-1", "--format=%s"])).toBe(
      "fix(skills): regenerate the skill catalog",
    );
    expect(renovate.gitIgnoredAuthors).toContain(repo.git(["log", "-1", "--format=%ae"]));
    expect(repo.run(collect).status).toBe(0);
    expect(repo.git(["diff", "--cached", "--name-only"])).toBe("");
  });

  it.each(["README.md", "pnpm-lock.yaml", ".github/workflows/ci.yml"])(
    "rejects a patch that changes %s",
    (path) => {
      const repo = fixture();
      repo.write(path, "Not generated output\n");
      savePatchAndReset(repo);
      const result = repo.run(commit);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(`Unexpected generated path: ${path}`);
      expect(repo.git(["rev-parse", "HEAD"])).toBe(repo.sha);
    },
  );

  it("rejects a rename from outside the generated output", () => {
    const repo = fixture();
    renameSync(join(repo.cwd, "README.md"), join(repo.cwd, "skills/README.md"));
    savePatchAndReset(repo);
    const result = repo.run(commit);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Unexpected generated path: README.md");
    expect(repo.git(["rev-parse", "HEAD"])).toBe(repo.sha);
  });

  it.each(["skills/link", "skills/[link]"])("rejects the generated symlink %s", (path) => {
    const repo = fixture();
    symlinkSync("../README.md", join(repo.cwd, path));
    savePatchAndReset(repo);
    const result = repo.run(commit);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`Generated path is not a regular file: ${path}`);
    expect(repo.git(["rev-parse", "HEAD"])).toBe(repo.sha);
  });

  it("pushes generated files to the unchanged PR branch", () => {
    const repo = pushFixture();
    const result = repo.run(pushWithApi, repo.pushEnv);
    expect(result.status, result.stderr).toBe(0);
    expect(repo.remoteHead()).toBe(repo.git(["rev-parse", "HEAD"]));
  });

  it.each(["changed", "closed", "renamed"])("does not push when the PR is %s", (state) => {
    const repo = pushFixture();
    const status = {
      changed: `open ${"b".repeat(40)} ${repo.pushEnv.HEAD_BRANCH}`,
      closed: `closed ${repo.sha} ${repo.pushEnv.HEAD_BRANCH}`,
      renamed: `open ${repo.sha} other-branch`,
    }[state];
    const result = repo.run(pushWithApi, { ...repo.pushEnv, PR_STATUS: status });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Skip this commit.");
    expect(repo.remoteHead()).toBe(repo.sha);
  });

  it("does not overwrite a concurrent update after the API check", () => {
    const repo = pushFixture();
    const otherSha = repo.git([
      "commit-tree",
      "HEAD^{tree}",
      "-p",
      repo.sha,
      "-m",
      "fix: concurrent update",
    ]);
    repo.git(["push", "origin", `${otherSha}:refs/heads/${repo.pushEnv.HEAD_BRANCH}`]);
    // The API response still has the old head. Git must reject the stale push.
    const result = repo.run(pushWithApi, repo.pushEnv);
    expect(result.status).not.toBe(0);
    expect(repo.remoteHead()).toBe(otherSha);
  });

  it("requires manual review for both upstream dependency names", () => {
    const rule = renovate.packageRules.find(
      (entry) => entry.description === "Require review for upstream skill synchronization",
    );
    expect(rule.automerge).toBe(false);
    expect(rule.matchPackageNames).toEqual(["mattpocock/skills", "mattpocock-skills"]);
  });
});
