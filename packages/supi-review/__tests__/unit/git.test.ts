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
  getSnapshotFileContent,
  getSnapshotFileDiff,
  getUncommittedDiff,
} from "../../src/git.ts";

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

  describe("getSnapshotFileDiff", () => {
    it(
      "returns per-file diff for a working tree snapshot",
      async () => {
        fs.writeFileSync(path.join(repo, "a.txt"), "line1\nline2");
        execGit("git add . && git commit -m 'init'", repo, true);

        fs.writeFileSync(path.join(repo, "a.txt"), "line1\nline2\nline3");

        const snapshot = {
          target: { kind: "working-tree" as const },
          title: "Working tree changes",
          changedFiles: ["a.txt"],
          diffText: "",
          stats: { files: 1, additions: 1, deletions: 0 },
        };

        const diff = await getSnapshotFileDiff(repo, snapshot, "a.txt");
        expect(diff).toContain("+line3");
      },
      GIT_TEST_TIMEOUT_MS,
    );

    it(
      "returns per-file diff for a commit snapshot",
      async () => {
        fs.writeFileSync(path.join(repo, "a.txt"), "line1");
        execGit("git add . && git commit -m 'first'", repo, true);
        fs.writeFileSync(path.join(repo, "a.txt"), "line1\nline2");
        execGit("git add . && git commit -m 'second'", repo, true);

        const sha = execGit("git rev-parse HEAD", repo).trim();
        const snapshot = {
          target: { kind: "commit" as const, sha },
          title: "Commit",
          changedFiles: ["a.txt"],
          diffText: "",
          stats: { files: 1, additions: 1, deletions: 0 },
        };

        const diff = await getSnapshotFileDiff(repo, snapshot, "a.txt");
        expect(diff).toContain("+line2");
      },
      GIT_TEST_TIMEOUT_MS,
    );

    it(
      "returns per-file diff for a branch snapshot",
      async () => {
        fs.writeFileSync(path.join(repo, "a.txt"), "line1");
        execGit("git add . && git commit -m 'base'", repo, true);
        execGit("git checkout -b feature", repo, true);
        fs.writeFileSync(path.join(repo, "a.txt"), "line1\nfeature");
        execGit("git add . && git commit -m 'feature'", repo, true);

        const snapshot = {
          target: { kind: "branch" as const, base: "main" },
          title: "Changes vs main",
          changedFiles: ["a.txt"],
          diffText: "",
          stats: { files: 1, additions: 1, deletions: 0 },
        };

        const diff = await getSnapshotFileDiff(repo, snapshot, "a.txt");
        expect(diff).toContain("+feature");
      },
      GIT_TEST_TIMEOUT_MS,
    );
  });

  describe("getSnapshotFileContent", () => {
    it(
      "returns before and after content for a working tree snapshot",
      async () => {
        fs.writeFileSync(path.join(repo, "a.txt"), "original");
        execGit("git add . && git commit -m 'init'", repo, true);

        fs.writeFileSync(path.join(repo, "a.txt"), "modified");

        const snapshot = {
          target: { kind: "working-tree" as const },
          title: "Working tree changes",
          changedFiles: ["a.txt"],
          diffText: "",
          stats: { files: 1, additions: 0, deletions: 0 },
        };

        const before = await getSnapshotFileContent(repo, snapshot, "a.txt", "before");
        const after = await getSnapshotFileContent(repo, snapshot, "a.txt", "after");

        expect(before).toBe("original");
        expect(after).toBe("modified");
      },
      GIT_TEST_TIMEOUT_MS,
    );

    it(
      "returns undefined before for an untracked file",
      async () => {
        fs.writeFileSync(path.join(repo, "untracked.txt"), "new file");

        const snapshot = {
          target: { kind: "working-tree" as const },
          title: "Working tree changes",
          changedFiles: ["untracked.txt"],
          diffText: "",
          stats: { files: 1, additions: 1, deletions: 0 },
        };

        const before = await getSnapshotFileContent(repo, snapshot, "untracked.txt", "before");
        const after = await getSnapshotFileContent(repo, snapshot, "untracked.txt", "after");

        expect(before).toBeUndefined();
        expect(after).toBe("new file");
      },
      GIT_TEST_TIMEOUT_MS,
    );

    it(
      "returns before and after for a commit snapshot",
      async () => {
        fs.writeFileSync(path.join(repo, "a.txt"), "initial");
        execGit("git add . && git commit -m 'first'", repo, true);
        fs.writeFileSync(path.join(repo, "a.txt"), "updated");
        execGit("git add . && git commit -m 'second'", repo, true);

        const sha = execGit("git rev-parse HEAD", repo).trim();
        const snapshot = {
          target: { kind: "commit" as const, sha },
          title: "Commit",
          changedFiles: ["a.txt"],
          diffText: "",
          stats: { files: 1, additions: 0, deletions: 0 },
        };

        const before = await getSnapshotFileContent(repo, snapshot, "a.txt", "before");
        const after = await getSnapshotFileContent(repo, snapshot, "a.txt", "after");

        expect(before).toBe("initial");
        expect(after).toBe("updated");
      },
      GIT_TEST_TIMEOUT_MS,
    );
  });
});
