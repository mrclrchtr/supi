import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readReviewDiff, resolveReviewSnapshot } from "../../src/git.ts";

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

  it("uses the Git worktree root when invoked from a repository subdirectory", async () => {
    const nested = join(cwd, "packages", "child");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(cwd, "a.txt"), "changed at root\n");
    writeFileSync(join(cwd, "outside.txt"), "untracked at root\n");

    const snapshot = await resolveReviewSnapshot(nested, { kind: "working-tree" });

    expect(snapshot?.changes.map((change) => change.path)).toEqual(["a.txt", "outside.txt"]);
    if (!snapshot) return;
    await expect(readReviewDiff(nested, snapshot, "a.txt")).resolves.toContain("+changed at root");
  });

  it("reviews committed and uncommitted current work against a base commit", async () => {
    const baseCommit = git(cwd, "rev-parse", "HEAD");
    writeFileSync(join(cwd, "a.txt"), "committed\n");
    writeFileSync(join(cwd, "branch.txt"), "branch\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-m", "branch change");
    writeFileSync(join(cwd, "a.txt"), "dirty\n");
    writeFileSync(join(cwd, "untracked.txt"), "untracked\n");

    const snapshot = await resolveReviewSnapshot(cwd, {
      kind: "working-tree",
      baseCommit,
    });

    expect(snapshot?.changes).toEqual([
      { status: "M", path: "a.txt", additions: 1, deletions: 1 },
      { status: "A", path: "branch.txt", additions: 1, deletions: 0 },
      { status: "A", path: "untracked.txt", additions: 1, deletions: 0 },
    ]);
    expect(snapshot?.target).toMatchObject({
      kind: "working-tree",
      requestedBaseCommit: baseCommit,
      mergeBaseCommit: baseCommit,
    });
    if (!snapshot) return;

    const fullDiff = await readReviewDiff(cwd, snapshot);
    expect(fullDiff).toContain("+dirty");
    expect(fullDiff).toContain("+branch");
    expect(fullDiff).toContain("+untracked");
  });

  it("compares a base-tracked path directly when HEAD deleted and the worktree recreated it", async () => {
    const baseCommit = git(cwd, "rev-parse", "HEAD");
    git(cwd, "rm", "a.txt");
    git(cwd, "commit", "-m", "delete a");
    writeFileSync(join(cwd, "a.txt"), "base\n");

    await expect(
      resolveReviewSnapshot(cwd, { kind: "working-tree", baseCommit }),
    ).resolves.toBeUndefined();

    writeFileSync(join(cwd, "a.txt"), "recreated differently\n");
    const snapshot = await resolveReviewSnapshot(cwd, { kind: "working-tree", baseCommit });

    expect(snapshot?.changes).toEqual([{ status: "M", path: "a.txt", additions: 1, deletions: 1 }]);
    if (!snapshot) return;
    const diff = await readReviewDiff(cwd, snapshot, "a.txt");
    expect(diff).toContain("-base");
    expect(diff).toContain("+recreated differently");
    expect(diff).not.toContain("deleted file mode");
  });

  it("handles file-directory transitions in a base-aware working tree", async () => {
    writeFileSync(join(cwd, "node"), "old shape\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-m", "add file shape");
    const baseCommit = git(cwd, "rev-parse", "HEAD");
    unlinkSync(join(cwd, "node"));
    mkdirSync(join(cwd, "node"));
    writeFileSync(join(cwd, "node", "child.txt"), "new shape\n");
    git(cwd, "add", "-A");
    git(cwd, "commit", "-m", "replace file with directory");

    const changed = await resolveReviewSnapshot(cwd, { kind: "working-tree", baseCommit });
    expect(changed?.changes.map((change) => [change.status, change.path])).toEqual([
      ["D", "node"],
      ["A", "node/child.txt"],
    ]);

    rmSync(join(cwd, "node"), { recursive: true });
    writeFileSync(join(cwd, "node"), "old shape\n");
    await expect(
      resolveReviewSnapshot(cwd, { kind: "working-tree", baseCommit }),
    ).resolves.toBeUndefined();
  });

  it("resolves comparison and commit targets from the worktree root", async () => {
    const baseCommit = git(cwd, "rev-parse", "HEAD");
    writeFileSync(join(cwd, "a.txt"), "committed from root\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-m", "root change");
    const commit = git(cwd, "rev-parse", "HEAD");
    const nested = join(cwd, "packages", "child");
    mkdirSync(nested, { recursive: true });

    for (const target of [
      { kind: "comparison" as const, baseCommit },
      { kind: "commit" as const, commit },
    ]) {
      const snapshot = await resolveReviewSnapshot(nested, target);
      expect(snapshot?.changes.map((change) => change.path)).toEqual(["a.txt"]);
      if (!snapshot) continue;
      await expect(readReviewDiff(nested, snapshot, "a.txt")).resolves.toContain(
        "+committed from root",
      );
    }
  });

  it("ignores real-index membership when comparing HEAD to the filesystem", async () => {
    git(cwd, "rm", "--cached", "a.txt");

    await expect(resolveReviewSnapshot(cwd, { kind: "working-tree" })).resolves.toBeUndefined();
  });

  it("ignores real-index assume-unchanged flags", async () => {
    git(cwd, "update-index", "--assume-unchanged", "a.txt");
    writeFileSync(join(cwd, "a.txt"), "changed despite flag\n");

    const snapshot = await resolveReviewSnapshot(cwd, { kind: "working-tree" });
    expect(snapshot?.changes.map((change) => change.path)).toEqual(["a.txt"]);
    expect(snapshot?.diffHash).toMatch(/^[0-9a-f]{64}$/);
    if (snapshot) {
      await expect(readReviewDiff(cwd, snapshot, "a.txt")).resolves.toContain(
        "+changed despite flag",
      );
    }
  });

  it("reviews the net filesystem state rather than staged and unstaged layers", async () => {
    writeFileSync(join(cwd, "a.txt"), "staged\n");
    git(cwd, "add", "a.txt");
    writeFileSync(join(cwd, "a.txt"), "base\n");

    await expect(resolveReviewSnapshot(cwd, { kind: "working-tree" })).resolves.toBeUndefined();
  });

  it("hashes the exact deterministic tracked-plus-untracked patch bytes", async () => {
    writeFileSync(join(cwd, "a.txt"), "tracked change\n");
    writeFileSync(join(cwd, "new.txt"), "untracked change\n");
    const snapshot = await resolveReviewSnapshot(cwd, { kind: "working-tree" });
    expect(snapshot).toBeDefined();
    if (!snapshot) return;

    const fullDiff = await readReviewDiff(cwd, snapshot);
    const expected = createHash("sha256").update(fullDiff, "utf8").digest("hex");

    expect(snapshot.diffHash).toBe(expected);
  });

  it("includes non-ignored untracked files in the snapshot diff and stats", async () => {
    writeFileSync(join(cwd, "new.txt"), "first\nsecond\n");

    const snapshot = await resolveReviewSnapshot(cwd, { kind: "working-tree" });

    expect(snapshot?.changes).toEqual([
      { status: "A", path: "new.txt", additions: 2, deletions: 0 },
    ]);
    expect(snapshot?.diffHash).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot).not.toHaveProperty("diffText");
    expect(snapshot?.stats).toEqual({ files: 1, additions: 2, deletions: 0 });
    if (!snapshot) return;
    const diff = await readReviewDiff(cwd, snapshot, "new.txt");
    expect(diff).toContain("new file mode");
    expect(diff).toContain("+first");
  });

  it("includes an untracked binary file as a binary patch", async () => {
    writeFileSync(join(cwd, "asset.bin"), Buffer.from([0, 1, 2, 3]));

    const snapshot = await resolveReviewSnapshot(cwd, { kind: "working-tree" });

    expect(snapshot?.diffHash).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot?.changes).toEqual([
      { status: "A", path: "asset.bin", additions: null, deletions: null },
    ]);
    if (snapshot) {
      const diff = await readReviewDiff(cwd, snapshot, "asset.bin");
      expect(diff).toContain("asset.bin");
      expect(diff).toMatch(/GIT binary patch|Binary files/);
    }
  });

  it("reconciles rename status and numstat using the after-side path", async () => {
    writeFileSync(
      join(cwd, "a.txt"),
      `${Array.from({ length: 20 }, (_, index) => index).join("\n")}\n`,
    );
    git(cwd, "add", ".");
    git(cwd, "commit", "-m", "expand fixture");
    const baseCommit = git(cwd, "rev-parse", "HEAD");
    git(cwd, "mv", "a.txt", "renamed.txt");
    writeFileSync(
      join(cwd, "renamed.txt"),
      `${readFileSync(join(cwd, "renamed.txt"), "utf8")}extra\n`,
    );
    git(cwd, "add", ".");
    git(cwd, "commit", "-m", "rename fixture");

    const snapshot = await resolveReviewSnapshot(cwd, { kind: "comparison", baseCommit });

    expect(snapshot?.changes).toEqual([
      {
        status: expect.stringMatching(/^R\d+$/),
        previousPath: "a.txt",
        path: "renamed.txt",
        additions: 1,
        deletions: 0,
      },
    ]);
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

    expect(snapshot?.changes.map((change) => change.path)).toEqual(["side.txt"]);
    if (snapshot)
      await expect(readReviewDiff(cwd, snapshot, "side.txt")).resolves.toContain("+side");
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

      expect(snapshot?.changes).toEqual([
        { status: "A", path: "root.txt", additions: 1, deletions: 0 },
      ]);
      if (snapshot) {
        await expect(readReviewDiff(rootRepo, snapshot, "root.txt")).resolves.toContain("+root");
      }
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
  });
});
