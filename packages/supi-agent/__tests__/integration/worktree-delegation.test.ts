import { existsSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { configureDebugRegistry, subscribeDebugPersistence } from "@mrclrchtr/supi-core/debug";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backgroundHarness, task } from "../helpers/background-harness.ts";
import { deadPid, git, lockReasons, repositoryTemplate } from "../helpers/git-fixture.ts";

const sdk = vi.hoisted(() => ({ createAgentSession: vi.fn(), createAgentSessionRuntime: vi.fn() }));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
  ...sdk,
}));

// Every test spawns real Git processes.
vi.setConfig({ testTimeout: 20_000 });

let harness: Awaited<ReturnType<typeof backgroundHarness>> | undefined;
afterEach(async () => {
  vi.useRealTimers();
  await harness?.close();
  harness = undefined;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const copyRepository = repositoryTemplate();

/** Make the parent cwd the main worktree of a repository with linked worktrees `a` to `c`. */
function repository(parent: string): Record<"a" | "b" | "c", string> {
  copyRepository(parent);
  // The harness removes the parent directory on close, so keep the worktrees inside it.
  const worktree = (name: string) => {
    const path = join(parent, `wt-${name}`);
    git(parent, "worktree", "add", "-q", "-b", name, path);
    return realpathSync(path);
  };
  return { a: worktree("a"), b: worktree("b"), c: worktree("c") };
}

const writer = (id: string, cwd?: string) => ({
  id,
  new: { profile: "general", ...(cwd ? { cwd } : {}) },
  instructions: `Inspect ${id} module.`,
});

const streaming = () => harness?.children.filter((child) => child.session.isStreaming) ?? [];

async function setup() {
  harness = await backgroundHarness(sdk);
  return { h: harness, wt: repository(harness.ctx.cwd) };
}

describe("isolated writers under Worktree Claims", () => {
  it("runs two isolated writers in the background, locks their worktrees, and keeps them", async () => {
    const { h, wt } = await setup();
    const started = await h.invoke("agent_run", {
      tasks: [writer("one", wt.a), writer("two", wt.b)],
    });
    expect(started.details).toMatchObject({ mode: "background" });
    await vi.waitFor(() => expect(streaming()).toHaveLength(2));
    const held = lockReasons(h.ctx.cwd);
    expect(held.get(wt.a)).toMatch(/^supi-agent:delegation:/);
    expect(held.get(wt.b)).toMatch(/^supi-agent:delegation:/);

    h.child("one").finish("One done.");
    h.child("two").finish("Two done.");
    await vi.waitFor(() => expect(h.pi.messages.length).toBeGreaterThan(0));
    const result = await h.invoke("agent_result", { batchId: started.details.batchId, wait: true });
    const text = JSON.stringify(result.content);
    expect(text).toContain(`Working directory: ${wt.a}`);
    expect(text).toContain(`Working directory: ${wt.b}`);
    await vi.waitFor(() => expect(lockReasons(h.ctx.cwd).size).toBe(0));
    expect(existsSync(wt.a) && existsSync(wt.b)).toBe(true);
  });

  it("accepts isolated writers next to read-only tasks", async () => {
    const { h, wt } = await setup();
    const started = await h.invoke("agent_run", {
      tasks: [
        writer("one", wt.a),
        task("reader"),
        { ...task("peek"), new: { profile: "explore", cwd: wt.a } },
      ],
    });
    expect(started.details).toMatchObject({ mode: "background" });
    await vi.waitFor(() => expect(streaming()).toHaveLength(3));
  });

  it("runs a foreground writer in the parent's worktree next to an isolated background writer", async () => {
    const { h, wt } = await setup();
    await h.invoke("agent_run", { tasks: [writer("isolated", wt.a)] });
    const foreground = h.invoke("agent_run", { tasks: [writer("local")] });
    await vi.waitFor(() => expect(streaming()).toHaveLength(2));
    h.child("local").finish("Local done.");
    const result = await foreground;
    expect(JSON.stringify(result.content)).toContain(`Working directory: ${h.ctx.cwd}`);
    expect(lockReasons(h.ctx.cwd).get(wt.a)).toMatch(/^supi-agent:delegation:/);
  });

  it("cannot claim one worktree twice through concurrent starts", async () => {
    const { h, wt } = await setup();
    const starts = await Promise.allSettled([
      h.invoke("agent_run", { tasks: [writer("first", wt.a)] }),
      h.invoke("agent_run", { tasks: [writer("second", join(wt.a, "."))] }),
    ]);
    expect(starts.map((start) => start.status).sort()).toEqual(["fulfilled", "rejected"]);
    await vi.waitFor(() => expect(streaming()).toHaveLength(1));
  });
});

describe("Worktree Claim rejections", () => {
  async function expectRejected(tasks: unknown[], pattern: RegExp, mode?: string) {
    await expect(
      harness?.invoke("agent_run", { tasks, ...(mode ? { mode } : {}) }),
    ).rejects.toThrow(pattern);
    expect(harness?.children).toHaveLength(0);
  }

  it("rejects aliases of one worktree within a batch", async () => {
    const { h, wt } = await setup();
    mkdirSync(join(wt.a, "sub"));
    const alias = join(h.ctx.cwd, "alias");
    symlinkSync(wt.a, alias);
    await expectRejected(
      [writer("one", wt.a), writer("dup", wt.a)],
      /dup: .*already claimed by task "one"/,
    );
    await expectRejected(
      [writer("one", wt.a), writer("sub", join(wt.a, "sub"))],
      /sub: .*already claimed/,
    );
    await expectRejected([writer("one", wt.a), writer("alias", alias)], /alias: .*already claimed/);
    expect(lockReasons(h.ctx.cwd).size).toBe(0);
  });

  it("rejects a worktree that an active batch holds", async () => {
    const { h, wt } = await setup();
    await h.invoke("agent_run", { tasks: [writer("first", wt.a)] });
    await vi.waitFor(() => expect(streaming()).toHaveLength(1));
    await expect(
      h.invoke("agent_run", { tasks: [writer("late", join(wt.a, "."))] }),
    ).rejects.toThrow(/late: .*already claimed by task "first"/);
    expect(h.children).toHaveLength(1);
  });

  it.each([
    ["a foreign lock", () => "held by a human", /locked by another tool \(held by a human\)/],
    [
      "a live SuPi lock",
      () => `supi-agent:review:other;pid=${process.pid};started=2026-01-01T00:00:00.000Z`,
      /held by an active SuPi owner \(supi-agent:review:other/,
    ],
    [
      "an orphaned SuPi lock",
      () => `supi-agent:delegation:other;pid=${deadPid()};started=2026-01-01T00:00:00.000Z`,
      /orphaned SuPi lock .*\/supi-agent-cleanup/,
    ],
  ])("rejects %s and releases leases already acquired", async (_name, reason, pattern) => {
    const { h, wt } = await setup();
    const heldBy = reason();
    git(h.ctx.cwd, "worktree", "lock", "--reason", heldBy, wt.b);
    await expectRejected([writer("free", wt.a), writer("locked", wt.b)], pattern);
    expect([...lockReasons(h.ctx.cwd)]).toEqual([[wt.b, heldBy]]);
  });

  it("keeps writers in the parent's worktree to one foreground task", async () => {
    const { h } = await setup();
    await expectRejected([writer("one"), writer("two")], /two: .*already claimed by task "one"/);
    await expectRejected(
      [writer("one"), task("reader")],
      /one: .*single-task foreground.*new\.cwd/,
    );
    await expectRejected([writer("one")], /one: .*background.*new\.cwd/, "background");
    await expectRejected([writer("main", h.ctx.cwd)], /main: .*background.*new\.cwd/, "background");
  });
});

describe("lease lifetime", () => {
  it("holds a lease while its run is stopping and releases it after disposal", async () => {
    const { h, wt } = await setup();
    const start = await h.invoke("agent_run", { tasks: [writer("stopping", wt.a)] });
    await vi.waitFor(() => expect(streaming()).toHaveLength(1));
    const release = h.child("stopping").holdDisposal();
    try {
      await h.invoke("agent_cancel", { batchId: start.details.batchId });
      await vi.waitFor(() => expect(h.child("stopping").runtime.dispose).toHaveBeenCalled());
      expect(lockReasons(h.ctx.cwd).has(wt.a)).toBe(true);
      await expect(h.invoke("agent_run", { tasks: [writer("next", wt.a)] })).rejects.toThrow(
        /already claimed/,
      );
    } finally {
      release();
    }
    await h.invoke("agent_result", { batchId: start.details.batchId, wait: true });
    await vi.waitFor(() => expect(lockReasons(h.ctx.cwd).size).toBe(0));
    expect(existsSync(wt.a)).toBe(true);
  });

  describe("while the holder completes its retrospective", () => {
    let detach: (() => void) | undefined;
    afterEach(() => {
      detach?.();
      configureDebugRegistry({ enabled: false, agentRunRetrospectivesEnabled: false });
    });

    /** Start a writer in `cwd`, publish its task result, and leave it in its retrospective. */
    async function retrospecting(h: NonNullable<typeof harness>, cwd: string) {
      configureDebugRegistry({ enabled: true, agentRunRetrospectivesEnabled: true });
      detach = subscribeDebugPersistence(vi.fn());
      const start = await h.invoke("agent_run", { tasks: [writer("done", cwd)] });
      await vi.waitFor(() => expect(streaming()).toHaveLength(1));
      h.child("done").finish("Done.");
      await vi.waitFor(() => expect(h.child("done").session.prompt).toHaveBeenCalledTimes(2));
      return start;
    }

    it("admits a waiting writer once the holder releases the worktree", async () => {
      const { h, wt } = await setup();
      await retrospecting(h, wt.a);
      let admitted = false;
      const next = h.invoke("agent_run", { tasks: [writer("next", wt.a)] }).then((value) => {
        admitted = true;
        return value;
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(admitted).toBe(false);
      expect(h.children).toHaveLength(1);

      h.child("done").finish("Nothing notable.");
      expect((await next).details).toMatchObject({ mode: "background" });
      await vi.waitFor(() => expect(streaming()).toHaveLength(1));
      expect(h.child("next").session.sessionManager.getCwd()).toBe(wt.a);
      expect(lockReasons(h.ctx.cwd).get(wt.a)).toMatch(/^supi-agent:delegation:/);
    });

    it("rejects a waiting writer with the holder's state when the wait times out", async () => {
      const { h, wt } = await setup();
      await retrospecting(h, wt.a);
      // Fake only timeouts; Git child processes and waitFor keep real time.
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
      const next = h.invoke("agent_run", { tasks: [writer("next", wt.a)] });
      const rejected = expect(next).rejects.toThrow(
        /next: Worktree .* is held by task "done", which has finished .*retry in a few seconds/,
      );
      let settled = false;
      void next.catch(() => undefined).finally(() => (settled = true));
      // Resolution spawns Git, so the wait may start after the first advance.
      await vi.waitFor(async () => {
        await vi.advanceTimersByTimeAsync(60_001);
        expect(settled).toBe(true);
      });
      vi.useRealTimers();
      await rejected;
      expect(h.children).toHaveLength(1);
    });

    it("rejects immediately when another conflict is with a running writer", async () => {
      const { h, wt } = await setup();
      await retrospecting(h, wt.a);
      await h.invoke("agent_run", { tasks: [writer("busy", wt.b)] });
      await vi.waitFor(() => expect(streaming()).toHaveLength(2));
      const error = await h
        .invoke("agent_run", { tasks: [writer("x", wt.a), writer("y", wt.b)] })
        .catch((reason: Error) => reason);
      expect((error as Error).message).toMatch(
        /x: Worktree .* held by task "done", which has finished/,
      );
      expect((error as Error).message).toMatch(/y: .*already claimed by task "busy"/);
    });
  });

  it("releases the lease after a failure", async () => {
    const { h, wt } = await setup();
    await h.invoke("agent_run", { tasks: [writer("failing", wt.a)] });
    await vi.waitFor(() => expect(streaming()).toHaveLength(1));
    h.child("failing").fail();
    await vi.waitFor(() => expect(lockReasons(h.ctx.cwd).size).toBe(0));
    expect(existsSync(wt.a)).toBe(true);
  });

  it("releases the lease after a timeout", async () => {
    harness = await backgroundHarness(sdk, { timeoutMinutes: 1, timeoutProfile: "general" });
    const wt = repository(harness.ctx.cwd);
    // Fake only timeouts; Git child processes and waitFor keep real time.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
    await harness.invoke("agent_run", { tasks: [writer("slow", wt.a)] });
    await vi.waitFor(() => expect(streaming()).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(60_001);
    vi.useRealTimers();
    const cwd = harness.ctx.cwd;
    await vi.waitFor(() => expect(lockReasons(cwd).size).toBe(0));
    expect(existsSync(wt.a)).toBe(true);
  });

  it("releases the lease when the session shuts down", async () => {
    const { h, wt } = await setup();
    const cwd = h.ctx.cwd;
    await h.invoke("agent_run", { tasks: [writer("one", wt.a)] });
    await vi.waitFor(() => expect(streaming()).toHaveLength(1));
    await h.replaceSession();
    expect(lockReasons(cwd).size).toBe(0);
    expect(existsSync(wt.a)).toBe(true);
  });
});

describe("Delegation Follow-Ups under Worktree Claims", () => {
  /** Finish a foreground writer conversation and return its conversation ID. */
  async function savedWriter(id: string, cwd?: string): Promise<string> {
    const h = harness as NonNullable<typeof harness>;
    const running = h.invoke("agent_run", { mode: "foreground", tasks: [writer(id, cwd)] });
    await vi.waitFor(() => expect(streaming()).toHaveLength(1));
    h.child(id).finish(`${id} done.`);
    const result = await running;
    // The lease is released once the run has disposed its resources.
    await vi.waitFor(() => expect(lockReasons(h.ctx.cwd).size).toBe(0));
    return (result.details as { tasks: Array<{ conversationId: string }> }).tasks[0]
      ?.conversationId as string;
  }

  const followUp = (id: string, conversationId: string) => ({
    id,
    continue: { conversationId },
    instructions: `Inspect ${id} module.`,
  });

  it.each(["tui", "rpc"])(
    "%s runs a follow-up in its saved sibling worktree in the background under a lease",
    async (mode) => {
      const { h, wt } = await setup();
      Object.assign(h.ctx, { mode });
      const conversationId = await savedWriter("first", wt.a);

      const started = await h.invoke("agent_run", { tasks: [followUp("again", conversationId)] });
      expect(started.details).toMatchObject({ mode: "background" });
      await vi.waitFor(() => expect(streaming()).toHaveLength(1));
      expect(h.child("again").session.sessionManager.getCwd()).toBe(wt.a);
      expect(lockReasons(h.ctx.cwd).get(wt.a)).toMatch(/^supi-agent:delegation:/);

      h.child("again").finish("Again done.");
      const result = await h.invoke("agent_result", {
        batchId: started.details.batchId,
        wait: true,
      });
      expect(JSON.stringify(result.content)).toContain(`Working directory: ${wt.a}`);
      await vi.waitFor(() => expect(lockReasons(h.ctx.cwd).size).toBe(0));
    },
  );

  it("rejects a follow-up while an active run holds its saved worktree and admits it after release", async () => {
    const { h, wt } = await setup();
    const conversationId = await savedWriter("first", wt.a);
    const holder = await h.invoke("agent_run", { tasks: [writer("holder", join(wt.a, "."))] });
    await vi.waitFor(() => expect(streaming()).toHaveLength(1));
    await expect(
      h.invoke("agent_run", { tasks: [followUp("again", conversationId)] }),
    ).rejects.toThrow(/again: .*already claimed by task "holder"/);
    expect(h.children).toHaveLength(2);

    h.child("holder").finish("Holder done.");
    await h.invoke("agent_result", { batchId: holder.details.batchId, wait: true });
    await vi.waitFor(() => expect(lockReasons(h.ctx.cwd).size).toBe(0));
    await h.invoke("agent_run", { tasks: [followUp("again", conversationId)] });
    await vi.waitFor(() => expect(streaming()).toHaveLength(1));
    expect(lockReasons(h.ctx.cwd).get(wt.a)).toMatch(/^supi-agent:delegation:/);
  });

  it("rejects a follow-up while a foreign lock holds its saved worktree and admits it after unlock", async () => {
    const { h, wt } = await setup();
    const conversationId = await savedWriter("first", wt.a);
    git(h.ctx.cwd, "worktree", "lock", "--reason", "held by a human", wt.a);
    await expect(
      h.invoke("agent_run", { tasks: [followUp("again", conversationId)] }),
    ).rejects.toThrow(/again: .*locked by another tool \(held by a human\)/);
    expect(h.children).toHaveLength(1);

    git(h.ctx.cwd, "worktree", "unlock", wt.a);
    await h.invoke("agent_run", { tasks: [followUp("again", conversationId)] });
    await vi.waitFor(() => expect(streaming()).toHaveLength(1));
    expect(lockReasons(h.ctx.cwd).get(wt.a)).toMatch(/^supi-agent:delegation:/);
  });

  it("keeps a follow-up without a saved cwd to one foreground task in the parent's worktree", async () => {
    const { h } = await setup();
    const conversationId = await savedWriter("first");
    await expect(
      h.invoke("agent_run", { tasks: [followUp("again", conversationId)], mode: "background" }),
    ).rejects.toThrow(/again: .*background.*new\.cwd/);
    await expect(
      h.invoke("agent_run", { tasks: [followUp("again", conversationId), task("reader")] }),
    ).rejects.toThrow(/again: .*single-task foreground/);
    await expect(
      h.invoke("agent_run", { tasks: [followUp("again", conversationId), writer("local")] }),
    ).rejects.toThrow(/local: .*already claimed by task "again"/);
    expect(h.children).toHaveLength(1);

    let returned = false;
    const running = h
      .invoke("agent_run", { tasks: [followUp("again", conversationId)] })
      .then((value) => {
        returned = true;
        return value;
      });
    await vi.waitFor(() => expect(streaming()).toHaveLength(1));
    expect(h.child("again").session.sessionManager.getCwd()).toBe(h.ctx.cwd);
    expect(returned).toBe(false);
    h.child("again").finish("Again done.");
    expect(JSON.stringify((await running).content)).toContain(`Working directory: ${h.ctx.cwd}`);
  });

  it("rejects a follow-up and a new task that target the same worktree in one batch", async () => {
    const { h, wt } = await setup();
    const conversationId = await savedWriter("first", wt.a);
    await expect(
      h.invoke("agent_run", {
        tasks: [followUp("again", conversationId), writer("fresh", join(wt.a, "."))],
      }),
    ).rejects.toThrow(/fresh: .*already claimed by task "again"/);
    expect(h.children).toHaveLength(1);
    expect(lockReasons(h.ctx.cwd).size).toBe(0);
  });
});

describe("writer batches in print and JSON modes", () => {
  it.each(["print", "json"])("%s keeps isolated writers foreground", async (mode) => {
    const { h, wt } = await setup();
    Object.assign(h.ctx, { mode });
    await expect(
      h.invoke("agent_run", { tasks: [writer("one", wt.a)], mode: "background" }),
    ).rejects.toThrow(/TUI or RPC/);
    expect(lockReasons(h.ctx.cwd).size).toBe(0);
    let returned = false;
    const running = h
      .invoke("agent_run", { tasks: [writer("one", wt.a), writer("two", wt.b)] })
      .then((value) => {
        returned = true;
        return value;
      });
    await vi.waitFor(() => expect(streaming()).toHaveLength(2));
    expect(returned).toBe(false);
    h.child("one").finish();
    h.child("two").finish();
    expect((await running).usage?.totalTokens).toBe(30);
  });
});
