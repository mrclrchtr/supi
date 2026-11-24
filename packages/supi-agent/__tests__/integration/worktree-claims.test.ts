import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveWorktreeClaims } from "../../src/delegation/worktree-claims.ts";
import { git, repositoryTemplate } from "../helpers/git-fixture.ts";

// Every test spawns real Git processes.
vi.setConfig({ testTimeout: 20_000 });

const copyRepository = repositoryTemplate();

describe("Worktree Claim resolution", () => {
  let scratch: string;
  let main: string;
  let linkedA: string;
  let linkedB: string;

  beforeEach(() => {
    scratch = realpathSync(mkdtempSync(join(tmpdir(), "supi-worktree-claims-")));
    main = join(scratch, "main");
    mkdirSync(main);
    copyRepository(main);
    linkedA = join(scratch, "a");
    linkedB = join(scratch, "b");
    git(main, "worktree", "add", "-q", "-b", "a", linkedA);
    git(main, "worktree", "add", "-q", "-b", "b", linkedB);
    mkdirSync(join(linkedA, "sub"));
  });
  afterEach(() => rmSync(scratch, { recursive: true, force: true }));

  const writer = (taskId: string, cwd: string) => ({ taskId, readOnly: false, cwd });

  it("takes session claims on the main and the parent's worktree and leases elsewhere", async () => {
    await expect(
      resolveWorktreeClaims({
        parentCwd: linkedA,
        tasks: [
          writer("parent", join(linkedA, "sub")),
          writer("main", main),
          writer("other", linkedB),
          { taskId: "reader", readOnly: true, cwd: linkedB },
        ],
        activeClaims: new Map(),
      }),
    ).resolves.toEqual({
      claims: [
        { taskId: "parent", root: linkedA, kind: "session" },
        { taskId: "main", root: main, kind: "session" },
        { taskId: "other", root: linkedB, kind: "lease" },
      ],
    });
  });

  it("rejects a subdirectory and a symlink alias of one worktree within a batch", async () => {
    const alias = join(scratch, "alias");
    symlinkSync(linkedA, alias);

    await expect(
      resolveWorktreeClaims({
        parentCwd: main,
        tasks: [
          writer("first", linkedA),
          writer("sub", join(linkedA, "sub")),
          writer("alias", alias),
        ],
        activeClaims: new Map(),
      }),
    ).resolves.toEqual({
      conflicts: [
        {
          taskId: "sub",
          root: linkedA,
          heldBy: 'task "first" of this batch',
          heldByActiveBatch: false,
        },
        {
          taskId: "alias",
          root: linkedA,
          heldBy: 'task "first" of this batch',
          heldByActiveBatch: false,
        },
      ],
    });
  });

  it("rejects a worktree that an active claim holds", async () => {
    await expect(
      resolveWorktreeClaims({
        parentCwd: main,
        tasks: [writer("late", join(linkedB, "."))],
        activeClaims: new Map([[linkedB, "an active run"]]),
      }),
    ).resolves.toEqual({
      conflicts: [
        { taskId: "late", root: linkedB, heldBy: "an active run", heldByActiveBatch: true },
      ],
    });
  });

  it("lets read-only tasks share a claimed worktree", async () => {
    await expect(
      resolveWorktreeClaims({
        parentCwd: main,
        tasks: [writer("writer", linkedA), { taskId: "reader", readOnly: true, cwd: linkedA }],
        activeClaims: new Map([[linkedB, "an active run"]]),
      }),
    ).resolves.toEqual({ claims: [{ taskId: "writer", root: linkedA, kind: "lease" }] });
  });

  it("takes a session claim on a parent directory outside Git", async () => {
    const plain = join(scratch, "plain");
    mkdirSync(plain);

    await expect(
      resolveWorktreeClaims({
        parentCwd: plain,
        tasks: [writer("w", plain)],
        activeClaims: new Map(),
      }),
    ).resolves.toEqual({ claims: [{ taskId: "w", root: plain, kind: "session" }] });
  });
});
