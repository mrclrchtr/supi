import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentRunRegistry } from "@mrclrchtr/supi-agent-runtime/api";
import { getAgentRunRegistry } from "@mrclrchtr/supi-agent-runtime/api";
import type { BackgroundHarness } from "@mrclrchtr/supi-test-utils/background";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  finding,
  reviewerInputs,
  reviewHarness,
  submitReview,
  task,
  text,
  waitForReviewers,
} from "../helpers/background-review.ts";
import { reviewWorktrees } from "../helpers/git.ts";

const sdk = vi.hoisted(() => ({ createAgentSession: vi.fn(), createAgentSessionRuntime: vi.fn() }));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
  ...sdk,
}));

vi.setConfig({ testTimeout: 30_000 });

let harness: BackgroundHarness | undefined;
let restore: (() => void) | undefined;
afterEach(async () => {
  restore?.();
  restore = undefined;
  await harness?.close();
  harness = undefined;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

async function start(review: Record<string, unknown> = {}, ids = ["alpha", "beta"]) {
  harness = await reviewHarness(sdk, review);
  const started = await harness.invoke("review_run", {
    mode: "background",
    tasks: ids.map((id) => task(id)),
  });
  await waitForReviewers(harness, ids.length);
  return { current: harness, batchId: (started.details as { batchId: string }).batchId };
}

const reviewersStopped = (current: BackgroundHarness) =>
  vi.waitFor(() => {
    for (const child of current.children) expect(child.runtime.dispose).toHaveBeenCalled();
  });

const statuses = (result: { details?: unknown }) =>
  (result.details as { tasks: { taskId: string; status: string }[] }).tasks.map(
    ({ taskId, status }) => [taskId, status],
  );

describe("stopping a Background Review", () => {
  it("cancels the addressed Review only, repeatably, and keeps its results collectable", async () => {
    const { current, batchId } = await start();
    const other = await current.invoke("review_run", {
      mode: "background",
      tasks: [task("gamma")],
    });
    await waitForReviewers(current, 3);
    await submitReview(sdk, current, "alpha", [finding]);
    await vi.waitFor(() => expect(current.child("alpha").runtime.dispose).toHaveBeenCalled());

    const stopped = await current.invoke("agent_cancel", { batchId });
    expect(text(stopped)).toContain("Stop requested.");
    expect(text(stopped)).toContain("agent_result");
    await vi.waitFor(() => expect(current.child("beta").runtime.dispose).toHaveBeenCalled());
    expect(current.child("gamma").session.isStreaming).toBe(true);
    await vi.waitFor(() => expect(reviewWorktrees(current.ctx.cwd)).toHaveLength(1));

    const repeated = await current.invoke("agent_cancel", { batchId });
    expect(text(repeated)).toContain("No active work remains.");
    expect(text(repeated)).toContain("agent_result");

    // A canceled Review sends no Completion Notice and so starts no parent turn.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(current.pi.messages).toHaveLength(0);
    expect(current.turnsStarted).toBe(0);

    const collected = await current.invoke("agent_result", { batchId, wait: true });
    expect(statuses(collected)).toEqual([
      ["alpha", "completed"],
      ["beta", "canceled"],
    ]);
    expect(text(collected)).toContain("Frozen value is wrong");
    expect(collected.usage?.totalTokens).toBe(15);

    const afterCollection = await current.invoke("agent_cancel", { batchId });
    expect(text(afterCollection)).not.toContain("agent_result");

    await submitReview(sdk, current, "gamma");
    const gamma = await current.invoke("agent_result", {
      batchId: (other.details as { batchId: string }).batchId,
      wait: true,
    });
    expect(statuses(gamma)).toEqual([["gamma", "completed"]]);
  });

  it("stops on parent abort and holds notices until a user prompt", async () => {
    harness = await reviewHarness(sdk);
    const current = harness;
    const parent = await current.beginParent();
    const started = await current.invoke("review_run", {
      mode: "background",
      tasks: [task("alpha")],
    });
    const batchId = (started.details as { batchId: string }).batchId;
    await waitForReviewers(current, 1);
    parent.abort();
    await current.endParent(true);
    await reviewersStopped(current);
    await vi.waitFor(() => expect(reviewWorktrees(current.ctx.cwd)).toHaveLength(0));

    // A later Review that completes while delivery is paused waits for a user prompt.
    const later = await current.invoke("review_run", {
      mode: "background",
      tasks: [task("beta")],
    });
    await waitForReviewers(current, 1);
    await submitReview(sdk, current, "beta");
    await vi.waitFor(() => expect(reviewWorktrees(current.ctx.cwd)).toHaveLength(0));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(current.pi.messages).toHaveLength(0);
    await current.pi.emit("input", { type: "input", source: "extension" }, current.ctx);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(current.pi.messages).toHaveLength(0);
    await current.pi.emit("input", { type: "input", source: "interactive" }, current.ctx);
    await vi.waitFor(() => expect(current.pi.messages).toHaveLength(1));
    expect(current.pi.messages[0]).toMatchObject({
      details: { batchId: (later.details as { batchId: string }).batchId },
    });

    const canceled = await current.invoke("agent_result", { batchId, wait: true });
    expect(statuses(canceled)).toEqual([["alpha", "canceled"]]);
  });

  it("keeps running after normal parent completion", async () => {
    harness = await reviewHarness(sdk);
    const current = harness;
    await current.beginParent();
    await current.invoke("review_run", { mode: "background", tasks: [task("alpha")] });
    await waitForReviewers(current, 1);
    await current.endParent();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(current.child("alpha").session.isStreaming).toBe(true);
    expect(reviewWorktrees(current.ctx.cwd)).toHaveLength(1);
    await submitReview(sdk, current, "alpha");
    await vi.waitFor(() => expect(current.turnsStarted).toBe(1));
  });

  it("stops when the parent navigates away from the launch and delivers nothing there", async () => {
    const { current, batchId } = await start();
    current.manager.resetLeaf();
    await current.pi.emit("session_tree", { type: "session_tree" }, current.ctx);
    await reviewersStopped(current);
    await vi.waitFor(() => expect(reviewWorktrees(current.ctx.cwd)).toHaveLength(0));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(current.pi.messages).toHaveLength(0);
    await expect(current.invoke("agent_result", { batchId })).rejects.toThrow(/branch/i);
  });

  it.each([
    {
      name: "session replacement",
      leave: (current: BackgroundHarness) => current.replaceSession(),
    },
    { name: "reload", leave: (current: BackgroundHarness) => current.reopenParent() },
    {
      name: "shutdown",
      leave: (current: BackgroundHarness) =>
        current.pi.emit("session_shutdown", { type: "session_shutdown" }, current.ctx),
    },
  ])("stops on $name and leaves no Review Workspace in Git", async ({ leave }) => {
    const { current, batchId } = await start();
    const cwd = current.ctx.cwd;
    expect(reviewWorktrees(cwd)).toHaveLength(1);
    await leave(current);
    // Shutdown awaits the stopped Reviewer Sessions and the Review Workspace removal.
    for (const child of current.children) expect(child.runtime.dispose).toHaveBeenCalled();
    expect(reviewWorktrees(cwd)).toHaveLength(0);
    expect(current.pi.messages).toHaveLength(0);
    await expect(current.invoke("agent_result", { batchId })).rejects.toThrow(/expired/);
  });

  it("stops only the selected Reviewer Run from /agents", async () => {
    const { current, batchId } = await start();
    const registry: AgentRunRegistry = getAgentRunRegistry(current.pi as never);
    const run = registry
      .snapshot()
      .runs.find((entry) => entry.batchId === batchId && entry.taskId === "alpha");
    expect(run).toBeDefined();
    await expect(registry.stop(run?.runKey as string)).resolves.toBe("accepted");
    await vi.waitFor(() => expect(current.child("alpha").runtime.dispose).toHaveBeenCalled());
    expect(current.child("beta").session.isStreaming).toBe(true);
    expect(reviewWorktrees(current.ctx.cwd)).toHaveLength(1);

    await submitReview(sdk, current, "beta");
    const collected = await current.invoke("agent_result", { batchId, wait: true });
    expect(statuses(collected)).toEqual([
      ["alpha", "canceled"],
      ["beta", "completed"],
    ]);
  });

  it("reports a Review Workspace cleanup warning with its recovery command", async () => {
    const { current, batchId } = await start({}, ["alpha"]);
    const { inputs } = reviewerInputs(sdk, current, "alpha");
    // A read-only directory with content makes `git worktree remove` fail.
    const blocked = join(inputs.cwd, "blocked");
    mkdirSync(blocked);
    writeFileSync(join(blocked, "file.txt"), "pinned\n");
    chmodSync(blocked, 0o555);
    restore = () => chmodSync(blocked, 0o755);

    await current.invoke("agent_cancel", { batchId });
    const collected = await current.invoke("agent_result", { batchId, wait: true });
    expect(text(collected)).toContain("Review Workspace cleanup warning:");
    expect(text(collected)).toContain(`Recovery: git worktree remove --force '${inputs.cwd}'`);
    expect(collected.details).toMatchObject({
      cleanupWarning: { workspacePath: inputs.cwd },
    });
  });
});
