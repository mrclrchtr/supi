import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { git, lockReasons, repositoryTemplate } from "@mrclrchtr/supi-test-utils/git";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backgroundHarness, task } from "../helpers/background-harness.ts";

const sdk = vi.hoisted(() => ({ createAgentSession: vi.fn(), createAgentSessionRuntime: vi.fn() }));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
  ...sdk,
}));

// Every test spawns real Git processes.
vi.setConfig({ testTimeout: 20_000 });

let harness: Awaited<ReturnType<typeof backgroundHarness>> | undefined;
afterEach(async () => {
  const parent = harness?.ctx.cwd;
  await harness?.close();
  harness = undefined;
  // Created worktrees are siblings of the main worktree, outside the harness directory.
  if (parent) {
    for (const name of readdirSync(dirname(parent))) {
      if (name.startsWith(`${basename(parent)}.`)) {
        rmSync(join(dirname(parent), name), { recursive: true, force: true });
      }
    }
  }
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const copyRepository = repositoryTemplate();

const creator = (id: string, worktree: Record<string, string> = {}, profile = "general") => ({
  id,
  new: { profile, worktree },
  instructions: `Inspect ${id} module.`,
});

const streaming = () => harness?.children.filter((child) => child.session.isStreaming) ?? [];

async function setup() {
  harness = await backgroundHarness(sdk);
  copyRepository(harness.ctx.cwd);
  return harness;
}

/** Canonical main worktree; created worktrees are its siblings. */
const main = () => realpathSync((harness as NonNullable<typeof harness>).ctx.cwd);

function siblings(cwd: string): string[] {
  const parent = realpathSync(cwd);
  return readdirSync(dirname(parent))
    .filter((name) => name.startsWith(`${basename(parent)}.`))
    .map((name) => join(dirname(parent), name));
}

const branches = (cwd: string) => git(cwd, "branch", "--format=%(refname:short)").split("\n");

describe("Agent Workspaces created per writer", () => {
  it("creates a leased sibling worktree per writer, runs them in the background, and keeps them", async () => {
    const h = await setup();
    const head = git(h.ctx.cwd, "rev-parse", "HEAD");
    const started = await h.invoke("agent_run", {
      tasks: [creator("one"), creator("two", { branch: "feature/two" })],
    });
    expect(started.details).toMatchObject({ mode: "background" });
    await vi.waitFor(() => expect(streaming()).toHaveLength(2));

    const created = siblings(h.ctx.cwd);
    expect(created).toHaveLength(2);
    const two = `${main()}.feature-two`;
    expect(created).toContain(two);
    expect(git(two, "branch", "--show-current")).toBe("feature/two");
    const one = created.find((path) => path !== two) as string;
    expect(git(one, "branch", "--show-current")).toMatch(/^supi\/one-[0-9a-f]{6}$/);
    for (const path of created) {
      expect(lockReasons(h.ctx.cwd).get(path)).toMatch(/^supi-agent:delegation:/);
      expect(git(path, "rev-parse", "HEAD")).toBe(head);
    }

    h.child("one").finish("One done.");
    h.child("two").finish("Two done.");
    const result = await h.invoke("agent_result", { batchId: started.details.batchId, wait: true });
    const text = JSON.stringify(result.content);
    expect(text).toContain(`Working directory: ${two}`);
    expect(text).toContain(`Branch: feature/two (created from ${head}`);
    await vi.waitFor(() => expect(lockReasons(h.ctx.cwd).size).toBe(0));
    expect(created.every((path) => existsSync(path))).toBe(true);
  });

  it("starts the branch at the requested base and says when the parent has uncommitted changes", async () => {
    const h = await setup();
    const base = git(h.ctx.cwd, "rev-parse", "HEAD");
    git(h.ctx.cwd, "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "later");
    writeFileSync(join(h.ctx.cwd, "tracked.txt"), "dirty\n");

    const result = h.invoke("agent_run", {
      tasks: [creator("pinned", { base, branch: "pinned" })],
      mode: "foreground",
    });
    await vi.waitFor(() => expect(streaming()).toHaveLength(1));
    h.child("pinned").finish("Done.");
    const text = JSON.stringify((await result).content);

    expect(git(`${main()}.pinned`, "rev-parse", "HEAD")).toBe(base);
    expect(text).toContain("uncommitted changes were not copied");
  });

  it("keeps the created worktree for a follow-up, which leases it again", async () => {
    const h = await setup();
    const first = h.invoke("agent_run", {
      tasks: [creator("impl", { branch: "impl" })],
      mode: "foreground",
    });
    await vi.waitFor(() => expect(streaming()).toHaveLength(1));
    h.child("impl").finish("Done.");
    const conversationId = ((await first).details.tasks as Array<{ conversationId: string }>)[0]
      ?.conversationId as string;
    await vi.waitFor(() => expect(lockReasons(h.ctx.cwd).size).toBe(0));

    await h.invoke("agent_run", {
      tasks: [{ id: "again", continue: { conversationId }, instructions: "Continue." }],
    });
    await vi.waitFor(() =>
      expect(lockReasons(h.ctx.cwd).get(`${main()}.impl`)).toMatch(/^supi-agent:delegation:/),
    );
  });

  it("runs the configured Dependency Bootstrap in each created worktree before its task", async () => {
    const h = await setup();
    mkdirSync(join(h.ctx.cwd, ".pi/supi"), { recursive: true });
    writeFileSync(
      join(h.ctx.cwd, ".pi/supi/config.json"),
      JSON.stringify({ agent: { bootstrapCommand: "touch bootstrapped" } }),
    );
    await h.invoke("agent_run", { tasks: [creator("boot", { branch: "boot" })] });
    await vi.waitFor(() => expect(streaming()).toHaveLength(1));
    expect(existsSync(join(`${main()}.boot`, "bootstrapped"))).toBe(true);
  });
});

describe("rejected worktree requests leave nothing behind", () => {
  async function expectRejected(tasks: unknown[], pattern: RegExp) {
    const h = harness as NonNullable<typeof harness>;
    const before = branches(h.ctx.cwd);
    await expect(h.invoke("agent_run", { tasks })).rejects.toThrow(pattern);
    expect(h.children).toHaveLength(0);
    expect(siblings(h.ctx.cwd)).toEqual([]);
    expect(branches(h.ctx.cwd)).toEqual(before);
    expect(lockReasons(h.ctx.cwd).size).toBe(0);
  }

  it("rejects a read-only profile, a combined cwd, an unknown base, and an existing branch", async () => {
    const h = await setup();
    git(h.ctx.cwd, "branch", "taken");
    await expectRejected(
      [creator("reader", {}, "explore")],
      /reader: new\.worktree requires a mutation-capable profile/,
    );
    await expectRejected(
      [{ ...creator("both"), new: { profile: "general", cwd: h.ctx.cwd, worktree: {} } }],
      /both: new\.worktree and new\.cwd exclude each other/,
    );
    await expectRejected(
      [creator("lost", { base: "no-such-ref" })],
      /new\.worktree\.base "no-such-ref" does not name a commit/,
    );
    await expectRejected(
      [creator("ok", { branch: "ok" }), creator("taken", { branch: "taken" })],
      /taken: Could not create its worktree: Branch taken already exists/,
    );
  });

  it("removes every created worktree when the Dependency Bootstrap fails", async () => {
    const h = await setup();
    mkdirSync(join(h.ctx.cwd, ".pi/supi"), { recursive: true });
    writeFileSync(
      join(h.ctx.cwd, ".pi/supi/config.json"),
      JSON.stringify({ agent: { bootstrapCommand: "exit 3" } }),
    );
    await expectRejected(
      [creator("one", { branch: "one" }), task("reader")],
      /one: Configured Dependency Bootstrap failed/,
    );
  });

  it("rejects a batch whose other tasks cannot be admitted before creating worktrees", async () => {
    await setup();
    // A writer in the parent's worktree cannot share a batch, whatever the created worktrees.
    await expectRejected(
      [
        creator("isolated", { branch: "isolated" }),
        { id: "local", new: { profile: "general" }, instructions: "Inspect local module." },
      ],
      /local: .*single-task foreground/,
    );
  });
});
