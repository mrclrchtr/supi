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
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("delegation execution modes", () => {
  it.each(["print", "json"])(
    "%s defaults to foreground and rejects explicit background",
    async (mode) => {
      harness = await backgroundHarness(sdk);
      Object.assign(harness.ctx, { mode });
      await expect(
        harness.invoke("agent_run", { tasks: [task()], mode: "background" }),
      ).rejects.toThrow(/TUI or RPC/);
      expect(harness.registry.snapshot().runs).toHaveLength(0);
      let returned = false;
      const result = harness.invoke("agent_run", { tasks: [task()] }).then((value) => {
        returned = true;
        return value;
      });
      await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
      expect(returned).toBe(false);
      harness.child("one").finish("Foreground output");
      expect((await result).usage?.totalTokens).toBe(15);
      expect(harness.pi.messages).toHaveLength(0);
    },
  );

  it("keeps mutation-capable tasks foreground and reports their Usage only on agent_run", async () => {
    harness = await backgroundHarness(sdk);
    await expect(
      harness.invoke("agent_run", { tasks: [task("writer", "general")], mode: "background" }),
    ).rejects.toThrow(/cannot run in the background.*new\.cwd/);
    const running = harness.invoke("agent_run", { tasks: [task("writer", "general")] });
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
    harness.child("writer").finish();
    const result = await running;
    expect(result.usage?.totalTokens).toBe(15);
    const batchId = harness.registry.snapshot().runs[0]?.batchId;
    await expect(harness.invoke("agent_result", { batchId })).rejects.toThrow(/background batch/);
  });

  it("rejects a whole invalid batch without starting any task", async () => {
    harness = await backgroundHarness(sdk);
    await expect(harness.invoke("agent_run", { tasks: [task("a"), task("a")] })).rejects.toThrow(
      /Duplicate/,
    );
    await expect(
      harness.invoke("agent_run", { tasks: [task(), task("other", "unknown")] }),
    ).rejects.toThrow(/Invalid/);
    expect(harness.registry.snapshot().runs).toHaveLength(0);
  });
});
