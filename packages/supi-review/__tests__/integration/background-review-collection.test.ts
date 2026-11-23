import agentExtension from "@mrclrchtr/supi-agent/extension";
import { getAgentRunRegistry } from "@mrclrchtr/supi-agent-runtime/api";
import { getTool } from "@mrclrchtr/supi-test-utils";
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
afterEach(async () => {
  await harness?.close();
  harness = undefined;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

async function start(ids = ["alpha", "beta"], review: Record<string, unknown> = {}) {
  harness = await reviewHarness(sdk, review);
  const started = await harness.invoke("review_run", {
    mode: "background",
    tasks: ids.map((id) => task(id)),
  });
  await waitForReviewers(harness, ids.length);
  return { current: harness, batchId: (started.details as { batchId: string }).batchId };
}

describe("collecting a Background Review", () => {
  it("returns finished task results before completion without the Post-Review Policy", async () => {
    const { current, batchId } = await start();
    await submitReview(sdk, current, "alpha", [finding]);
    await vi.waitFor(() => expect(current.child("alpha").runtime.dispose).toHaveBeenCalled());

    const partial = await current.invoke("agent_result", { batchId });
    const report = text(partial);
    expect(report).toContain("still running");
    expect(report).toContain("## alpha");
    expect(report).toContain("Verdict: ISSUES");
    expect(report).toContain("Frozen value is wrong");
    expect(report).toMatch(/## beta\nReview Mode: change\nStatus: running/);
    expect(report).toContain("Workspace receipt: verified");
    expect(report).not.toContain("Post-Review Policy is");
    expect(partial.details).toMatchObject({
      batchId,
      complete: false,
      taskStates: [
        { taskId: "alpha", mode: "change", status: "completed" },
        { taskId: "beta", mode: "change", status: "running" },
      ],
    });
    expect(partial.usage?.totalTokens).toBe(15);

    // The single Completion Notice still covers the whole Review.
    await submitReview(sdk, current, "beta");
    await vi.waitFor(() => expect(current.pi.messages).toHaveLength(1));
    expect(current.pi.messages[0]).toMatchObject({ details: { taskIds: ["alpha", "beta"] } });

    const complete = await current.invoke("agent_result", { batchId });
    expect(text(complete)).toContain("## alpha");
    expect(text(complete)).toContain("The configured Post-Review Policy is `verify`");
    // Usage already reported by the partial collection is not reported again.
    expect(complete.usage?.totalTokens).toBe(15);
  });

  it("pages a report collected after the Review Output Artifact expiry window", async () => {
    const { current, batchId } = await start(["alpha"]);
    const long = (index: number) => ({
      ...finding,
      title: `Long finding ${index}`,
      description: `${"detail ".repeat(1_000)}end ${index}.`,
    });
    await submitReview(sdk, current, "alpha", [long(1), long(2)]);
    await vi.waitFor(() => expect(current.pi.messages).toHaveLength(1));

    // The uncollected result outlives the artifact expiry window of 30 minutes.
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 60 * 60 * 1_000);
    const collected = await current.invoke("agent_result", { batchId });
    const output = (collected.details as { output: { artifactId: string; nextOffset?: number } })
      .output;
    expect(output.nextOffset).toBeGreaterThan(0);
    expect(text(collected)).toContain("retrieve every remaining output page with review_output");

    const page = await current.invoke("review_output", {
      artifactId: output.artifactId,
      offset: output.nextOffset,
    });
    expect(text(page)).toContain("end 2.");
  });

  it("returns the same report to repeated and concurrent collections and reports Usage once", async () => {
    const { current, batchId } = await start();
    await submitReview(sdk, current, "alpha", [finding]);
    await submitReview(sdk, current, "beta");
    await vi.waitFor(() => expect(current.pi.messages).toHaveLength(1));

    const concurrent = await Promise.all([
      current.invoke("agent_result", { batchId }, { endTurn: false }),
      current.invoke("agent_result", { batchId }, { endTurn: false }),
    ]);
    await current.endTurn();
    const repeated = await current.invoke("agent_result", { batchId });
    const collections = [...concurrent, repeated];
    const reports = collections.map((result) =>
      text(result).replaceAll(/review-output-[0-9a-f-]+/g, "review-output-id"),
    );
    expect(reports[0]).toContain("## alpha");
    expect(new Set(reports).size).toBe(1);
    const tokens = collections.map((result) => result.usage?.totalTokens ?? 0);
    expect(tokens.reduce((sum, value) => sum + value, 0)).toBe(30);
    expect(tokens[2]).toBe(0);
  });

  it("reports failed and stopped tasks beside completed ones with Usage counted once", async () => {
    const { current, batchId } = await start(["alpha", "beta", "gamma"]);
    await submitReview(sdk, current, "alpha", [finding]);
    const beta = current.child("beta");
    beta.fail();
    // Usable history starts one Submission Recovery turn; its failure keeps the original one.
    await vi.waitFor(() => expect(beta.session.prompt).toHaveBeenCalledTimes(2));
    beta.fail();
    const gamma = current.child("gamma");
    gamma.bill("Inspecting.");
    const registry = getAgentRunRegistry(current.pi as never);
    const run = registry
      .snapshot()
      .runs.find((entry) => entry.batchId === batchId && entry.taskId === "gamma");
    await expect(registry.stop(run?.runKey as string)).resolves.toBe("accepted");

    const collected = await current.invoke("agent_result", { batchId, wait: true });
    const report = text(collected);
    expect(report).toContain("# Review Finished");
    expect(report).toMatch(/## alpha\n[^#]*Verdict: ISSUES/);
    expect(report).toMatch(/## beta\n[^#]*Status: failed/);
    expect(report).toMatch(/## gamma\n[^#]*Status: canceled/);
    expect(report).toContain("Some Review Tasks did not complete.");
    expect(collected.details).toMatchObject({
      tasks: [
        { taskId: "alpha", status: "completed" },
        { taskId: "beta", status: "failed" },
        { taskId: "gamma", status: "canceled" },
      ],
    });
    // alpha 15, beta 15 for its turn plus 15 for recovery, gamma 15 before its stop.
    expect(collected.usage?.totalTokens).toBe(60);
    const repeated = await current.invoke("agent_result", { batchId });
    expect(repeated.usage).toBeUndefined();
  });

  it("runs two Reviews in separate workspaces with separate notices and collections", async () => {
    const { current, batchId: first } = await start(["alpha"]);
    const second = await current.invoke("review_run", {
      mode: "background",
      tasks: [task("beta")],
    });
    const secondId = (second.details as { batchId: string }).batchId;
    await waitForReviewers(current, 2);
    expect(reviewWorktrees(current.ctx.cwd)).toHaveLength(2);
    expect(reviewerInputs(sdk, current, "alpha").inputs.cwd).not.toBe(
      reviewerInputs(sdk, current, "beta").inputs.cwd,
    );

    await submitReview(sdk, current, "beta", [finding]);
    await vi.waitFor(() => expect(current.pi.messages).toHaveLength(1));
    expect(current.pi.messages[0]).toMatchObject({ details: { batchId: secondId } });
    expect(reviewWorktrees(current.ctx.cwd)).toHaveLength(1);
    const collected = await current.invoke("agent_result", { batchId: secondId });
    expect(text(collected)).toContain("## beta");
    expect(text(collected)).not.toContain("## alpha");

    await submitReview(sdk, current, "alpha");
    await vi.waitFor(() => expect(current.pi.messages).toHaveLength(2));
    expect(current.pi.messages[1]).toMatchObject({ details: { batchId: first } });
    const firstReport = await current.invoke("agent_result", { batchId: first });
    expect(text(firstReport)).toContain("## alpha");
    expect(firstReport.usage?.totalTokens).toBe(15);
  });

  it("does not count Reviewer Runs against the Agent Run capacity limit", async () => {
    harness = await reviewHarness(
      sdk,
      {},
      {
        extensions: [agentExtension],
        config: { agent: { maxConcurrentRuns: 1 } },
      },
    );
    const current = harness;
    await current.invoke("review_run", {
      mode: "background",
      tasks: [task("alpha"), task("beta")],
    });
    await waitForReviewers(current, 2);
    const delegated = await current.invoke("agent_run", {
      tasks: [{ id: "one", new: { profile: "explore" }, instructions: "Inspect one module." }],
    });
    expect(delegated.details).toMatchObject({ mode: "background" });
    await waitForReviewers(current, 3);
  });

  it("blocks with wait until every task is terminal and streams per-task state", async () => {
    const { current, batchId } = await start();
    await submitReview(sdk, current, "alpha");
    await vi.waitFor(() => expect(current.child("alpha").runtime.dispose).toHaveBeenCalled());

    const updates: { details?: unknown }[] = [];
    let returned = false;
    const tool = getTool(current.pi, "agent_result") as unknown as {
      execute: (...args: unknown[]) => Promise<{ content: { type: string; text?: string }[] }>;
    };
    const waiting = tool
      .execute(
        "wait",
        { batchId, wait: true },
        undefined,
        (update: { details?: unknown }) => updates.push(update),
        current.ctx,
      )
      .then((result) => {
        returned = true;
        return result;
      });
    await vi.waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]?.details).toMatchObject({
      batchId,
      complete: false,
      taskStates: [
        { taskId: "alpha", status: "completed" },
        { taskId: "beta", status: "running" },
      ],
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(returned).toBe(false);

    await submitReview(sdk, current, "beta");
    const collected = await waiting;
    expect(text(collected)).toContain("# Review Finished");
    expect(text(collected)).toContain("## beta");
  });
});
