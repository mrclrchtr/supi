import { afterEach, describe, expect, it, vi } from "vitest";
import { backgroundHarness } from "../helpers/background-harness.ts";

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

describe("explicit Delegation Task context", () => {
  it("gives each fresh child shared evidence and its own task, not parent history or sibling work", async () => {
    harness = await backgroundHarness(sdk);
    harness.manager.appendMessage({
      role: "user",
      content: "Unrelated parent discussion about release branding.",
      timestamp: Date.now(),
    });
    const run = harness.invoke("agent_run", {
      mode: "foreground",
      sharedContext:
        "Observed in src/worker.ts:12: normal completion leaves background work active. Idle Escape behavior is unverified.",
      tasks: [
        {
          id: "escape",
          new: { profile: "explore" },
          instructions:
            "Determine whether idle Escape aborts the parent. Report the event path; do not design new cancellation behavior.",
        },
        {
          id: "shutdown",
          new: { profile: "explore" },
          instructions: "Determine whether shutdown waits for background cleanup.",
        },
      ],
    });
    await vi.waitFor(() => {
      expect(harness?.children).toHaveLength(2);
      expect(harness?.children.every((child) => child.session.isStreaming)).toBe(true);
    });

    const contexts = harness.children.map((child) =>
      JSON.stringify(child.session.sessionManager.buildSessionContext()),
    );
    for (const context of contexts) {
      expect(context).toContain("Observed in src/worker.ts:12");
      expect(context).toContain("Idle Escape behavior is unverified.");
      expect(context).not.toContain("release branding");
    }
    const escapeContext = contexts.find((context) => context.includes("Report the event path"));
    const shutdown = contexts.find((context) => context.includes("shutdown waits"));
    expect(escapeContext).toBeDefined();
    expect(escapeContext).not.toContain("shutdown waits");
    expect(shutdown).toBeDefined();
    expect(shutdown).not.toContain("Report the event path");

    for (const child of harness.children) child.finish();
    await run;
  });
});
