import { getTool } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type RegisteredAgentRunTool, render, theme } from "../helpers/agent-run-fixtures.ts";
import { backgroundHarness, task } from "../helpers/background-harness.ts";

const sdk = vi.hoisted(() => ({ createAgentSession: vi.fn(), createAgentSessionRuntime: vi.fn() }));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
  ...sdk,
}));
let harness: Awaited<ReturnType<typeof backgroundHarness>> | undefined;
afterEach(async () => {
  await harness?.close();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("background parent lifecycle", () => {
  it("cancels one batch repeatedly without stopping another batch", async () => {
    harness = await backgroundHarness(sdk);
    const canceled = await harness.invoke("agent_run", { tasks: [task("cancel")] });
    const kept = await harness.invoke("agent_run", { tasks: [task("keep")] });
    await vi.waitFor(() =>
      expect(harness?.children.filter((child) => child.session.isStreaming)).toHaveLength(2),
    );
    const stopped = await harness.invoke("agent_cancel", { batchId: canceled.details.batchId });
    expect(JSON.stringify(stopped.content)).toContain(
      "Collect any remaining task results and Usage with agent_result.",
    );
    await harness.invoke("agent_cancel", { batchId: canceled.details.batchId });
    const result = await harness.invoke("agent_result", {
      batchId: canceled.details.batchId,
      wait: true,
    });
    expect(result.details).toMatchObject({
      tasks: [expect.objectContaining({ status: "canceled" })],
    });
    expect(harness.child("keep").session.isStreaming).toBe(true);
    harness.child("keep").finish("Kept result");
    const completed = await harness.invoke("agent_result", {
      batchId: kept.details.batchId,
      wait: true,
    });
    expect(completed.details).toMatchObject({
      tasks: [expect.objectContaining({ status: "completed" })],
    });
  });
  it("still advises collection when ready results were collected but a sibling is pending", async () => {
    harness = await backgroundHarness(sdk);
    const started = await harness.invoke("agent_run", { tasks: [task("fast"), task("slow")] });
    const batchId = started.details.batchId;
    await vi.waitFor(() =>
      expect(harness?.children.filter((child) => child.session.isStreaming)).toHaveLength(2),
    );
    harness.child("fast").finish("Fast result");
    await vi.waitFor(() => expect(harness?.pi.messages).toHaveLength(1));
    const partial = await harness.invoke("agent_result", { batchId });
    expect(partial.details.complete).toBe(false);
    const stopped = await harness.invoke("agent_cancel", { batchId });
    expect(JSON.stringify(stopped.content)).toContain(
      "Collect any remaining task results and Usage with agent_result.",
    );
    const collected = await harness.invoke("agent_result", { batchId, wait: true });
    expect(collected.details).toMatchObject({
      complete: true,
      tasks: [
        expect.objectContaining({ taskId: "fast", status: "completed" }),
        expect.objectContaining({ taskId: "slow", status: "canceled" }),
      ],
    });
    const repeated = await harness.invoke("agent_cancel", { batchId });
    expect(JSON.stringify(repeated.content)).not.toContain("agent_result");
  });

  it("advises collection after child disposal when task results remain uncollected", async () => {
    harness = await backgroundHarness(sdk);
    const started = await harness.invoke("agent_run", { tasks: [task()] });
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
    const child = harness.child("one");
    child.finish("Ready result");
    await vi.waitFor(() => expect(child.runtime.dispose).toHaveBeenCalledOnce());
    const stopped = await harness.invoke("agent_cancel", { batchId: started.details.batchId });
    expect(JSON.stringify(stopped.content)).toContain("No active work remains.");
    expect(JSON.stringify(stopped.content)).toContain(
      "Collect any remaining task results and Usage with agent_result.",
    );
    const cancelTool = getTool(harness.pi, "agent_cancel") as unknown as Pick<
      RegisteredAgentRunTool,
      "renderResult"
    >;
    for (const expanded of [false, true]) {
      expect(
        render(cancelTool.renderResult(stopped, { expanded, isPartial: false }, theme)),
      ).toContain("Collect any remaining task results and Usage with agent_result.");
    }
    const collected = await harness.invoke("agent_result", {
      batchId: started.details.batchId,
      wait: true,
    });
    expect(collected.usage?.totalTokens).toBe(15);
  });

  it("keeps launch ownership through compaction but cancels an abandoned branch", async () => {
    harness = await backgroundHarness(sdk);
    const start = await harness.invoke("agent_run", { tasks: [task()] });
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
    harness.manager.appendCompaction("Summary", null, 100);
    const originalLeaf = harness.manager.getLeafId();
    await harness.pi.emit("session_tree", { type: "session_tree" }, harness.ctx);
    expect(harness.children[0].session.isStreaming).toBe(true);
    harness.manager.resetLeaf();
    await harness.pi.emit("session_tree", { type: "session_tree" }, harness.ctx);
    await vi.waitFor(() => expect(harness?.children[0]?.runtime.dispose).toHaveBeenCalled());
    await expect(
      harness.invoke("agent_result", { batchId: start.details.batchId }),
    ).rejects.toThrow(/branch/i);
    expect(harness.pi.messages).toHaveLength(0);
    harness.manager.branch(originalLeaf as string);
    const canceled = await harness.invoke("agent_result", {
      batchId: start.details.batchId,
      wait: true,
    });
    expect(canceled.details).toMatchObject({
      tasks: [expect.objectContaining({ status: "canceled" })],
    });
  });
  it("parent abort releases a result wait, stops children, and does not restart the parent", async () => {
    harness = await backgroundHarness(sdk);
    const parent = await harness.beginParent();
    const start = await harness.invoke("agent_run", { tasks: [task()] });
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
    const waiting = harness.invoke("agent_result", { batchId: start.details.batchId, wait: true });
    const assertion = expect(waiting).rejects.toThrow(/abort|cancel/i);
    parent.abort();
    await assertion;
    await vi.waitFor(() => expect(harness?.children[0]?.runtime.dispose).toHaveBeenCalled());
    await harness.endParent(true);
    expect(harness.pi.messages).toHaveLength(0);
    const canceled = await harness.invoke("agent_result", {
      batchId: start.details.batchId,
      wait: true,
    });
    expect(canceled.details).toMatchObject({
      complete: true,
      tasks: [expect.objectContaining({ status: "canceled" })],
    });
  });
});
