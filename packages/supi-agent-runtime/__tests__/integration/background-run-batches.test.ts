import { afterEach, describe, expect, it, vi } from "vitest";
import { ownerHarness } from "../helpers/run-batch-owner.ts";

const sdk = vi.hoisted(() => ({ createAgentSession: vi.fn(), createAgentSessionRuntime: vi.fn() }));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
  ...sdk,
}));
let harness: Awaited<ReturnType<typeof ownerHarness>> | undefined;
afterEach(async () => {
  vi.useRealTimers();
  await harness?.close();
  harness = undefined;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

async function startOne(taskIds = ["one"]) {
  if (!harness) throw new Error("Missing harness.");
  const start = await harness.invoke("test_run", { tasks: taskIds });
  await vi.waitFor(() =>
    expect(harness?.children.filter((child) => child.session.isStreaming)).toHaveLength(
      taskIds.length,
    ),
  );
  return start.details.batchId as string;
}

/** Fake the notice timer so `flushNotices()` can run every pending delivery deterministically. */
function fakeNoticeTimers() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
}

/** Run every pending timer, including a delayed notice, and the microtasks they queue. */
async function flushNotices() {
  await vi.runAllTimersAsync();
}

describe("Background Run Batch ownership", () => {
  it("keeps launch ownership through compaction but stops a batch on an abandoned branch", async () => {
    harness = await ownerHarness(sdk);
    const batchId = await startOne();
    harness.manager.appendCompaction("Summary", null, 100);
    const originalLeaf = harness.manager.getLeafId();
    await harness.pi.emit("session_tree", { type: "session_tree" }, harness.ctx);
    expect(harness.children[0].session.isStreaming).toBe(true);
    harness.manager.resetLeaf();
    await harness.pi.emit("session_tree", { type: "session_tree" }, harness.ctx);
    await vi.waitFor(() => expect(harness?.children[0]?.runtime.dispose).toHaveBeenCalled());
    await expect(harness.invoke("agent_result", { batchId })).rejects.toThrow(/branch/i);
    expect(harness.pi.messages).toHaveLength(0);
    harness.manager.branch(originalLeaf as string);
    const canceled = await harness.invoke("agent_result", { batchId, wait: true });
    expect(canceled.details.tasks).toEqual([expect.objectContaining({ status: "canceled" })]);
  });

  it("keeps children after normal parent completion and stops them on session shutdown", async () => {
    harness = await ownerHarness(sdk);
    await harness.beginParent();
    const batchId = await startOne();
    await harness.endParent();
    expect(harness.child("one").session.isStreaming).toBe(true);
    await harness.close();
    expect(harness.child("one").runtime.dispose).toHaveBeenCalled();
    expect(harness.pi.messages).toHaveLength(0);
    await expect(harness.invoke("agent_result", { batchId })).rejects.toThrow(/expired/);
  });

  it("parent abort releases a result wait, stops children, and does not restart the parent", async () => {
    harness = await ownerHarness(sdk);
    const parent = await harness.beginParent();
    const batchId = await startOne();
    const waiting = harness.invoke("agent_result", { batchId, wait: true });
    const assertion = expect(waiting).rejects.toThrow(/abort|cancel/i);
    parent.abort();
    await assertion;
    await vi.waitFor(() => expect(harness?.children[0]?.runtime.dispose).toHaveBeenCalled());
    await harness.endParent(true);
    expect(harness.pi.messages).toHaveLength(0);
    const canceled = await harness.invoke("agent_result", { batchId, wait: true });
    expect(canceled.details.tasks).toEqual([expect.objectContaining({ status: "canceled" })]);
  });
});

describe("Completion Notice delivery", () => {
  it("starts one idle parent turn when a task finishes after normal settlement", async () => {
    harness = await ownerHarness(sdk);
    await harness.beginParent();
    await startOne();
    await harness.endParent();
    harness.child("one").finish();
    await vi.waitFor(() => expect(harness?.turnsStarted).toBe(1));
    expect(harness.queued).toHaveLength(0);
  });

  it("does not send a late notice for an already collected result", async () => {
    harness = await ownerHarness(sdk);
    const batchId = await startOne();
    fakeNoticeTimers();
    const collecting = harness.invoke("agent_result", { batchId, wait: true });
    harness.child("one").finish();
    await collecting;
    await flushNotices();
    expect(harness.pi.messages).toHaveLength(0);
  });

  it.each(["unstored", "failed"])("keeps the notice after an %s collection", async (kind) => {
    harness = await ownerHarness(sdk);
    await harness.beginParent();
    const batchId = await startOne();
    harness.child("one").finish();
    await vi.waitFor(() => expect(harness?.queued).toHaveLength(1));
    await harness.invoke(
      "agent_result",
      { batchId },
      kind === "unstored" ? false : { resultHook: () => ({ isError: true }) },
    );
    expect(await harness.deliverQueued()).toHaveLength(1);
  });

  it.each(["compaction", "branch before collection"])(
    "checks raw branch collection state after %s",
    async (navigation) => {
      harness = await ownerHarness(sdk);
      await harness.beginParent();
      const batchId = await startOne();
      const launchLeaf = harness.manager.getLeafId();
      harness.child("one").finish();
      await vi.waitFor(() => expect(harness?.queued).toHaveLength(1));
      await harness.invoke("agent_result", { batchId });
      if (navigation === "compaction") harness.manager.appendCompaction("Summary", null, 100);
      else harness.manager.branch(launchLeaf as string);
      expect(await harness.deliverQueued()).toHaveLength(navigation === "compaction" ? 0 : 1);
    },
  );

  it("does not restart an aborted parent for a queued notice or expose it on another branch", async () => {
    harness = await ownerHarness(sdk);
    const parent = await harness.beginParent();
    await startOne();
    harness.child("one").finish();
    await vi.waitFor(() => expect(harness?.queued).toHaveLength(1));
    expect(harness.turnsStarted).toBe(0);
    parent.abort();
    await harness.endParent(true);
    expect(await harness.deliverQueued()).toEqual([]);
    expect(harness.turnsStarted).toBe(0);
    harness.manager.resetLeaf();
    await harness.pi.emit("session_tree", { type: "session_tree" }, harness.ctx);
    await harness.beginParent();
    expect(await harness.deliverQueued()).toEqual([]);
    expect(harness.pi.messages).toHaveLength(1);
  });
});

describe("Completion Notice pause after parent abort", () => {
  it("holds a result that finished at abort until the next user input", async () => {
    harness = await ownerHarness(sdk);
    fakeNoticeTimers();
    const parent = await harness.beginParent();
    // The launch result is stored but its turn has not ended, so no notice is due yet.
    await harness.invoke("test_run", { tasks: ["one"] }, { endTurn: false });
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
    harness.child("one").finish();
    await vi.waitFor(() => expect(harness?.registry.snapshot().runs[0]?.status).toBe("completed"));
    parent.abort();
    await harness.endParent(true);
    await flushNotices();
    expect(harness.pi.messages).toHaveLength(0);
    await harness.pi.emit("input", { type: "input", source: "extension" }, harness.ctx);
    await flushNotices();
    expect(harness.pi.messages).toHaveLength(0);
    await harness.pi.emit("input", { type: "input", source: "interactive" }, harness.ctx);
    await flushNotices();
    expect(harness.pi.messages).toHaveLength(1);
  });
});

describe("Result Collection Usage", () => {
  it.each([{ isError: true }, { details: {} }, { isError: true, details: {} }])(
    "does not report stored Usage again after a result hook changes delivery: %j",
    async (patch) => {
      harness = await ownerHarness(sdk);
      const batchId = await startOne();
      harness.child("one").finish("Retryable output");
      const first = await harness.invoke(
        "agent_result",
        { batchId, wait: true },
        { resultHook: () => patch },
      );
      expect(first.usage?.totalTokens).toBe(15);
      const retry = await harness.invoke("agent_result", { batchId });
      expect(retry.usage).toBeUndefined();
      expect(harness.registry.snapshot().runs[0]?.result?.display?.usageStatus).toBe("reported");
    },
  );

  it("does not mark an unstored collection reported and permits a later retry", async () => {
    harness = await ownerHarness(sdk);
    const batchId = await startOne();
    harness.child("one").finish();
    const lost = await harness.invoke("agent_result", { batchId, wait: true }, false);
    expect(lost.usage?.totalTokens).toBe(15);
    expect(harness.registry.snapshot().runs[0]?.result?.display?.usageStatus).toBe("uncollected");
    await harness.endParent();
    const retry = await harness.invoke("agent_result", { batchId });
    expect(retry.usage?.totalTokens).toBe(15);
    expect(harness.registry.snapshot().runs[0]?.result?.display?.usageStatus).toBe("reported");
  });
});
