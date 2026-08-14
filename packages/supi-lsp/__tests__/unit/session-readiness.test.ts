import { CodeRequestDeadlineError } from "@mrclrchtr/supi-code-runtime/api";
import { describe, expect, it } from "vitest";
import { raceReadinessValue } from "../../src/session/readiness.ts";

function neverResolving<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

describe("raceReadinessValue", () => {
  it("resolves with the readiness value", async () => {
    const result = await raceReadinessValue(Promise.resolve("ready"), 5_000);
    expect(result).toEqual({ kind: "resolved", value: "ready" });
  });

  it("returns timeout when the relative timeout elapses", async () => {
    const result = await raceReadinessValue(neverResolving<string>(), 30);
    expect(result).toEqual({ kind: "timeout" });
  });

  it("returns unavailable when the readiness operation fails", async () => {
    const result = await raceReadinessValue(Promise.reject(new Error("boom")), 5_000);
    expect(result).toEqual({ kind: "unavailable", reason: "boom" });
  });

  it("rejects with the abort reason when cancelled during the wait", async () => {
    const controller = new AbortController();
    const readiness = raceReadinessValue(neverResolving<string>(), 5_000, {
      signal: controller.signal,
    });

    controller.abort(new Error("cancelled mid-wait"));

    await expect(readiness).rejects.toThrow("cancelled mid-wait");
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled before wait"));

    await expect(
      raceReadinessValue(neverResolving<string>(), 5_000, { signal: controller.signal }),
    ).rejects.toThrow("cancelled before wait");
  });

  it("rejects with a deadline error when the absolute deadline elapses", async () => {
    const readiness = raceReadinessValue(neverResolving<string>(), 5_000, {
      deadline: Date.now() + 30,
    });

    await expect(readiness).rejects.toBeInstanceOf(CodeRequestDeadlineError);
  });

  it("rejects with a deadline error when the deadline precedes the relative timeout", async () => {
    const readiness = raceReadinessValue(neverResolving<string>(), 10_000, {
      deadline: Date.now() + 30,
    });

    await expect(readiness).rejects.toBeInstanceOf(CodeRequestDeadlineError);
  });

  it("clears the abort listener after the readiness resolves", async () => {
    const controller = new AbortController();
    const result = await raceReadinessValue(Promise.resolve("ready"), 5_000, {
      signal: controller.signal,
    });
    expect(result).toEqual({ kind: "resolved", value: "ready" });

    // Aborting after resolution must not disturb the settled result.
    controller.abort(new Error("late abort"));
    expect(result).toEqual({ kind: "resolved", value: "ready" });
  });

  it("rethrows a deadline interruption raised by the readiness operation itself", async () => {
    const readiness = raceReadinessValue(Promise.reject(new CodeRequestDeadlineError()), 5_000);

    await expect(readiness).rejects.toThrow("Code request deadline exceeded");
  });
});
