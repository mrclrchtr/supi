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

describe("queued background completion notices", () => {
  it("omits a queued notice after its task is collected, even while a sibling remains active", async () => {
    harness = await backgroundHarness(sdk);
    await harness.beginParent();
    const start = await harness.invoke("agent_run", { tasks: [task("fast"), task("slow")] });
    await vi.waitFor(() =>
      expect(harness?.children.filter((child) => child.session.isStreaming)).toHaveLength(2),
    );
    harness.child("fast").finish("Collected output");
    await vi.waitFor(() => expect(harness?.queued).toHaveLength(1));
    await harness.invoke("agent_result", { batchId: start.details.batchId });
    expect(harness.child("slow").session.isStreaming).toBe(true);
    expect(await harness.deliverQueued()).toEqual([]);
    // The context filter does not rewrite the stored human transcript.
    expect(harness.pi.messages).toHaveLength(1);
    harness.child("slow").finish("Uncollected output");
    await vi.waitFor(() => expect(harness?.queued).toHaveLength(1));
    expect(await harness.deliverQueued()).toEqual([
      expect.objectContaining({
        // Child output stays in TUI-only details, never in model-facing content.
        content: expect.not.stringContaining("Uncollected output"),
        details: expect.objectContaining({
          batchId: start.details.batchId,
          taskIds: ["slow"],
          tasks: [
            expect.objectContaining({
              taskId: "slow",
              status: "completed",
              finalText: "Uncollected output",
            }),
          ],
        }),
      }),
    ]);
  });
});
