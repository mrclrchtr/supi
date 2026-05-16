import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getCommitShow,
  getDiff,
  getLocalBranches,
  getMergeBase,
  getRecentCommits,
  getUncommittedDiff,
} from "../src/git.ts";

const GIT_TEST_TIMEOUT_MS = 15_000;

function scrubGitEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env };
  for (const key of Object.keys(next)) {
    if (key.startsWith("GIT_")) delete next[key];
  }
  return next;
}

function execGit(command: string, cwd: string, quiet = false): string {
  return execSync(command, {
    cwd,
    env: scrubGitEnv(process.env),
    encoding: "utf-8",
    stdio: quiet ? "ignore" : ["ignore", "pipe", "pipe"],
  });
}

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "supi-review-git-test-"));
  execGit("git init", dir, true);
  execGit("git config user.email test@test.com", dir, true);
  execGit("git config user.name Test", dir, true);
  execGit("git config commit.gpgsign false", dir, true);
  execGit("git config core.hooksPath /dev/null", dir, true);
  execGit("git branch -m main", dir, true);
  return dir;
}

describe("git functions", () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempRepo();
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it(
    "getLocalBranches returns main first",
    async () => {
      fs.writeFileSync(path.join(repo, "a.txt"), "hello");
      execGit("git add . && git commit -m 'init'", repo);
      const branches = await getLocalBranches(repo);
      expect(branches.length).toBeGreaterThan(0);
      expect(branches[0]).toBe("main");
    },
    GIT_TEST_TIMEOUT_MS,
  );

  it(
    "getRecentCommits returns commits",
    async () => {
      fs.writeFileSync(path.join(repo, "a.txt"), "hello");
      execGit("git add . && git commit -m 'first'", repo);
      fs.writeFileSync(path.join(repo, "b.txt"), "world");
      execGit("git add . && git commit -m 'second'", repo);

      const commits = await getRecentCommits(repo, 10);
      expect(commits).toHaveLength(2);
      expect(commits[0]?.subject).toBe("second");
      expect(commits[1]?.subject).toBe("first");
    },
    GIT_TEST_TIMEOUT_MS,
  );

  it(
    "getCommitShow returns patch",
    async () => {
      fs.writeFileSync(path.join(repo, "a.txt"), "hello");
      execGit("git add . && git commit -m 'first'", repo);

      const sha = execGit("git rev-parse HEAD", repo).trim();
      const show = await getCommitShow(repo, sha);
      expect(show).toContain("hello");
    },
    GIT_TEST_TIMEOUT_MS,
  );

  it(
    "getUncommittedDiff captures staged and unstaged",
    async () => {
      fs.writeFileSync(path.join(repo, "a.txt"), "hello");
      execGit("git add . && git commit -m 'init'", repo);

      fs.writeFileSync(path.join(repo, "a.txt"), "world");
      const unstaged = await getUncommittedDiff(repo);
      expect(unstaged).toContain("Unstaged");
      expect(unstaged).toContain("world");

      execGit("git add .", repo);
      const staged = await getUncommittedDiff(repo);
      expect(staged).toContain("Staged");
      expect(staged).toContain("world");
    },
    GIT_TEST_TIMEOUT_MS,
  );

  it(
    "getDiff returns diff from base",
    async () => {
      fs.writeFileSync(path.join(repo, "a.txt"), "hello");
      execGit("git add . && git commit -m 'init'", repo, true);
      execGit("git checkout -b feature", repo, true);

      fs.writeFileSync(path.join(repo, "b.txt"), "world");
      execGit("git add . && git commit -m 'feature'", repo, true);

      const baseSha = await getMergeBase(repo, "main");
      expect(baseSha).toBeTruthy();
      const diff = await getDiff(repo, baseSha ?? "");
      expect(diff).toContain("b.txt");
    },
    GIT_TEST_TIMEOUT_MS,
  );

  it(
    "getMergeBase returns undefined for unrelated branch",
    async () => {
      fs.writeFileSync(path.join(repo, "a.txt"), "hello");
      execGit("git add . && git commit -m 'init'", repo, true);
      execGit("git checkout --orphan orphan", repo, true);
      fs.writeFileSync(path.join(repo, "b.txt"), "world");
      execGit("git add . && git commit -m 'orphan'", repo, true);

      const base = await getMergeBase(repo, "main");
      expect(base).toBeUndefined();
    },
    GIT_TEST_TIMEOUT_MS,
  );
});
