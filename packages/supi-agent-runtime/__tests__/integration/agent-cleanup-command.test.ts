import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as runtimeApi from "../../src/api.ts";
import { acquireWorktreeLease, createDisposableWorkspace } from "../../src/workspace.ts";
import { deadPid, git, lockReasons, repositoryTemplate } from "../helpers/git-fixture.ts";

// Command tests spawn real Git processes.
vi.setConfig({ testTimeout: 20_000 });

type CommandHandler = (args: string, ctx: unknown) => Promise<void>;

const copyRepository = repositoryTemplate();

/** A Pi mock whose `pi.events` is the given bus, so several APIs can share one Pi runtime. */
function piOnBus(eventBus: ReturnType<typeof createEventBus>) {
  const pi = createPiMock();
  pi.events.on = (channel, listener) => eventBus.on(channel, listener);
  pi.events.emit = (channel, data) => eventBus.emit(channel, data);
  return {
    pi,
    api: pi as unknown as ExtensionAPI,
    shutdown: () => pi.emit("session_shutdown", {}, {}),
  };
}

describe("/supi-agent-cleanup registration", () => {
  const shutdowns: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const shutdown of shutdowns.splice(0)) await shutdown();
    vi.resetModules();
  });

  it("registers one command per Pi runtime across owners and bundled runtime copies", async () => {
    const eventBus = createEventBus();
    const agent = piOnBus(eventBus);
    const review = piOnBus(eventBus);
    shutdowns.push(agent.shutdown);
    vi.resetModules();
    const bundledCopy = (await import("../../src/api.ts")) as typeof runtimeApi;

    runtimeApi.registerAgentCleanupCommand(agent.api);
    bundledCopy.registerAgentCleanupCommand(review.api);
    runtimeApi.registerAgentCleanupCommand(agent.api);

    expect([...agent.pi.commands.keys(), ...review.pi.commands.keys()]).toEqual([
      "supi-agent-cleanup",
    ]);

    // A reload replaces the runtime state, so the next owner registers the command again.
    await agent.shutdown();
    shutdowns.pop();
    const reloaded = piOnBus(eventBus);
    shutdowns.push(reloaded.shutdown);
    bundledCopy.registerAgentCleanupCommand(reloaded.api);
    expect([...reloaded.pi.commands.keys()]).toEqual(["supi-agent-cleanup"]);
  });
});

describe("/supi-agent-cleanup", () => {
  let scratch: string;
  let repo: string;
  const temporaryParents: string[] = [];

  beforeEach(() => {
    scratch = realpathSync(mkdtempSync(join(tmpdir(), "supi-agent-cleanup-test-")));
    repo = join(scratch, "repo");
    mkdirSync(repo);
    copyRepository(repo);
  });

  afterEach(() => {
    for (const parent of temporaryParents.splice(0))
      rmSync(parent, { recursive: true, force: true });
    rmSync(scratch, { recursive: true, force: true });
  });

  function linkedWorktree(name: string, reason?: string): string {
    const path = join(scratch, name);
    git(repo, "worktree", "add", "--detach", path, "HEAD");
    if (reason) git(repo, "worktree", "lock", "--reason", reason, path);
    return realpathSync(path);
  }

  async function orphanedDisposableWorkspace(): Promise<string> {
    const empty = Buffer.alloc(0);
    const workspace = await createDisposableWorkspace({
      owner: "review",
      state: {
        repositoryRoot: repo,
        baseCommit: git(repo, "rev-parse", "HEAD"),
        expectedHash: createHash("sha256").update(empty).digest("hex"),
      },
      readPatch: async () => empty,
    });
    temporaryParents.push(workspace.parentDirectory);
    // Simulate a Review whose process exited before it released the workspace.
    git(repo, "worktree", "unlock", workspace.cwd);
    git(
      repo,
      "worktree",
      "lock",
      "--reason",
      `supi-agent:review:x;pid=${deadPid()};started=t;disposable`,
      workspace.cwd,
    );
    return workspace.cwd;
  }

  async function runCleanup(confirm: () => Promise<boolean>) {
    const pi = createPiMock();
    runtimeApi.registerAgentCleanupCommand(pi as unknown as ExtensionAPI);
    const handler = pi.getCommandHandler("supi-agent-cleanup") as CommandHandler | undefined;
    if (!handler) throw new Error("/supi-agent-cleanup was not registered.");
    const base = makeCtx({ cwd: repo });
    const ctx = makeCtx({ cwd: repo, hasUI: true, ui: { ...base.ui, confirm: vi.fn(confirm) } });
    await handler("", ctx);
    await pi.emit("session_shutdown", {}, {});
    return { pi, ctx };
  }

  it("removes orphaned disposable workspaces, only unlocks caller worktrees, and keeps active owners", async () => {
    const disposable = await orphanedDisposableWorkspace();
    const caller = linkedWorktree("caller", `supi-agent:delegation:x;pid=${deadPid()};started=t`);
    writeFileSync(join(caller, "work.txt"), "kept\n");
    const legacyParent = realpathSync(mkdtempSync(join(tmpdir(), "supi-review-workspace-")));
    temporaryParents.push(legacyParent);
    const legacy = join(legacyParent, "workspace");
    git(repo, "worktree", "add", "--detach", legacy, "HEAD");
    git(repo, "worktree", "lock", "--reason", `supi-review:x;pid=${deadPid()};started=t`, legacy);
    const active = linkedWorktree("active");
    const lease = await acquireWorktreeLease({ cwd: active, owner: "delegation" });

    const { pi } = await runCleanup(async () => true);

    expect(existsSync(disposable)).toBe(false);
    expect(existsSync(dirname(disposable))).toBe(false);
    expect(existsSync(legacyParent)).toBe(false);
    expect(existsSync(join(caller, "work.txt"))).toBe(true);
    const reasons = lockReasons(repo);
    expect(reasons.has(caller)).toBe(false);
    expect(reasons.get(active)).toBe(lease.marker);
    const report = String(pi.messages[0]?.content);
    expect(report).toContain(active);
    expect(report).toMatch(/active/i);
    await lease.release();
  });

  it("changes nothing when the user declines", async () => {
    const disposable = await orphanedDisposableWorkspace();
    const caller = linkedWorktree("caller", `supi-agent:delegation:x;pid=${deadPid()};started=t`);

    const { pi } = await runCleanup(async () => false);

    expect(existsSync(disposable)).toBe(true);
    expect(lockReasons(repo).has(caller)).toBe(true);
    expect(pi.messages).toEqual([]);
  });
});
