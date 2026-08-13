import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { StructuralWorkerClient } from "../../src/session/structural-worker-client.ts";
import { STRUCTURAL_WORKER_PROTOCOL_VERSION } from "../../src/session/structural-worker-protocol.ts";

class StartingWorker {
  readonly events = new EventEmitter();
  readonly posts: unknown[] = [];
  readonly terminate = vi.fn(async () => {
    this.events.emit("exit", 0);
    return 0;
  });

  postMessage(message: unknown): void {
    this.posts.push(message);
  }
  on(event: "message", listener: (message: unknown) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "exit", listener: (code: number) => void): this;
  on(event: string, listener: (...args: never[]) => void): this {
    this.events.on(event, listener as (...args: unknown[]) => void);
    return this;
  }
}

describe("Structural Worker review regressions", () => {
  it("disposes without hanging while Worker startup is pending", async () => {
    const worker = new StartingWorker();
    const client = new StructuralWorkerClient("/workspace", () => worker);
    const operation = client.execute({ operation: "outline", file: "test.ts" });
    await vi.waitFor(() => expect(worker.terminate).not.toHaveBeenCalled());
    await new Promise((resolve) => setImmediate(resolve));

    await client.dispose();
    await new Promise((resolve) => setImmediate(resolve));

    await expect(operation).resolves.toEqual({
      kind: "runtime-error",
      message: "Structural Worker is shut down",
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.posts).toEqual([]);
  });

  it("bounds the startup mailbox at 32 queued requests", async () => {
    const worker = new StartingWorker();
    const client = new StructuralWorkerClient("/workspace", () => worker);
    try {
      const accepted = Array.from({ length: 32 }, (_, index) =>
        client.execute({ operation: "outline", file: `${index}.ts` }),
      );
      await expect(client.execute({ operation: "outline", file: "overflow.ts" })).resolves.toEqual({
        kind: "runtime-error",
        message: "Structural Worker mailbox is busy",
      });
      await client.dispose();
      await Promise.all(accepted);
    } finally {
      await client.dispose();
    }
  });

  it("does not return completed evidence after a caller abort wins at terminal", async () => {
    const worker = new StartingWorker();
    const client = new StructuralWorkerClient("/workspace", () => {
      queueMicrotask(() =>
        worker.events.emit("message", {
          kind: "ready",
          version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
          generation: 1,
        }),
      );
      return worker;
    });
    const abortController = new AbortController();
    const outcome = client.execute(
      { operation: "outline", file: "test.ts" },
      { signal: abortController.signal },
    );
    await vi.waitFor(() => expect(worker.posts).toHaveLength(1));
    const request = worker.posts[0] as { requestId: string };
    const payload = Buffer.from(JSON.stringify({ kind: "success", data: [] }), "utf8");
    worker.events.emit("message", {
      kind: "chunk",
      version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
      generation: 1,
      requestId: request.requestId,
      sequence: 0,
      final: true,
      encodedBytes: payload.byteLength,
      payload,
    });
    await new Promise((resolve) => setImmediate(resolve));
    abortController.abort(new Error("caller stopped"));
    worker.events.emit("message", {
      kind: "terminal",
      version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
      generation: 1,
      requestId: request.requestId,
      outcome: "completed",
    });

    await expect(outcome).rejects.toThrow("caller stopped");
    await client.dispose();
  });

  it("rejects an oversize request before it is posted", async () => {
    const worker = new StartingWorker();
    const client = new StructuralWorkerClient("/workspace", () => {
      queueMicrotask(() =>
        worker.events.emit("message", {
          kind: "ready",
          version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
          generation: 1,
        }),
      );
      return worker;
    });
    try {
      await expect(
        client.execute({ operation: "canParse", file: `${"x".repeat(600_000)}.ts` }),
      ).resolves.toEqual({
        kind: "runtime-error",
        message: "Structural Worker message exceeds the byte limit",
      });
      expect(worker.posts).toEqual([]);
    } finally {
      await client.dispose();
    }
  });
});
