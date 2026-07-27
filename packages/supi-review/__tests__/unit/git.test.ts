import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listReviewFiles,
  readReviewDiff,
  readReviewFile,
  resolveReviewSnapshot,
  searchReviewFiles,
} from "../../src/git.ts";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function initializeRepository(cwd: string): void {
  git(cwd, "init");
  git(cwd, "config", "user.email", "test@example.com");
  git(cwd, "config", "user.name", "Test");
  git(cwd, "config", "commit.gpgsign", "false");
  git(cwd, "config", "core.hooksPath", "/dev/null");
}

describe("review targets", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "supi-review-"));
    initializeRepository(cwd);
    writeFileSync(join(cwd, "a.txt"), "base\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-m", "base");
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("ignores real-index membership when comparing HEAD to the filesystem", async () => {
    git(cwd, "rm", "--cached", "a.txt");

    await expect(resolveReviewSnapshot(cwd, { kind: "working-tree" })).resolves.toBeUndefined();
  });

  it("ignores real-index assume-unchanged flags", async () => {
    git(cwd, "update-index", "--assume-unchanged", "a.txt");
    writeFileSync(join(cwd, "a.txt"), "changed despite flag\n");

    const snapshot = await resolveReviewSnapshot(cwd, { kind: "working-tree" });
    expect(snapshot?.changedFiles).toEqual(["a.txt"]);
    expect(snapshot?.diffText).toContain("+changed despite flag");
  });

  it("reviews the net filesystem state rather than staged and unstaged layers", async () => {
    writeFileSync(join(cwd, "a.txt"), "staged\n");
    git(cwd, "add", "a.txt");
    writeFileSync(join(cwd, "a.txt"), "base\n");

    await expect(resolveReviewSnapshot(cwd, { kind: "working-tree" })).resolves.toBeUndefined();
  });

  it("includes non-ignored untracked files in the snapshot diff and stats", async () => {
    writeFileSync(join(cwd, "new.txt"), "first\nsecond\n");

    const snapshot = await resolveReviewSnapshot(cwd, { kind: "working-tree" });

    expect(snapshot?.changedFiles).toEqual(["new.txt"]);
    expect(snapshot?.diffText).toContain("new file mode");
    expect(snapshot?.diffText).toContain("+first");
    expect(snapshot?.stats).toEqual({ files: 1, additions: 2, deletions: 0 });
    if (!snapshot) return;
    await expect(readReviewDiff(cwd, snapshot, "new.txt")).resolves.toContain("new file mode");
  });

  it("lists the current filesystem without deleted or ignored paths", async () => {
    writeFileSync(join(cwd, ".gitignore"), "ignored.txt\n");
    git(cwd, "add", ".gitignore");
    git(cwd, "commit", "-m", "ignore generated files");
    unlinkSync(join(cwd, "a.txt"));
    writeFileSync(join(cwd, "new.txt"), "visible\n");
    writeFileSync(join(cwd, "ignored.txt"), "hidden\n");
    const snapshot = await resolveReviewSnapshot(cwd, { kind: "working-tree" });
    expect(snapshot).toBeDefined();
    if (!snapshot) return;

    const files = await listReviewFiles(cwd, snapshot);

    expect(files).toContain("new.txt");
    expect(files).not.toContain("a.txt");
    expect(files).not.toContain("ignored.txt");
  });

  it("rejects ignored and Git-administrative working-tree reads", async () => {
    writeFileSync(join(cwd, ".gitignore"), ".env\n");
    git(cwd, "add", ".gitignore");
    git(cwd, "commit", "-m", "ignore secrets");
    writeFileSync(join(cwd, ".env"), "ignored fixture\n");
    writeFileSync(join(cwd, "change.txt"), "review me\n");
    const snapshot = await resolveReviewSnapshot(cwd, { kind: "working-tree" });
    expect(snapshot).toBeDefined();
    if (!snapshot) return;

    await expect(readReviewFile(cwd, snapshot, ".env")).rejects.toThrow(/not part/);
    await expect(readReviewFile(cwd, snapshot, ".git/config")).rejects.toThrow(/not part/);
    await expect(readReviewFile(cwd, snapshot, "a.txt")).resolves.toBe("base\n");
  });

  it("includes an untracked binary file as a binary patch", async () => {
    writeFileSync(join(cwd, "asset.bin"), Buffer.from([0, 1, 2, 3]));

    const snapshot = await resolveReviewSnapshot(cwd, { kind: "working-tree" });

    expect(snapshot?.diffText).toContain("asset.bin");
    expect(snapshot?.diffText).toMatch(/GIT binary patch|Binary files/);
  });

  it("reads comparison context from the pinned head tree instead of dirty files", async () => {
    const baseCommit = git(cwd, "rev-parse", "HEAD");
    writeFileSync(join(cwd, "a.txt"), "committed\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-m", "change");
    const snapshot = await resolveReviewSnapshot(cwd, { kind: "comparison", baseCommit });
    expect(snapshot).toBeDefined();
    if (!snapshot) return;
    writeFileSync(join(cwd, "a.txt"), "dirty\n");
    writeFileSync(join(cwd, "untracked.txt"), "dirty-only\n");

    await expect(readReviewFile(cwd, snapshot, "a.txt")).resolves.toBe("committed\n");
    await expect(listReviewFiles(cwd, snapshot)).resolves.not.toContain("untracked.txt");
    await expect(searchReviewFiles(cwd, snapshot, "committed")).resolves.toContain(
      "a.txt:1:committed",
    );
    await expect(searchReviewFiles(cwd, snapshot, "dirty-only")).resolves.toBe("");
  });

  it("lists a merge commit against its first parent", async () => {
    const mainBranch = git(cwd, "branch", "--show-current");
    git(cwd, "checkout", "-b", "side");
    writeFileSync(join(cwd, "side.txt"), "side\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-m", "side");
    git(cwd, "checkout", mainBranch);
    writeFileSync(join(cwd, "main.txt"), "main\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-m", "main");
    git(cwd, "merge", "--no-ff", "side", "-m", "merge");
    const commit = git(cwd, "rev-parse", "HEAD");

    const snapshot = await resolveReviewSnapshot(cwd, { kind: "commit", commit });

    expect(snapshot?.changedFiles).toEqual(["side.txt"]);
    expect(snapshot?.diffText).toContain("+side");
  });

  it("rejects a shallow boundary instead of treating it as a root commit", async () => {
    writeFileSync(join(cwd, "a.txt"), "second\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-m", "second");
    const shallow = mkdtempSync(join(tmpdir(), "supi-review-shallow-"));
    rmSync(shallow, { recursive: true, force: true });
    try {
      execFileSync("git", ["clone", "--depth=1", `file://${cwd}`, shallow], {
        encoding: "utf8",
      });
      const commit = git(shallow, "rev-parse", "HEAD");

      await expect(resolveReviewSnapshot(shallow, { kind: "commit", commit })).rejects.toThrow(
        /parent.*unavailable/i,
      );
    } finally {
      rmSync(shallow, { recursive: true, force: true });
    }
  });

  it("reviews a root commit against the empty tree", async () => {
    const rootRepo = mkdtempSync(join(tmpdir(), "supi-review-root-"));
    try {
      initializeRepository(rootRepo);
      writeFileSync(join(rootRepo, "root.txt"), "root\n");
      git(rootRepo, "add", ".");
      git(rootRepo, "commit", "-m", "root");
      const commit = git(rootRepo, "rev-parse", "HEAD");

      const snapshot = await resolveReviewSnapshot(rootRepo, { kind: "commit", commit });

      expect(snapshot?.changedFiles).toEqual(["root.txt"]);
      expect(snapshot?.diffText).toContain("+root");
      if (!snapshot) return;
      await expect(
        readReviewFile(rootRepo, snapshot, "root.txt", "before"),
      ).resolves.toBeUndefined();
      await expect(readReviewFile(rootRepo, snapshot, "root.txt", "after")).resolves.toBe("root\n");
    } finally {
      rmSync(rootRepo, { recursive: true, force: true });
    }
  });

  it("treats pathspec metacharacters as literal file names", async () => {
    writeFileSync(join(cwd, "*.txt"), "literal\n");
    writeFileSync(join(cwd, "other.txt"), "other\n");
    const snapshot = await resolveReviewSnapshot(cwd, { kind: "working-tree" });
    expect(snapshot).toBeDefined();
    if (!snapshot) return;

    const diff = await readReviewDiff(cwd, snapshot, "*.txt");
    expect(diff).toContain("literal");
    expect(diff).not.toContain("other.txt");
    const search = await searchReviewFiles(cwd, snapshot, "other", "*.txt");
    expect(search).toBe("");
  });

  it("does not read through an intermediate symlink outside the repository", async () => {
    const outside = mkdtempSync(join(tmpdir(), "supi-review-outside-"));
    try {
      writeFileSync(join(outside, "secret.txt"), "secret\n");
      symlinkSync(outside, join(cwd, "escape"), "dir");
      writeFileSync(join(cwd, "touch.txt"), "change\n");
      const snapshot = await resolveReviewSnapshot(cwd, { kind: "working-tree" });
      expect(snapshot).toBeDefined();
      if (!snapshot) return;

      await expect(readReviewFile(cwd, snapshot, "escape/secret.txt")).rejects.toThrow(
        /inside the repository|not part/,
      );
      await expect(searchReviewFiles(cwd, snapshot, "secret", "../outside")).rejects.toThrow(
        /inside the repository/,
      );
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
