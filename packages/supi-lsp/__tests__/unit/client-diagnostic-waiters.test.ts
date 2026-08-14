import { CodeRequestDeadlineError } from "@mrclrchtr/supi-code-runtime/api";
import { describe, expect, it } from "vitest";
import { DiagnosticWaitRegistry } from "../../src/client/client-diagnostic-waiters.ts";

function settleOptions(
  overrides: Partial<Parameters<DiagnosticWaitRegistry["waitForSettle"]>[0]> = {},
) {
  return {
    syncStart: Date.now(),
    maxWaitMs: 5_000,
    quietMs: 200,
    settleEpoch: 0,
    isComplete: () => false,
    latestReceived: () => 0,
    ...overrides,
  };
}

describe("DiagnosticWaitRegistry", () => {
  it("resolves a push wait as published when the file is released", async () => {
    const waiters = new DiagnosticWaitRegistry();
    const pending = waiters.waitForPush("file:///a.ts", 5_000);
    waiters.releaseFile("file:///a.ts", "published");
    await expect(pending).resolves.toBe("published");
  });

  it("resolves a push wait as timed-out when the relative timeout elapses", async () => {
    const waiters = new DiagnosticWaitRegistry();
    await expect(waiters.waitForPush("file:///a.ts", 30)).resolves.toBe("timed-out");
  });

  it("rejects a push wait with the abort reason when cancelled", async () => {
    const waiters = new DiagnosticWaitRegistry();
    const controller = new AbortController();
    const pending = waiters.waitForPush("file:///a.ts", 5_000, { signal: controller.signal });

    controller.abort(new Error("cancelled push wait"));

    await expect(pending).rejects.toThrow("cancelled push wait");
  });

  it("rejects a push wait when the caller is already aborted", async () => {
    const waiters = new DiagnosticWaitRegistry();
    const controller = new AbortController();
    controller.abort(new Error("cancelled before push wait"));

    await expect(
      waiters.waitForPush("file:///a.ts", 5_000, { signal: controller.signal }),
    ).rejects.toThrow("cancelled before push wait");
  });

  it("rejects a push wait with a deadline error when the absolute deadline elapses", async () => {
    const waiters = new DiagnosticWaitRegistry();
    const pending = waiters.waitForPush("file:///a.ts", 5_000, { deadline: Date.now() + 30 });

    await expect(pending).rejects.toBeInstanceOf(CodeRequestDeadlineError);
  });

  it("keeps the relative timed-out outcome when the deadline does not bind", async () => {
    const waiters = new DiagnosticWaitRegistry();
    const pending = waiters.waitForPush("file:///a.ts", 30, { deadline: Date.now() + 60_000 });

    await expect(pending).resolves.toBe("timed-out");
  });

  it("rejects a settle wait with the abort reason when cancelled", async () => {
    const waiters = new DiagnosticWaitRegistry();
    const controller = new AbortController();
    const pending = waiters.waitForSettle(settleOptions({ maxWaitMs: 5_000 }), {
      signal: controller.signal,
    });

    controller.abort(new Error("cancelled mid-settle"));

    await expect(pending).rejects.toThrow("cancelled mid-settle");
  });

  it("rejects a settle wait with a deadline error when the deadline binds", async () => {
    const waiters = new DiagnosticWaitRegistry();
    const pending = waiters.waitForSettle(settleOptions({ maxWaitMs: 10_000 }), {
      deadline: Date.now() + 30,
    });

    await expect(pending).rejects.toBeInstanceOf(CodeRequestDeadlineError);
  });

  it("resolves a settle wait as quiet when the state becomes quiet", async () => {
    const waiters = new DiagnosticWaitRegistry();
    let complete = false;
    const pending = waiters.waitForSettle(
      settleOptions({
        maxWaitMs: 5_000,
        quietMs: 20,
        isComplete: () => complete,
        latestReceived: () => 1,
      }),
    );
    setTimeout(() => {
      complete = true;
      waiters.notifySettle();
    }, 10);

    await expect(pending).resolves.toEqual({ outcome: "quiet", freshness: "observed" });
  });
});
