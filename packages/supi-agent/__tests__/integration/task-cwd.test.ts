import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backgroundHarness } from "../helpers/background-harness.ts";

const sdk = vi.hoisted(() => ({ createAgentSession: vi.fn(), createAgentSessionRuntime: vi.fn() }));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
  ...sdk,
}));

let harness: Awaited<ReturnType<typeof backgroundHarness>> | undefined;
let outside: string | undefined;
afterEach(async () => {
  await harness?.close();
  if (outside) await rm(outside, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function git(cwd: string, ...args: string[]) {
  execFileSync("git", ["-C", cwd, ...args], { stdio: "ignore" });
}

/** Make the parent cwd a Git repository with one sibling worktree. */
async function repositoryWithWorktree(parentCwd: string): Promise<string> {
  git(parentCwd, "init", "-q");
  await writeFile(join(parentCwd, "README.md"), "parent\n");
  git(parentCwd, "add", "README.md");
  git(parentCwd, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init");
  // The harness removes the parent directory on close, so keep the worktree inside it.
  const worktree = join(parentCwd, "sibling-worktree");
  git(parentCwd, "worktree", "add", "-q", "-b", "sibling", worktree);
  return realpath(worktree);
}

const childCwd = (index: number) =>
  harness?.children[index]?.session.sessionManager.getCwd() as string | undefined;

describe("agent_run task cwd", () => {
  it("runs a new conversation in a sibling worktree and keeps it for follow-ups", async () => {
    harness = await backgroundHarness(sdk);
    const worktree = await repositoryWithWorktree(harness.ctx.cwd);

    const firstRun = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [
        { id: "wt", new: { profile: "explore", cwd: worktree }, instructions: "Inspect it." },
      ],
    });
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
    expect(childCwd(0)).toBe(worktree);
    expect(harness.children[0]?.session.prompt.mock.calls[0]?.[0]).toContain(
      `Your tools run in ${worktree}. This overrides any other working directory`,
    );
    harness.children[0]?.finish("Done.");
    const first = await firstRun;
    const conversationId = (first.details as { tasks: Array<{ conversationId: string }> }).tasks[0]
      ?.conversationId;

    const followUp = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [{ id: "wt-2", continue: { conversationId }, instructions: "Check more." }],
    });
    await vi.waitFor(() => expect(harness?.children[1]?.session.isStreaming).toBe(true));
    expect(childCwd(1)).toBe(worktree);
    harness.children[1]?.finish("Done again.");
    await followUp;
  });

  it("rejects relative paths and directories outside the parent repository before starting", async () => {
    harness = await backgroundHarness(sdk);
    await repositoryWithWorktree(harness.ctx.cwd);
    outside = await mkdtemp(join(tmpdir(), "supi-task-cwd-outside-"));
    await mkdir(join(outside, "project"));

    for (const cwd of ["relative/path", join(outside, "project"), join(outside, "missing")]) {
      await expect(
        harness.invoke("agent_run", {
          mode: "foreground",
          tasks: [{ id: "bad", new: { profile: "explore", cwd }, instructions: "Inspect it." }],
        }),
      ).rejects.toThrow(/Task cwd/);
    }
    expect(harness.children).toHaveLength(0);
  });
});
