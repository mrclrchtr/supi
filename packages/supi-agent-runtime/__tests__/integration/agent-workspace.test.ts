import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireWorktreeLease,
  createDisposableWorkspace,
  listAgentWorkspaces,
  removeAgentWorkspace,
  resolveWorktreeRoot,
  runDependencyBootstrap,
} from "../../src/workspace.ts";
import { deadPid, git, lockReasons, repositoryTemplate } from "../helpers/git-fixture.ts";

// Every test spawns real Git processes.
vi.setConfig({ testTimeout: 20_000 });

function gitBuffer(cwd: string, ...args: string[]): Buffer {
  return execFileSync("git", args, { cwd, stdio: "pipe" });
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

const copyRepository = repositoryTemplate();

describe("Agent Workspaces", () => {
  let repo: string;
  let scratch: string;

  beforeEach(() => {
    scratch = realpathSync(mkdtempSync(join(tmpdir(), "supi-aw-test-")));
    repo = join(scratch, "repo");
    mkdirSync(repo);
    copyRepository(repo);
  });

  afterEach(() => rmSync(scratch, { recursive: true, force: true }));

  function addLinkedWorktree(name: string): string {
    const path = join(scratch, name);
    git(repo, "worktree", "add", "--detach", path, "HEAD");
    return realpathSync(path);
  }

  describe("worktree root resolution", () => {
    it("resolves a subdirectory and a symlink alias to the same canonical root", async () => {
      const linked = addLinkedWorktree("linked");
      mkdirSync(join(linked, "nested"));
      symlinkSync(linked, join(scratch, "alias"));

      await expect(resolveWorktreeRoot(join(linked, "nested"))).resolves.toBe(linked);
      await expect(resolveWorktreeRoot(join(scratch, "alias", "nested"))).resolves.toBe(linked);
    });
  });

  describe("disposable workspaces", () => {
    it("stages a patch over the base commit, verifies it, and releases the workspace", async () => {
      const base = git(repo, "rev-parse", "HEAD");
      writeFileSync(join(repo, "tracked.txt"), "changed\n");
      const patch = gitBuffer(repo, "diff", "--binary", "HEAD");
      git(repo, "checkout", "--", "tracked.txt");

      const workspace = await createDisposableWorkspace({
        owner: "review",
        state: { repositoryRoot: repo, baseCommit: base, patch, expectedHash: sha256(patch) },
        readPatch: async (cwd) => gitBuffer(cwd, "diff", "--binary", "--cached", base),
      });

      expect(workspace.receipt).toEqual({
        baseCommit: base,
        observedHead: base,
        expectedHash: sha256(patch),
        observedHash: sha256(patch),
        patchApplied: true,
      });
      expect(readFileSync(join(workspace.cwd, "tracked.txt"), "utf8")).toBe("changed\n");
      expect(git(workspace.cwd, "diff", "--cached", "--name-only")).toBe("tracked.txt");
      expect(lockReasons(repo).get(workspace.cwd)).toMatch(
        new RegExp(`^supi-agent:review:[^;]+;pid=${process.pid};started=`),
      );

      await expect(workspace.release()).resolves.toBeUndefined();
      expect(existsSync(dirname(workspace.cwd))).toBe(false);
      expect(git(repo, "worktree", "list", "--porcelain")).not.toContain(workspace.cwd);
    });

    it("verifies a clean checkout through the caller's patch reader", async () => {
      const base = git(repo, "rev-parse", "HEAD");
      const expected = Buffer.from("caller evidence");

      const workspace = await createDisposableWorkspace({
        owner: "review",
        state: { repositoryRoot: repo, baseCommit: base, expectedHash: sha256(expected) },
        readPatch: async () => expected,
      });
      try {
        expect(workspace.receipt).toMatchObject({
          observedHash: sha256(expected),
          patchApplied: false,
        });
        expect(git(workspace.cwd, "status", "--porcelain")).toBe("");
      } finally {
        await workspace.release();
      }
    });

    it("rejects a patch whose hash does not match before creating a worktree", async () => {
      const base = git(repo, "rev-parse", "HEAD");
      const before = git(repo, "worktree", "list", "--porcelain");

      await expect(
        createDisposableWorkspace({
          owner: "review",
          state: {
            repositoryRoot: repo,
            baseCommit: base,
            patch: Buffer.from("anything"),
            expectedHash: "0".repeat(64),
          },
          readPatch: async () => Buffer.alloc(0),
        }),
      ).rejects.toMatchObject({ code: "patch-mismatch" });
      expect(git(repo, "worktree", "list", "--porcelain")).toBe(before);
    });

    it("rejects and removes a workspace whose re-read patch does not match", async () => {
      const base = git(repo, "rev-parse", "HEAD");
      const before = git(repo, "worktree", "list", "--porcelain");

      await expect(
        createDisposableWorkspace({
          owner: "review",
          state: { repositoryRoot: repo, baseCommit: base, expectedHash: "0".repeat(64) },
          readPatch: async () => Buffer.from("different"),
        }),
      ).rejects.toMatchObject({ code: "hash-mismatch" });
      expect(git(repo, "worktree", "list", "--porcelain")).toBe(before);
    });

    it("rejects and removes a workspace whose checkout is not exactly the base commit", async () => {
      // An abbreviated id checks out the right commit, but not the exact expected head.
      const base = git(repo, "rev-parse", "--short", "HEAD");
      const before = git(repo, "worktree", "list", "--porcelain");

      await expect(
        createDisposableWorkspace({
          owner: "review",
          state: { repositoryRoot: repo, baseCommit: base, expectedHash: sha256(Buffer.alloc(0)) },
          readPatch: async () => Buffer.alloc(0),
        }),
      ).rejects.toMatchObject({ code: "unexpected-head" });
      expect(git(repo, "worktree", "list", "--porcelain")).toBe(before);
    });
  });

  describe("leases", () => {
    it("locks a linked worktree for its owner and releases it again", async () => {
      const linked = addLinkedWorktree("linked");
      writeFileSync(join(linked, "work.txt"), "kept\n");

      const lease = await acquireWorktreeLease({ cwd: linked, owner: "delegation" });
      expect(lease.root).toBe(linked);
      expect(lockReasons(repo).get(linked)).toMatch(
        new RegExp(`^supi-agent:delegation:[^;]+;pid=${process.pid};started=`),
      );

      await lease.release();
      expect(lockReasons(repo).has(linked)).toBe(false);
      expect(readFileSync(join(linked, "work.txt"), "utf8")).toBe("kept\n");
      // Once released, the worktree is available to the next lease.
      const next = await acquireWorktreeLease({ cwd: linked, owner: "delegation" });
      await next.release();
    });

    it("leaves no lock when it is aborted while Git writes the lock", async () => {
      const linked = addLinkedWorktree("linked");
      // A Git wrapper that keeps running after `worktree lock` wrote the lock.
      const bin = join(scratch, "bin");
      mkdirSync(bin);
      const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
      writeFileSync(
        join(bin, "git"),
        `#!/bin/sh\n"${realGit}" "$@"\nstatus=$?\n[ "$1 $2" = "worktree lock" ] && sleep 1\nexit $status\n`,
        { mode: 0o755 },
      );
      vi.stubEnv("PATH", `${bin}:${process.env.PATH ?? ""}`);
      const controller = new AbortController();
      try {
        const acquiring = acquireWorktreeLease({
          cwd: linked,
          owner: "delegation",
          signal: controller.signal,
        });
        const settled = acquiring.then(
          () => "resolved",
          () => "rejected",
        );
        await vi.waitFor(() => expect(lockReasons(repo).has(linked)).toBe(true));
        controller.abort();

        await expect(settled).resolves.toBe("rejected");
      } finally {
        vi.unstubAllEnvs();
      }
      expect(lockReasons(repo).has(linked)).toBe(false);
    });

    it("refuses the main worktree", async () => {
      await expect(acquireWorktreeLease({ cwd: repo, owner: "delegation" })).rejects.toMatchObject({
        code: "main-worktree",
      });
    });

    it.each([
      ["a foreign lock", () => "held by a human", "locked-foreign"],
      [
        "a live SuPi lock",
        () => `supi-agent:review:other;pid=${process.pid};started=2026-01-01T00:00:00.000Z`,
        "locked-active",
      ],
      [
        "an orphaned SuPi lock",
        () => `supi-agent:delegation:other;pid=${deadPid()};started=2026-01-01T00:00:00.000Z`,
        "locked-orphaned",
      ],
      [
        "an orphaned legacy Review lock",
        () => `supi-review:other;pid=${deadPid()};started=2026-01-01T00:00:00.000Z`,
        "locked-orphaned",
      ],
    ])("rejects %s and keeps it", async (_name, reason, code) => {
      const linked = addLinkedWorktree("linked");
      const heldBy = reason();
      git(repo, "worktree", "lock", "--reason", heldBy, linked);

      await expect(
        acquireWorktreeLease({ cwd: linked, owner: "delegation" }),
      ).rejects.toMatchObject({ code, heldBy });
      expect(lockReasons(repo).get(linked)).toBe(heldBy);
    });
  });

  describe("inventory and cleanup", () => {
    it("lists only SuPi-marked worktrees with their owner status", async () => {
      const live = addLinkedWorktree("live");
      const orphan = addLinkedWorktree("orphan");
      const legacy = addLinkedWorktree("legacy");
      const foreign = addLinkedWorktree("foreign");
      addLinkedWorktree("unlocked");
      const lease = await acquireWorktreeLease({ cwd: live, owner: "delegation" });
      git(
        repo,
        "worktree",
        "lock",
        "--reason",
        `supi-agent:delegation:x;pid=${deadPid()};started=t`,
        orphan,
      );
      git(repo, "worktree", "lock", "--reason", `supi-review:x;pid=${deadPid()};started=t`, legacy);
      git(repo, "worktree", "lock", "--reason", "not SuPi", foreign);

      const entries = await listAgentWorkspaces(repo);

      expect(entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: live, owner: "delegation", ownerStatus: "active" }),
          expect.objectContaining({ path: orphan, owner: "delegation", ownerStatus: "absent" }),
          expect.objectContaining({ path: legacy, owner: "review", ownerStatus: "absent" }),
        ]),
      );
      expect(entries).toHaveLength(3);
      await lease.release();
    });

    it("removes a disposable workspace but only unlocks a caller-provided worktree", async () => {
      const base = git(repo, "rev-parse", "HEAD");
      const empty = Buffer.alloc(0);
      const disposable = await createDisposableWorkspace({
        owner: "review",
        state: { repositoryRoot: repo, baseCommit: base, expectedHash: sha256(empty) },
        readPatch: async () => empty,
      });
      const linked = addLinkedWorktree("linked");
      await acquireWorktreeLease({ cwd: linked, owner: "delegation" });

      await expect(removeAgentWorkspace(repo, disposable.cwd)).resolves.toEqual({
        path: disposable.cwd,
        outcome: "removed",
      });
      await expect(removeAgentWorkspace(repo, linked)).resolves.toEqual({
        path: linked,
        outcome: "unlocked",
      });

      expect(existsSync(dirname(disposable.cwd))).toBe(false);
      expect(existsSync(linked)).toBe(true);
      expect(await listAgentWorkspaces(repo)).toEqual([]);
    });

    it("removes a disposable workspace created under a different temporary directory", async () => {
      const otherTemp = join(scratch, "other-tmp");
      mkdirSync(otherTemp);
      const empty = Buffer.alloc(0);
      vi.stubEnv("TMPDIR", otherTemp);
      const disposable = await createDisposableWorkspace({
        owner: "review",
        state: {
          repositoryRoot: repo,
          baseCommit: git(repo, "rev-parse", "HEAD"),
          expectedHash: sha256(empty),
        },
        readPatch: async () => empty,
      }).finally(() => vi.unstubAllEnvs());

      expect(await listAgentWorkspaces(repo)).toEqual([
        expect.objectContaining({ path: disposable.cwd, disposable: true }),
      ]);
      await expect(removeAgentWorkspace(repo, disposable.cwd)).resolves.toEqual({
        path: disposable.cwd,
        outcome: "removed",
      });
      expect(existsSync(disposable.parentDirectory)).toBe(false);
    });

    it("removes a legacy Review workspace", async () => {
      mkdirSync(join(scratch, "supi-review-workspace-x"));
      const legacy = addLinkedWorktree("supi-review-workspace-x/workspace");
      git(repo, "worktree", "lock", "--reason", `supi-review:x;pid=${deadPid()};started=t`, legacy);

      await expect(removeAgentWorkspace(repo, legacy)).resolves.toEqual({
        path: legacy,
        outcome: "removed",
      });
      expect(existsSync(dirname(legacy))).toBe(false);
    });

    it.each([
      ["a disposable marker", `supi-agent:delegation:x;pid=${deadPid()};started=t;disposable`],
      ["a legacy Review marker", `supi-review:x;pid=${deadPid()};started=t`],
    ])("only unlocks a normal linked worktree with %s", async (_name, reason) => {
      const linked = addLinkedWorktree("linked");
      git(repo, "worktree", "lock", "--reason", reason, linked);

      expect(await listAgentWorkspaces(repo)).toEqual([
        expect.objectContaining({ path: linked, disposable: false }),
      ]);
      await expect(removeAgentWorkspace(repo, linked)).resolves.toEqual({
        path: linked,
        outcome: "unlocked",
      });
      expect(existsSync(linked)).toBe(true);
      expect(lockReasons(repo).has(linked)).toBe(false);
    });

    it("refuses a worktree that is not SuPi-marked", async () => {
      const linked = addLinkedWorktree("linked");

      await expect(removeAgentWorkspace(repo, linked)).resolves.toEqual({
        path: linked,
        outcome: "failed",
        reason: "not-marked",
      });
      expect(existsSync(linked)).toBe(true);
    });
  });

  describe("Dependency Bootstrap", () => {
    it("resolves when the command succeeds and rejects when it fails", async () => {
      await expect(
        runDependencyBootstrap(scratch, `"${process.execPath}" -e "process.exit(0)"`),
      ).resolves.toBeUndefined();
      await expect(
        runDependencyBootstrap(scratch, `"${process.execPath}" -e "process.exit(1)"`),
      ).rejects.toThrow("Dependency Bootstrap failed.");
    });

    it("rejects when it is aborted while running", async () => {
      const controller = new AbortController();
      const run = runDependencyBootstrap(
        scratch,
        `"${process.execPath}" -e "setTimeout(() => {}, 60000)"`,
        controller.signal,
      );
      setTimeout(() => controller.abort(), 50);

      await expect(run).rejects.toThrow("Dependency Bootstrap failed.");
    });
  });
});
