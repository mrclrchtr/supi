import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backgroundHarness, task, usage } from "../helpers/background-harness.ts";

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

describe("background collection receipts", () => {
  it.each([{ isError: true }, { details: {} }, { isError: true, details: {} }])(
    "does not report stored Usage again after a result hook changes delivery: %j",
    async (patch) => {
      harness = await backgroundHarness(sdk);
      const start = await harness.invoke("agent_run", { tasks: [task()] });
      await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
      harness.child("one").finish("Retryable output");
      const first = await harness.invoke(
        "agent_result",
        { batchId: start.details.batchId, wait: true },
        { resultHook: () => patch },
      );
      expect(first.usage?.totalTokens).toBe(15);
      const retry = await harness.invoke("agent_result", { batchId: start.details.batchId });
      expect(retry.usage).toBeUndefined();
      expect(retry.content).toEqual(first.content);
      expect(harness.registry.snapshot().runs[0]?.result?.display?.usageStatus).toBe("reported");
    },
  );
  it("does not send a late completion notice for an already collected result", async () => {
    harness = await backgroundHarness(sdk);
    const start = await harness.invoke("agent_run", { tasks: [task()] });
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
    const collecting = harness.invoke("agent_result", {
      batchId: start.details.batchId,
      wait: true,
    });
    harness.child("one").finish();
    await collecting;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(harness.pi.messages).toHaveLength(0);
  });
  it("does not mark an unstored collection reported and permits a later retry", async () => {
    harness = await backgroundHarness(sdk);
    const start = await harness.invoke("agent_run", { tasks: [task()] });
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
    harness.child("one").finish();
    const lost = await harness.invoke(
      "agent_result",
      { batchId: start.details.batchId, wait: true },
      false,
    );
    expect(lost.usage?.totalTokens).toBe(15);
    expect(harness.registry.snapshot().runs[0]?.result?.display?.usageStatus).toBe("uncollected");
    await harness.endParent();
    const retry = await harness.invoke("agent_result", { batchId: start.details.batchId });
    expect(retry.usage?.totalTokens).toBe(15);
    expect(harness.registry.snapshot().runs[0]?.result?.display?.usageStatus).toBe("reported");
  });

  it("reports Usage only once for concurrent collections", async () => {
    harness = await backgroundHarness(sdk);
    const start = await harness.invoke("agent_run", { tasks: [task()] });
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
    harness.child("one").finish();
    const results = await Promise.all([
      harness.invoke("agent_result", { batchId: start.details.batchId, wait: true }),
      harness.invoke("agent_result", { batchId: start.details.batchId, wait: true }),
    ]);
    expect(results.reduce((sum, result) => sum + (result.usage?.totalTokens ?? 0), 0)).toBe(15);
    for (const result of results) expect(result.details.alreadyCollected).toBe(false);
    const repeated = await harness.invoke("agent_result", { batchId: start.details.batchId });
    expect(repeated.usage).toBeUndefined();
  });

  it("retains a collectable failure when SDK session creation fails", async () => {
    harness = await backgroundHarness(sdk);
    sdk.createAgentSession.mockRejectedValueOnce(new Error("Private setup failure"));
    const start = await harness.invoke("agent_run", { tasks: [task()] });
    const failed = await harness.invoke("agent_result", {
      batchId: start.details.batchId,
      wait: true,
    });
    expect(failed.details).toMatchObject({
      complete: true,
      tasks: [expect.objectContaining({ status: "failed" })],
    });
    expect(JSON.stringify(failed.content)).not.toContain("Private setup failure");
    expect(failed.usage).toBeUndefined();
    expect(failed.details.alreadyCollected).toBe(false);
    const repeated = await harness.invoke("agent_result", { batchId: start.details.batchId });
    expect(repeated.details.alreadyCollected).toBe(true);
    expect(JSON.stringify(repeated.content)).toContain("Already collected; no new Usage.");
  });

  it("does not label a Usage retry as already collected after a result hook replaces Usage", async () => {
    harness = await backgroundHarness(sdk);
    const start = await harness.invoke("agent_run", { tasks: [task()] });
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
    harness.child("one").finish();
    await harness.invoke(
      "agent_result",
      { batchId: start.details.batchId, wait: true },
      {
        resultHook: () => ({
          usage: {
            ...usage,
            input: 0,
            output: 0,
            totalTokens: 0,
            cost: { ...usage.cost, input: 0, output: 0, total: 0 },
          },
        }),
      },
    );
    const stopped = await harness.invoke("agent_cancel", { batchId: start.details.batchId });
    expect(JSON.stringify(stopped.content)).toContain(
      "Collect any remaining task results and Usage with agent_result.",
    );
    const retry = await harness.invoke("agent_result", { batchId: start.details.batchId });
    expect(retry.usage?.totalTokens).toBe(15);
    expect(retry.details.alreadyCollected).toBe(false);
    expect(JSON.stringify(retry.content)).not.toContain("Already collected");
  });

  it("bounds the complete collection, including pending status, within the output budget", async () => {
    harness = await backgroundHarness(sdk);
    const start = await harness.invoke("agent_run", {
      tasks: [task("a"), task("b"), task("c"), task("d")],
    });
    await vi.waitFor(() =>
      expect(harness?.children.filter((child) => child.session.isStreaming)).toHaveLength(4),
    );
    for (const child of harness.children) child.finish("x".repeat(60_000));
    const result = await harness.invoke("agent_result", {
      batchId: start.details.batchId,
      wait: true,
    });
    const text = result.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n");
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(51_200);
    expect(text.split("\n").length).toBeLessThanOrEqual(2_000);
    const outputPath = result.details.fullOutputPath as string;
    expect(existsSync(outputPath)).toBe(true);
    await harness.close();
    expect(existsSync(outputPath)).toBe(false);
  });
});
