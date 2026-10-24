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

describe("background delegation through registered tools", () => {
  it("collects fast tasks before siblings and reports their Usage only once", async () => {
    harness = await backgroundHarness(sdk);
    const started = await harness.invoke("agent_run", { tasks: [task("fast"), task("slow")] });
    const batchId = started.details.batchId;
    await vi.waitFor(() =>
      expect(harness?.children.filter((child) => child.session.isStreaming)).toHaveLength(2),
    );
    harness.child("fast").finish("Fast result");
    await vi.waitFor(() => expect(harness?.pi.messages).toHaveLength(1));
    const first = await harness.invoke("agent_result", { batchId });
    expect(first.details).toMatchObject({
      complete: false,
      pending: [expect.objectContaining({ taskId: "slow" })],
    });
    expect(first.usage?.totalTokens).toBe(15);
    expect(JSON.stringify(first.content)).not.toContain("Already collected");
    const repeated = await harness.invoke("agent_result", { batchId });
    expect(repeated.usage).toBeUndefined();
    expect(JSON.stringify(repeated.content)).toContain("Already collected; no new Usage.");
    expect(JSON.stringify(repeated.content)).toContain("Fast result");
    expect(JSON.stringify(repeated.content)).toContain("Pending: slow");
    harness.child("slow").finish("Slow result");
    const final = await harness.invoke("agent_result", { batchId, wait: true });
    expect(final.details).toMatchObject({ complete: true });
    expect(final.usage?.totalTokens).toBe(15);
    expect(JSON.stringify(final.content)).not.toContain("Already collected");
    const reread = await harness.invoke("agent_result", { batchId });
    expect(JSON.stringify(reread.content)).toContain("Already collected; no new Usage.");
    expect(JSON.stringify(reread.content)).toContain("All task results are ready.");
    expect(reread.usage).toBeUndefined();
    const tool = getTool(harness.pi, "agent_result") as unknown as Pick<
      RegisteredAgentRunTool,
      "renderResult"
    >;
    for (const expanded of [false, true]) {
      expect(render(tool.renderResult(reread, { expanded, isPartial: false }, theme))).toContain(
        "Already collected; no new Usage.",
      );
    }
  });

  it("does not label an empty pending collection as already collected", async () => {
    harness = await backgroundHarness(sdk);
    const start = await harness.invoke("agent_run", { tasks: [task()] });
    const result = await harness.invoke("agent_result", { batchId: start.details.batchId });
    expect(result.details).toMatchObject({ complete: false, tasks: [], alreadyCollected: false });
    expect(JSON.stringify(result.content)).not.toContain("Already collected");
  });
  it("returns a handle before a child finishes and collects its result later", async () => {
    harness = await backgroundHarness(sdk);
    const started = await harness.invoke("agent_run", { tasks: [task()] });
    expect(started.details).toMatchObject({ mode: "background", batchId: expect.any(String) });
    expect(started.usage).toBeUndefined();
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
    harness.children[0].finish("Found the tests.");
    await vi.waitFor(() => expect(harness?.pi.messages).toHaveLength(1));
    expect(harness.pi.messages[0]?.content).not.toContain("Found the tests.");
    expect(harness.registry.snapshot().runs[0]?.result?.display?.usageStatus).toBe("uncollected");
    const result = await harness.invoke("agent_result", {
      batchId: (started.details as { batchId: string }).batchId,
    });
    expect(result.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining("Found the tests.") }),
    ]);
    expect(result.usage?.totalTokens).toBe(15);
    expect(harness.registry.snapshot().runs[0]?.result?.display?.usageStatus).toBe("reported");
  });
});
