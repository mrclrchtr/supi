import { describe, expect, it } from "vitest";
import { settleByDeadline } from "../../../../src/analysis/search/deadline.ts";

describe("settleByDeadline", () => {
  it("completes an operation that settles within the deadline", async () => {
    await expect(
      settleByDeadline(async () => "done", { deadline: 10, now: () => 0 }),
    ).resolves.toEqual({ kind: "completed", value: "done" });
  });

  it("discards an operation result that settles after the injected clock deadline", async () => {
    let now = 0;
    const outcome = await settleByDeadline(
      async () => {
        now = 11;
        return "late";
      },
      { deadline: 10, now: () => now },
    );

    expect(outcome).toEqual({ kind: "timeout" });
  });

  it("actively times out a pending operation through an injected scheduler", async () => {
    let expire: () => void = () => undefined;
    let scheduledDelay: number | undefined;
    const outcomePromise = settleByDeadline(() => new Promise<never>(() => undefined), {
      deadline: 10,
      now: () => 0,
      schedule: (callback, delayMs) => {
        expire = callback;
        scheduledDelay = delayMs;
        return () => undefined;
      },
    });

    expect(scheduledDelay).toBe(10);
    expire();
    await expect(outcomePromise).resolves.toEqual({ kind: "timeout" });
  });

  it("propagates abort while an operation is pending", async () => {
    const controller = new AbortController();
    const reason = new Error("stop");
    const outcomePromise = settleByDeadline(() => new Promise<never>(() => undefined), {
      deadline: Number.POSITIVE_INFINITY,
      now: () => 0,
      signal: controller.signal,
    });

    controller.abort(reason);

    await expect(outcomePromise).rejects.toBe(reason);
  });
});
