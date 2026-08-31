import { EventEmitter } from "node:events";
import type { MessagePort } from "node:worker_threads";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureGrammarParser: vi.fn(async () => undefined),
  execute: vi.fn(async () => ({ kind: "success" as const, data: [] })),
}));

vi.mock("../../src/worker/runtime.ts", () => ({
  TreeSitterRuntime: class {
    ensureGrammarParser = mocks.ensureGrammarParser;

    dispose(): void {}
  },
}));

vi.mock("../../src/worker/service.ts", () => ({
  StructuralWorkerService: class {
    execute = mocks.execute;
  },
}));

import { STRUCTURAL_WORKER_PROTOCOL_VERSION } from "../../src/session/structural-worker-protocol.ts";
import { runStructuralWorker } from "../../src/worker/worker-main.ts";

class FakeParentPort {
  readonly emitter = new EventEmitter();
  readonly posts: unknown[] = [];

  postMessage(message: unknown): void {
    this.posts.push(message);
  }

  on(event: "message", listener: (message: unknown) => void): this;
  on(event: string, listener: (...args: never[]) => void): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  emitMessage(message: unknown): void {
    this.emitter.emit("message", message);
  }
}

beforeEach(() => {
  mocks.ensureGrammarParser.mockClear();
  mocks.execute.mockClear();
});

describe("Structural Worker parent message boundary", () => {
  it.each([
    ["null", null],
    ["a primitive", "request"],
    ["an array", []],
    [
      "a malformed operation",
      {
        ...request(),
        input: { operation: "outline", file: "test.ts", extra: true },
      },
    ],
    ["a cancel with an extra key", { ...cancel(), extra: true }],
    ["an acknowledgement with an invalid sequence", { ...acknowledgement(), sequence: "0" }],
  ])("fails on %s instead of ignoring the message", async (_description, message) => {
    const { port } = await startWorker();

    expect(() => port.emitMessage(message)).toThrow(/protocol violation/);
  });

  it("does not inspect or accept malformed stale-generation messages", async () => {
    const { port } = await startWorker();

    expect(() =>
      port.emitMessage({
        ...request(),
        generation: 2,
        input: { operation: "outline", file: "test.ts", extra: true },
      }),
    ).not.toThrow();
  });

  it.each([
    ["cancellation", { ...cancel(), requestId: "request-other" }],
    ["acknowledgement", { ...acknowledgement(), requestId: "request-other" }],
  ])("fails an active Worker when a %s does not own the request", async (_kind, message) => {
    const { port } = await startWorker();
    port.emitMessage(request());
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledOnce());

    expect(() => port.emitMessage(message)).toThrow("Message does not own the active request");
  });

  it("fails an active Worker on an invalid acknowledgement state", async () => {
    const { port } = await startWorker();
    port.emitMessage(request());
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledOnce());

    expect(() => port.emitMessage({ ...acknowledgement(), sequence: 1 })).toThrow(
      "Invalid chunk acknowledgement state",
    );
  });
});

async function startWorker(): Promise<{ port: FakeParentPort }> {
  const port = new FakeParentPort();
  await runStructuralWorker(port as unknown as MessagePort, {
    cwd: "/workspace",
    generation: 1,
  });
  expect(port.posts).toContainEqual({
    kind: "ready",
    version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
    generation: 1,
  });
  return { port };
}

function request() {
  return {
    kind: "request" as const,
    version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
    generation: 1,
    requestId: "request-1",
    input: { operation: "outline" as const, file: "test.ts" },
    cancellationFlag: new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),
  };
}

function cancel() {
  return {
    kind: "cancel" as const,
    version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
    generation: 1,
    requestId: "request-1",
  };
}

function acknowledgement() {
  return {
    kind: "chunk-ack" as const,
    version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
    generation: 1,
    requestId: "request-1",
    sequence: 0,
  };
}
