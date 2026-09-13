import { describe, expect, it } from "vitest";
import { DiagnosticRequestScheduler } from "../../src/client/client-diagnostic-request.ts";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

// biome-ignore lint/security/noSecrets: The test suite name is not a secret.
describe("DiagnosticRequestScheduler", () => {
  it("does not start a request for an already-cancelled caller", async () => {
    const scheduler = new DiagnosticRequestScheduler();
    const controller = new AbortController();
    controller.abort(new Error("caller cancelled"));
    let starts = 0;

    expect(() =>
      scheduler.run(
        "cancelled",
        () => {
          starts++;
          return { result: Promise.resolve("started"), settled: Promise.resolve() };
        },
        { signal: controller.signal },
      ),
    ).toThrow("caller cancelled");
    expect(starts).toBe(0);
  });

  it("shares one synchronization request and waits for transport settlement", async () => {
    const scheduler = new DiagnosticRequestScheduler();
    const result = deferred<string>();
    const settled = deferred<void>();
    let starts = 0;
    const first = scheduler.run("same", () => {
      starts++;
      return { result: result.promise, settled: settled.promise };
    });
    const joined = scheduler.run("same", () => {
      starts++;
      throw new Error("duplicate request was started");
    });
    const next = scheduler.run("next", () => {
      starts++;
      return { result: Promise.resolve("next"), settled: Promise.resolve() };
    });

    expect(starts).toBe(1);
    result.resolve("shared");
    await expect(first).resolves.toBe("shared");
    await expect(joined).resolves.toBe("shared");
    expect(starts).toBe(1);

    settled.resolve();
    await expect(next).resolves.toBe("next");
    expect(starts).toBe(2);
  });

  it("releases a cancelled consumer but keeps the active transport occupied", async () => {
    const scheduler = new DiagnosticRequestScheduler();
    const result = deferred<string>();
    const settled = deferred<void>();
    let starts = 0;
    const active = scheduler.run("active", () => {
      starts++;
      return { result: result.promise, settled: settled.promise };
    });
    const controller = new AbortController();
    const cancelled = scheduler.run(
      "active",
      () => {
        throw new Error("cancelled consumer started a request");
      },
      { signal: controller.signal },
    );
    const queued = scheduler.run("queued", () => {
      starts++;
      return { result: Promise.resolve("queued"), settled: Promise.resolve() };
    });

    controller.abort(new Error("caller cancelled"));
    await expect(cancelled).rejects.toThrow("caller cancelled");
    expect(starts).toBe(1);

    result.resolve("active");
    settled.resolve();
    await expect(active).resolves.toBe("active");
    await expect(queued).resolves.toBe("queued");
    expect(starts).toBe(2);
  });

  it("bounds pending work and clears jobs that have not reached transport", async () => {
    const scheduler = new DiagnosticRequestScheduler();
    const activeResult = deferred<string>();
    const activeSettled = deferred<void>();
    let starts = 0;
    const active = scheduler.run("active", () => {
      starts++;
      return { result: activeResult.promise, settled: activeSettled.promise };
    });
    const pending = Array.from(
      { length: DiagnosticRequestScheduler.MAX_PENDING_REQUESTS },
      (_, index) =>
        scheduler.run(`pending-${index}`, () => {
          starts++;
          return { result: Promise.resolve("pending"), settled: Promise.resolve() };
        }),
    );
    const overflow = scheduler.run("overflow", () => {
      throw new Error("overflow request started");
    });

    await expect(overflow).rejects.toThrow("queue is full");
    expect(starts).toBe(1);
    scheduler.clearPending();
    await expect(Promise.allSettled(pending)).resolves.toEqual(
      pending.map(() => expect.objectContaining({ status: "rejected" })),
    );

    activeResult.resolve("active");
    activeSettled.resolve();
    await expect(active).resolves.toBe("active");
    expect(starts).toBe(1);
  });

  it("clears queued requests for one document without dropping other documents", async () => {
    const scheduler = new DiagnosticRequestScheduler();
    const activeResult = deferred<string>();
    const activeSettled = deferred<void>();
    const active = scheduler.run("active", () => ({
      result: activeResult.promise,
      settled: activeSettled.promise,
    }));
    const kept = scheduler.run("keep\x00sync", () => ({
      result: Promise.resolve("kept"),
      settled: Promise.resolve(),
    }));
    const dropped = scheduler.run("drop\x00sync", () => ({
      result: Promise.resolve("dropped"),
      settled: Promise.resolve(),
    }));

    scheduler.clearPendingWhere((key) => key.startsWith("drop\x00"));
    await expect(dropped).rejects.toThrow("invalidated");
    activeResult.resolve("active");
    activeSettled.resolve();
    await expect(active).resolves.toBe("active");
    await expect(kept).resolves.toBe("kept");
  });

  it("does not release the route when an owner result times out before settlement", async () => {
    const scheduler = new DiagnosticRequestScheduler();
    const ownerResult = deferred<string>();
    const ownerSettled = deferred<void>();
    let starts = 0;
    const owner = scheduler.run("owner", () => {
      starts++;
      return { result: ownerResult.promise, settled: ownerSettled.promise };
    });
    const queued = scheduler.run("queued", () => {
      starts++;
      return { result: Promise.resolve("queued"), settled: Promise.resolve() };
    });

    ownerResult.reject(new Error("owner hard timeout"));
    await expect(owner).rejects.toThrow("owner hard timeout");
    await Promise.resolve();
    expect(starts).toBe(1);

    ownerSettled.resolve();
    await expect(queued).resolves.toBe("queued");
    expect(starts).toBe(2);
  });
});
