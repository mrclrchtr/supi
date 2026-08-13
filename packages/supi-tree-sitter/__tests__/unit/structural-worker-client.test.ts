import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { StructuralWorkerClient } from "../../src/session/structural-worker-client.ts";
import {
  encodeStructuralResult,
  STRUCTURAL_WORKER_PROTOCOL_VERSION,
  type StructuralWorkerRequestMessage,
} from "../../src/session/structural-worker-protocol.ts";

class FakeWorker {
  readonly emitter = new EventEmitter();
  readonly posts: unknown[] = [];
  readonly terminate = vi.fn(async () => 0);

  postMessage(message: unknown): void {
    this.posts.push(message);
  }

  on(event: "message", listener: (message: unknown) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "exit", listener: (code: number) => void): this;
  on(event: string, listener: (...args: never[]) => void): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  emit(message: unknown): void {
    this.emitter.emit("message", message);
  }
}

describe("StructuralWorkerClient", () => {
  it("fails closed after two Worker startup failures", async () => {
    const workers: FakeWorker[] = [];
    const client = new StructuralWorkerClient("/workspace", () => {
      const worker = new FakeWorker();
      workers.push(worker);
      queueMicrotask(() =>
        worker.emit({
          kind: "startup-failure",
          version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
          generation: workers.length,
          message: "loader failed",
        }),
      );
      return worker;
    });
    try {
      const outcome = client.execute({ operation: "outline", file: "test.ts" });
      await vi.waitFor(() => expect(workers).toHaveLength(2));
      expect(workers.map((worker) => worker.posts)).toEqual([[], []]);
      await expect(outcome).resolves.toEqual({
        kind: "runtime-error",
        message: "Structural capability unavailable: loader failed",
      });
      expect(workers).toHaveLength(2);
      expect(workers.every((worker) => worker.terminate.mock.calls.length === 1)).toBe(true);
    } finally {
      await client.dispose();
    }
  });

  it("keeps FIFO order across an active hard stop and a fresh Worker", async () => {
    vi.useFakeTimers();
    const workers: FakeWorker[] = [];
    const client = new StructuralWorkerClient("/workspace", ({ generation }) => {
      const worker = new FakeWorker();
      workers.push(worker);
      queueMicrotask(() => worker.emit(ready(generation)));
      return worker;
    });
    try {
      const abortController = new AbortController();
      const first = client.execute(
        { operation: "outline", file: "first.ts" },
        { signal: abortController.signal },
      );
      const firstOutcome = first.then(
        () => "completed",
        (error: Error) => error.message,
      );
      const second = client.execute({ operation: "outline", file: "second.ts" });
      const third = client.execute({ operation: "outline", file: "third.ts" });
      await vi.advanceTimersByTimeAsync(0);

      expect(requests(workers[0])).toEqual(["first.ts"]);
      abortController.abort(new Error("stop first"));
      await vi.advanceTimersByTimeAsync(250);
      await expect(firstOutcome).resolves.toBe("stop first");
      await vi.advanceTimersByTimeAsync(0);
      expect(workers[0]?.terminate).toHaveBeenCalledOnce();
      expect(requests(workers[1])).toEqual(["second.ts"]);

      complete(workers[1], 3, request(workers[1], 0), { kind: "success", data: [] });
      await vi.advanceTimersByTimeAsync(2);
      expect(requests(workers[1])).toEqual(["second.ts", "third.ts"]);
      complete(workers[1], 3, request(workers[1], 1), { kind: "success", data: [] });
      await vi.advanceTimersByTimeAsync(2);
      await expect(second).resolves.toEqual({ kind: "success", data: [] });
      await expect(third).resolves.toEqual({ kind: "success", data: [] });
    } finally {
      await client.dispose();
      vi.useRealTimers();
    }
  });
});

function ready(generation: number) {
  return { kind: "ready", version: STRUCTURAL_WORKER_PROTOCOL_VERSION, generation };
}

function requests(worker: FakeWorker | undefined): string[] {
  return (worker?.posts.filter((post) => (post as { kind?: string }).kind === "request") ?? []).map(
    (post) => (post as StructuralWorkerRequestMessage).input.file,
  );
}

function request(worker: FakeWorker | undefined, index: number): StructuralWorkerRequestMessage {
  const value = worker?.posts.filter((post) => (post as { kind?: string }).kind === "request")[
    index
  ];
  if (!value) throw new Error("Expected Worker request");
  return value as StructuralWorkerRequestMessage;
}

function complete(
  worker: FakeWorker | undefined,
  generation: number,
  active: StructuralWorkerRequestMessage,
  result: { kind: "success"; data: unknown[] },
): void {
  if (!worker) throw new Error("Expected Worker");
  const [payload] = encodeStructuralResult(result);
  if (!payload) throw new Error("Expected result chunk");
  worker.emit({
    kind: "chunk",
    version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
    generation,
    requestId: active.requestId,
    sequence: 0,
    final: true,
    encodedBytes: payload.byteLength,
    payload,
  });
  setTimeout(
    () =>
      worker.emit({
        kind: "terminal",
        version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
        generation,
        requestId: active.requestId,
        outcome: "completed",
      }),
    1,
  );
}
