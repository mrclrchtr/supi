import { afterEach, describe, expect, it, vi } from "vitest";
import { backgroundHarness, task } from "../helpers/background-harness.ts";

const sdk = vi.hoisted(() => ({ createAgentSession: vi.fn(), createAgentSessionRuntime: vi.fn() }));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
  ...sdk,
}));
let harness: Awaited<ReturnType<typeof backgroundHarness>> | undefined;
afterEach(async () => {
  await harness?.close();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("background replacement and cleanup", () => {
  it("waits for blocked startup during replacement and cannot deliver the old result into the new session", async () => {
    harness = await backgroundHarness(sdk);
    const gate = harness.holdNextStartup();
    try {
      const start = await harness.invoke("agent_run", { tasks: [task("old")] });
      await gate.entered;
      const oldManager = harness.manager;
      const waiting = harness.invoke("agent_result", {
        batchId: start.details.batchId,
        wait: true,
      });
      const canceled = expect(waiting).rejects.toThrow(/cancel/i);
      let replaced = false;
      const replacement = harness.replaceSession().then(() => {
        replaced = true;
      });
      await canceled;
      expect(replaced).toBe(false);
      gate.release();
      await replacement;
      expect(harness.manager).not.toBe(oldManager);
      expect(() => harness?.children[0].extensionRuntime.assertActive()).toThrow(/closed/);
      expect(harness.children[0].session.prompt).not.toHaveBeenCalled();
      expect(harness.pi.messages).toHaveLength(0);
      await expect(
        harness.invoke("agent_result", { batchId: start.details.batchId }),
      ).rejects.toThrow(/expired/);
      const fresh = await harness.invoke("agent_run", { tasks: [task("fresh")] });
      await vi.waitFor(() =>
        expect(harness?.children.some((child) => child.session.isStreaming)).toBe(true),
      );
      harness.child("fresh").finish("New session result");
      const result = await harness.invoke("agent_result", {
        batchId: fresh.details.batchId,
        wait: true,
      });
      expect(result.details).toMatchObject({ complete: true });
    } finally {
      gate.release();
    }
  });

  it("holds a capacity slot until blocked disposal finishes", async () => {
    harness = await backgroundHarness(sdk);
    const start = await harness.invoke("agent_run", { tasks: [task("stopping")] });
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
    const release = harness.child("stopping").holdDisposal();
    try {
      await harness.invoke("agent_cancel", { batchId: start.details.batchId });
      await vi.waitFor(() => expect(harness?.child("stopping").runtime.dispose).toHaveBeenCalled());
      await harness.invoke("agent_run", { tasks: [task("a"), task("b"), task("c")] });
      await expect(harness.invoke("agent_run", { tasks: [task("overflow")] })).rejects.toThrow(
        /capacity/,
      );
      release();
      await harness.invoke("agent_result", { batchId: start.details.batchId, wait: true });
      const accepted = await harness.invoke("agent_run", { tasks: [task("replacement")] });
      expect(accepted.details.mode).toBe("background");
    } finally {
      release();
    }
  });
});
