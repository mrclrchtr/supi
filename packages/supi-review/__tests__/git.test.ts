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
} from "../git.ts";

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "supi-review-git-test-"));
  execSync("git init", { cwd: dir });
  execSync("git config user.email test@test.com", { cwd: dir });
  execSync("git config user.name Test", { cwd: dir });
  execSync("git config commit.gpgsign false", { cwd: dir });
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

  it("getLocalBranches returns main first", async () => {
    fs.writeFileSync(path.join(repo, "a.txt"), "hello");
    execSync("git add . && git commit -m 'init'", { cwd: repo });
    const branches = await getLocalBranches(repo);
    expect(branches.length).toBeGreaterThan(0);
    expect(branches[0]).toBe("main");
  });

  it("getRecentCommits returns commits", async () => {
    fs.writeFileSync(path.join(repo, "a.txt"), "hello");
    execSync("git add . && git commit -m 'first'", { cwd: repo });
    fs.writeFileSync(path.join(repo, "b.txt"), "world");
    execSync("git add . && git commit -m 'second'", { cwd: repo });

    const commits = await getRecentCommits(repo, 10);
    expect(commits).toHaveLength(2);
    expect(commits[0]?.subject).toBe("second");
    expect(commits[1]?.subject).toBe("first");
  });

  it("getCommitShow returns patch", async () => {
    fs.writeFileSync(path.join(repo, "a.txt"), "hello");
    execSync("git add . && git commit -m 'first'", { cwd: repo });

    const sha = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf-8" }).trim();
    const show = await getCommitShow(repo, sha);
    expect(show).toContain("hello");
  });

  it("getUncommittedDiff captures staged and unstaged", async () => {
    fs.writeFileSync(path.join(repo, "a.txt"), "hello");
    execSync("git add . && git commit -m 'init'", { cwd: repo });

    fs.writeFileSync(path.join(repo, "a.txt"), "world");
    const unstaged = await getUncommittedDiff(repo);
    expect(unstaged).toContain("Unstaged");
    expect(unstaged).toContain("world");

    execSync("git add .", { cwd: repo });
    const staged = await getUncommittedDiff(repo);
    expect(staged).toContain("Staged");
    expect(staged).toContain("world");
  });

  it("getDiff returns diff from base", async () => {
    fs.writeFileSync(path.join(repo, "a.txt"), "hello");
    execSync("git add . && git commit -m 'init'", { cwd: repo });
    execSync("git checkout -b feature", { cwd: repo });

    fs.writeFileSync(path.join(repo, "b.txt"), "world");
    execSync("git add . && git commit -m 'feature'", { cwd: repo });

    const baseSha = await getMergeBase(repo, "main");
    expect(baseSha).toBeTruthy();
    const diff = await getDiff(repo, baseSha ?? "");
    expect(diff).toContain("b.txt");
  });

  it("getMergeBase returns undefined for unrelated branch", async () => {
    fs.writeFileSync(path.join(repo, "a.txt"), "hello");
    execSync("git add . && git commit -m 'init'", { cwd: repo });
    execSync("git checkout --orphan orphan", { cwd: repo });
    fs.writeFileSync(path.join(repo, "b.txt"), "world");
    execSync("git add . && git commit -m 'orphan'", { cwd: repo });

    const base = await getMergeBase(repo, "main");
    expect(base).toBeUndefined();
  });
});
