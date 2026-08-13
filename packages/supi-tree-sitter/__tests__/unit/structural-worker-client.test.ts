import { EventEmitter } from "node:events";
import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  fail(error: Error): void {
    this.emitter.emit("error", error);
  }

  emit(message: unknown): void {
    this.emitter.emit("message", message);
  }
}

afterEach(() => resetDebugRegistry());

describe("StructuralWorkerClient", () => {
  it("forwards the opaque Debug Operation ID in the request message", async () => {
    const worker = new FakeWorker();
    const client = new StructuralWorkerClient("/workspace", ({ generation }) => {
      queueMicrotask(() => worker.emit(ready(generation)));
      return worker;
    });
    try {
      void client.execute(
        { operation: "outline", file: "test.ts" },
        { operationId: "op-AAAAAAAAAAAAAAAAAAAAAA" },
      );
      await vi.waitFor(() => expect(requests(worker)).toEqual(["test.ts"]));

      expect(request(worker, 0)).toMatchObject({
        operationId: "op-AAAAAAAAAAAAAAAAAAAAAA",
      });
    } finally {
      await client.dispose();
    }
  });

  it("rejects a malformed Debug Operation ID before it crosses the Worker boundary", async () => {
    const worker = new FakeWorker();
    const client = new StructuralWorkerClient("/workspace", () => worker);
    try {
      await expect(
        client.execute(
          { operation: "outline", file: "test.ts" },
          { operationId: "raw-public-call" },
        ),
      ).resolves.toEqual({ kind: "runtime-error", message: "Invalid Debug Operation ID" });
      expect(worker.posts).toEqual([]);
    } finally {
      await client.dispose();
    }
  });

  it("rejects a Worker observation whose ID does not own the active request", async () => {
    const worker = new FakeWorker();
    const client = new StructuralWorkerClient("/workspace", ({ generation }) => {
      queueMicrotask(() => worker.emit(ready(generation)));
      return worker;
    });
    try {
      const outcome = client.execute(
        { operation: "outline", file: "test.ts" },
        { operationId: "op-AAAAAAAAAAAAAAAAAAAAAA" },
      );
      await vi.waitFor(() => expect(requests(worker)).toEqual(["test.ts"]));
      const active = request(worker, 0);
      worker.emit({
        kind: "observation",
        version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
        generation: 1,
        requestId: active.requestId,
        observation: {
          operationId: "op-_____________________w",
          source: "tree-sitter",
          level: "debug",
          category: "structural.query.timing",
          message: "Tree-sitter query completed",
          data: {
            operation: "query",
            grammar: "typescript",
            outcome: "completed",
            captureCount: 0,
            cache: { state: "miss", retained: false, evictionCount: 0 },
            timing: { durationMs: 1, phasesMs: { "query-execution": 1 } },
          },
        },
      });

      await expect(outcome).resolves.toEqual({
        kind: "runtime-error",
        message: "Structural Worker protocol failure: Structural observation ownership mismatch",
      });
      await vi.waitFor(() => expect(worker.terminate).toHaveBeenCalledOnce());
    } finally {
      await client.dispose();
    }
  });

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

  it("restarts after an active Worker error without deadlocking queued work", async () => {
    configureDebugRegistry({ enabled: true, maxEvents: 10 });
    const workers: FakeWorker[] = [];
    const client = new StructuralWorkerClient("/workspace", ({ generation }) => {
      const worker = new FakeWorker();
      workers.push(worker);
      queueMicrotask(() => worker.emit(ready(generation)));
      return worker;
    });
    try {
      const first = client.execute(
        { operation: "outline", file: "first.ts" },
        { operationId: "op-AAAAAAAAAAAAAAAAAAAAAA" },
      );
      const second = client.execute({ operation: "outline", file: "second.ts" });
      await vi.waitFor(() => expect(requests(workers[0])).toEqual(["first.ts"]));

      workers[0]?.fail(new Error("worker crashed"));

      await expect(first).resolves.toEqual({ kind: "runtime-error", message: "worker crashed" });
      await vi.waitFor(() => expect(requests(workers[1])).toEqual(["second.ts"]));
      complete(workers[1], 3, request(workers[1], 0), { kind: "success", data: [] });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await expect(second).resolves.toEqual({ kind: "success", data: [] });
      expect(
        getDebugEvents({
          operationId: "op-AAAAAAAAAAAAAAAAAAAAAA",
          category: "structural.worker.restart.timing",
        }).events,
      ).toHaveLength(1);
    } finally {
      await client.dispose();
    }
  });

  it("keeps FIFO order and request-owned restart timing across an active hard stop", async () => {
    configureDebugRegistry({ enabled: true, maxEvents: 10 });
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
        {
          operationId: "op-AAAAAAAAAAAAAAAAAAAAAA",
          signal: abortController.signal,
        },
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
      expect(
        getDebugEvents({
          operationId: "op-AAAAAAAAAAAAAAAAAAAAAA",
          source: "tree-sitter",
          category: "structural.worker.restart.timing",
        }).events,
      ).toEqual([
        expect.objectContaining({
          data: expect.objectContaining({ outcome: "completed", cacheReset: true }),
        }),
      ]);
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
