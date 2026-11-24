import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as runtimeApi from "../../src/api.ts";

// Command tests spawn real Git processes.
vi.setConfig({ testTimeout: 20_000 });

type CommandHandler = (args: string, ctx: unknown) => Promise<void>;

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

/** A PID that belonged to a process that has already exited. */
function deadPid(): number {
  const child = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
  if (!child.pid) throw new Error("Could not spawn a short-lived process.");
  return child.pid;
}

function lockReasons(cwd: string): Map<string, string> {
  const reasons = new Map<string, string>();
  let path: string | undefined;
  for (const line of git(cwd, "worktree", "list", "--porcelain").split("\n")) {
    if (line.startsWith("worktree ")) path = realpathSync(line.slice("worktree ".length));
    if (line.startsWith("locked ") && path) reasons.set(path, line.slice("locked ".length));
  }
  return reasons;
}

function extensionApi(eventBus: ReturnType<typeof createEventBus>) {
  const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
  const commands: string[] = [];
  const api = {
    on(event: string, handler: (...args: unknown[]) => unknown) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerCommand: (name: string) => commands.push(name),
    registerMessageRenderer: vi.fn(),
    events: {
      on: (channel: string, listener: (data: unknown) => void) => eventBus.on(channel, listener),
      emit: (channel: string, data: unknown) => eventBus.emit(channel, data),
    },
  } as unknown as ExtensionAPI;
  return {
    api,
    commands,
    async shutdown() {
      for (const handler of handlers.get("session_shutdown") ?? []) await handler({}, {});
    },
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
    const agent = extensionApi(eventBus);
    const review = extensionApi(eventBus);
    shutdowns.push(agent.shutdown);
    vi.resetModules();
    const bundledCopy = (await import("../../src/api.ts")) as typeof runtimeApi;

    runtimeApi.registerAgentCleanupCommand(agent.api);
    bundledCopy.registerAgentCleanupCommand(review.api);
    runtimeApi.registerAgentCleanupCommand(agent.api);

    expect([...agent.commands, ...review.commands]).toEqual(["supi-agent-cleanup"]);

    // A reload replaces the runtime state, so the next owner registers the command again.
    await agent.shutdown();
    shutdowns.pop();
    const reloaded = extensionApi(eventBus);
    shutdowns.push(reloaded.shutdown);
    bundledCopy.registerAgentCleanupCommand(reloaded.api);
    expect(reloaded.commands).toEqual(["supi-agent-cleanup"]);
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
    git(repo, "init");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "Test");
    git(repo, "config", "commit.gpgsign", "false");
    git(repo, "config", "core.hooksPath", "/dev/null");
    writeFileSync(join(repo, "tracked.txt"), "base\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "base");
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
    const workspace = await runtimeApi.createDisposableWorkspace({
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
      `supi-agent:review:x;pid=${deadPid()};started=t`,
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
    const lease = await runtimeApi.acquireWorktreeLease({ cwd: active, owner: "delegation" });

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
