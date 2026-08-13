// biome-ignore-all lint/style/noExcessiveLinesPerFile: one mailbox state machine owns all Worker lifecycle transitions
import { setImmediate as yieldImmediate } from "node:timers/promises";
import { Worker } from "node:worker_threads";
import {
  type CodeRequestControl,
  CodeRequestDeadlineError,
  isCodeRequestDeadlineError,
  isCodeRequestInterruption,
  throwIfCodeRequestInterrupted,
} from "@mrclrchtr/supi-code-runtime/api";
import type { TreeSitterResult } from "../types.ts";
import { publishStructuralTimingEvent } from "./structural-timing.ts";
import { StructuralWorkerLifecycle } from "./structural-worker-client-lifecycle.ts";
import { assertStructuralProtocolMessageSize } from "./structural-worker-message-size.ts";
import {
  decodeStructuralResult,
  type ParentToStructuralWorkerMessage,
  STRUCTURAL_WORKER_LIMITS,
  STRUCTURAL_WORKER_PROTOCOL_VERSION,
  type StructuralWorkerOperation,
  type StructuralWorkerToParentMessage,
  validateWorkerToParentMessage,
} from "./structural-worker-protocol.ts";

interface StructuralWorkerLike {
  postMessage(message: ParentToStructuralWorkerMessage): void;
  on(event: "message", listener: (message: unknown) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "exit", listener: (code: number) => void): this;
  terminate(): Promise<number>;
}

export type StructuralWorkerFactory = (options: {
  readonly cwd: string;
  readonly generation: number;
}) => StructuralWorkerLike;

const TEST_WORKER_FACTORY = Symbol.for("supi-tree-sitter/test-worker-factory");

/** Install a process-local Worker factory for integration tests. */
export function setStructuralWorkerFactoryForTests(
  factory: StructuralWorkerFactory | undefined,
): void {
  const state = globalThis as typeof globalThis & {
    [TEST_WORKER_FACTORY]?: StructuralWorkerFactory;
  };
  if (factory) state[TEST_WORKER_FACTORY] = factory;
  else delete state[TEST_WORKER_FACTORY];
}

interface PendingRequest<T> {
  readonly id: string;
  readonly input: StructuralWorkerOperation;
  readonly control?: CodeRequestControl;
  readonly cancellationBuffer: SharedArrayBuffer;
  readonly cancellationFlag: Int32Array;
  readonly resolve: (value: TreeSitterResult<T>) => void;
  readonly reject: (error: unknown) => void;
  cleanupControl(): void;
  chunks: Uint8Array[];
  nextSequence: number;
  assembledBytes: number;
  awaitingAck: number | null;
  finalSequence: number | null;
  settled: boolean;
  hardStopTimer: NodeJS.Timeout | null;
}

interface ActiveWorker {
  readonly generation: number;
  readonly worker: StructuralWorkerLike;
  ready: boolean;
  startupSettled: boolean;
  readonly settleStartupFailure: (message: string) => void;
}

/** Parent-owned asynchronous proxy for exactly one long-lived Structural Worker. */
export class StructuralWorkerClient {
  readonly #cwd: string;
  readonly #factory: StructuralWorkerFactory;
  #worker: ActiveWorker | null = null;
  #queue: PendingRequest<unknown>[] = [];
  #active: PendingRequest<unknown> | null = null;
  #generation = 0;
  #requestSequence = 0;
  #closed = false;
  #unavailableReason: string | null = null;
  #startupFailures = 0;
  #starting: Promise<void> | null = null;
  readonly #lifecycle = new StructuralWorkerLifecycle();
  #disposePromise: Promise<void> | null = null;

  constructor(cwd: string, factory?: StructuralWorkerFactory) {
    this.#cwd = cwd;
    this.#factory = factory ?? testWorkerFactory() ?? createProductionWorker;
  }

  /** Start and validate the owned Worker without running parser work on the parent. */
  async start(): Promise<void> {
    if (this.#closed) throw new Error("Structural Worker client is closed");
    if (this.#worker?.ready) return;
    if (this.#unavailableReason) throw new Error(this.#unavailableReason);
    this.#starting ??= this.#lifecycle.run(() => this.#startWithRetry());
    return this.#starting;
  }

  async #startWithRetry(): Promise<void> {
    try {
      await this.#startGeneration();
      this.#startupFailures = 0;
    } catch (error) {
      await this.#startupFailure(errorMessage(error));
      if (this.#unavailableReason) throw new Error(this.#unavailableReason, { cause: error });
    } finally {
      this.#starting = null;
    }
  }

  /** Admit one operation to the fixed FIFO mailbox. */
  async execute<T>(
    input: StructuralWorkerOperation,
    control?: CodeRequestControl,
  ): Promise<TreeSitterResult<T>> {
    throwIfCodeRequestInterrupted(control);
    if (this.#closed) return runtimeError("Structural Worker is shut down");
    if (this.#unavailableReason) return runtimeError(this.#unavailableReason);
    if (this.#queue.length >= STRUCTURAL_WORKER_LIMITS.maxQueuedRequests) {
      return runtimeError("Structural Worker mailbox is busy");
    }

    return new Promise<TreeSitterResult<T>>((resolve, reject) => {
      const cancellationBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
      const pending: PendingRequest<T> = {
        id: `structural-${++this.#requestSequence}`,
        input,
        control,
        cancellationBuffer,
        cancellationFlag: new Int32Array(cancellationBuffer),
        resolve,
        reject,
        cleanupControl() {},
        chunks: [],
        nextSequence: 0,
        assembledBytes: 0,
        awaitingAck: null,
        finalSequence: null,
        settled: false,
        hardStopTimer: null,
      };
      this.#attachControl(pending as PendingRequest<unknown>);
      this.#queue.push(pending as PendingRequest<unknown>);
      void this.start().then(
        () => this.#dispatch(),
        () => undefined,
      );
    });
  }

  /** Stop admission, settle requests, terminate the Worker, and await exit. */
  dispose(): Promise<void> {
    this.#disposePromise ??= this.#dispose();
    return this.#disposePromise;
  }

  async #dispose(): Promise<void> {
    this.#closed = true;
    ++this.#generation;
    this.#unavailableReason = "Structural Worker is shut down";
    for (const request of this.#queue.splice(0))
      this.#settle(request, runtimeError("Structural Worker is shut down"));
    if (this.#active) {
      const active = this.#active;
      Atomics.store(active.cancellationFlag, 0, 1);
      this.#active = null;
      this.#settle(active, runtimeError("Structural Worker is shut down"));
    }
    const owned = this.#worker;
    this.#worker = null;
    owned?.settleStartupFailure("Structural Worker is shut down");
    this.#starting = null;
    await this.#lifecycle.terminate(owned?.worker ?? null);
    await this.#lifecycle.settled();
  }

  async #startGeneration(): Promise<void> {
    const generation = ++this.#generation;
    const worker = this.#factory({ cwd: this.#cwd, generation });
    let rejectStartup = (_message: string) => {};
    const active: ActiveWorker = {
      generation,
      worker,
      ready: false,
      startupSettled: false,
      settleStartupFailure: (message) => rejectStartup(message),
    };
    this.#worker = active;

    await new Promise<void>((resolve, reject) => {
      const settleReady = () => {
        if (active.startupSettled) return;
        active.startupSettled = true;
        active.ready = true;
        this.#startupFailures = 0;
        resolve();
      };
      const settleFailure = (message: string) => {
        if (active.startupSettled) return;
        active.startupSettled = true;
        reject(new Error(message));
      };
      rejectStartup = settleFailure;
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: startup and active protocol states share one fenced Worker listener
      worker.on("message", (value) => {
        const validation = validateWorkerToParentMessage(value);
        if (validation.kind === "invalid") {
          settleFailure(validation.reason);
          return;
        }
        const message = validation.message;
        if (this.#worker !== active || message.generation !== generation) return;
        if (message.kind === "ready") {
          settleReady();
          return;
        }
        if (message.kind === "startup-failure") {
          settleFailure(message.message);
          return;
        }
        if (!active.ready) {
          settleFailure("Structural Worker sent work before readiness");
          return;
        }
        void this.#handleMessage(message);
      });
      worker.on("error", (error) => {
        settleFailure(error.message);
        if (this.#worker === active && active.ready) {
          void this.#lifecycle.run(() => this.#workerFailure(error.message));
        }
      });
      worker.on("exit", (code) => {
        settleFailure(`Structural Worker exited with code ${code}`);
        if (!this.#closed && this.#worker === active && active.ready) {
          void this.#lifecycle.run(() =>
            this.#workerFailure(`Structural Worker exited with code ${code}`),
          );
        }
      });
    });
  }

  #dispatch(): void {
    if (this.#closed || this.#active || !this.#worker?.ready) return;
    while (this.#queue.length > 0) {
      const request = this.#queue.shift();
      if (!request) return;
      try {
        throwIfCodeRequestInterrupted(request.control);
      } catch (error) {
        this.#reject(request, error);
        continue;
      }
      this.#active = request;
      const message = {
        kind: "request",
        version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
        generation: this.#worker.generation,
        requestId: request.id,
        input: request.input,
        deadline: request.control?.deadline,
        cancellationFlag: request.cancellationBuffer,
      } as const;
      try {
        assertStructuralProtocolMessageSize(message);
        this.#worker.worker.postMessage(message);
      } catch (error) {
        this.#active = null;
        this.#settle(request, runtimeError(errorMessage(error)));
        continue;
      }
      return;
    }
  }

  async #handleMessage(message: StructuralWorkerToParentMessage): Promise<void> {
    if (message.kind === "observation") {
      if (this.#active?.id !== message.requestId)
        return this.#protocolFailure("Unknown observation request id");
      assertStructuralProtocolMessageSize(message);
      publishStructuralTimingEvent(message.observation);
      return;
    }
    if (message.kind === "chunk") return this.#handleChunk(message);
    if (message.kind === "terminal") return this.#handleTerminal(message);
  }

  async #handleChunk(
    message: Extract<StructuralWorkerToParentMessage, { kind: "chunk" }>,
  ): Promise<void> {
    const active = this.#active;
    if (!active || active.id !== message.requestId)
      return this.#protocolFailure("Unknown chunk request id");
    if (active.awaitingAck !== null) {
      return this.#protocolFailure("Structural Worker sent more than one unacknowledged chunk");
    }
    if (message.sequence !== active.nextSequence)
      return this.#protocolFailure("Invalid chunk sequence");
    if (active.assembledBytes + message.encodedBytes > STRUCTURAL_WORKER_LIMITS.maxResultBytes) {
      return this.#protocolFailure("Structural result exceeds the byte limit");
    }
    try {
      throwIfCodeRequestInterrupted(active.control);
    } catch (error) {
      this.#interrupt(active, error);
      return;
    }
    active.chunks.push(Uint8Array.from(message.payload));
    active.nextSequence += 1;
    active.assembledBytes += message.encodedBytes;
    active.awaitingAck = message.sequence;
    if (message.final) active.finalSequence = message.sequence;
    await yieldImmediate();
    if (this.#active !== active || !this.#worker) return;
    active.awaitingAck = null;
    this.#worker.worker.postMessage({
      kind: "chunk-ack",
      version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
      generation: this.#worker.generation,
      requestId: active.id,
      sequence: message.sequence,
    });
  }

  async #handleTerminal(
    message: Extract<StructuralWorkerToParentMessage, { kind: "terminal" }>,
  ): Promise<void> {
    const active = this.#active;
    if (!active || active.id !== message.requestId)
      return this.#protocolFailure("Unknown terminal request id");
    if (active.settled) return this.#protocolFailure("Duplicate terminal message");
    if (active.awaitingAck !== null || active.finalSequence !== active.nextSequence - 1) {
      return this.#protocolFailure(
        "Structural Worker terminal preceded the final chunk acknowledgement",
      );
    }
    this.#active = null;
    if (message.outcome === "cancelled") {
      const reason = active.control?.signal?.reason ?? new DOMException("Aborted", "AbortError");
      this.#reject(active, reason);
    } else if (message.outcome === "timeout") {
      this.#reject(active, new CodeRequestDeadlineError());
    } else if (active.control?.deadline !== undefined && Date.now() >= active.control.deadline) {
      this.#reject(active, new CodeRequestDeadlineError());
    } else if (active.control?.signal?.aborted) {
      this.#reject(
        active,
        active.control.signal.reason ?? new DOMException("Aborted", "AbortError"),
      );
    } else {
      try {
        this.#settle(active, decodeStructuralResult(active.chunks));
      } catch (error) {
        this.#reject(active, error);
      }
    }
    this.#dispatch();
  }

  #attachControl(request: PendingRequest<unknown>): void {
    const signal = request.control?.signal;
    const deadline = request.control?.deadline;
    const abort = () =>
      this.#interrupt(request, signal?.reason ?? new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    let deadlineTimer: NodeJS.Timeout | null = null;
    if (deadline !== undefined) {
      deadlineTimer = setTimeout(
        () => this.#interrupt(request, new CodeRequestDeadlineError()),
        Math.max(0, deadline - Date.now()),
      );
      deadlineTimer.unref?.();
    }
    request.cleanupControl = () => {
      signal?.removeEventListener("abort", abort);
      if (deadlineTimer) clearTimeout(deadlineTimer);
      if (request.hardStopTimer) clearTimeout(request.hardStopTimer);
    };
  }

  #interrupt(request: PendingRequest<unknown>, error: unknown): void {
    if (request.settled) return;
    const queuedIndex = this.#queue.indexOf(request);
    if (queuedIndex >= 0) {
      this.#queue.splice(queuedIndex, 1);
      this.#reject(request, error);
      return;
    }
    if (this.#active !== request || !this.#worker) return;
    Atomics.store(request.cancellationFlag, 0, 1);
    this.#worker.worker.postMessage({
      kind: "cancel",
      version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
      generation: this.#worker.generation,
      requestId: request.id,
    });
    request.hardStopTimer = setTimeout(
      () => void this.#hardStop(request, error),
      STRUCTURAL_WORKER_LIMITS.hardStopGraceMs,
    );
    request.hardStopTimer.unref?.();
  }

  async #hardStop(request: PendingRequest<unknown>, error: unknown): Promise<void> {
    if (this.#active !== request || request.settled) return;
    this.#active = null;
    this.#reject(request, error);
    await this.#lifecycle.run(() => this.#restart("Structural Worker hard stop"));
  }

  async #protocolFailure(reason: string): Promise<void> {
    const active = this.#active;
    this.#active = null;
    if (active) this.#settle(active, runtimeError(`Structural Worker protocol failure: ${reason}`));
    await this.#restart(reason);
  }

  async #workerFailure(reason: string): Promise<void> {
    const active = this.#active;
    this.#active = null;
    if (active) this.#settle(active, runtimeError(reason));
    await this.#restart(reason);
  }

  async #startupFailure(reason: string): Promise<void> {
    if (this.#closed) return;
    this.#startupFailures += 1;
    if (this.#startupFailures >= 2) {
      this.#unavailableReason = `Structural capability unavailable: ${reason}`;
      const failed = this.#worker;
      this.#worker = null;
      failed?.settleStartupFailure("Structural capability unavailable");
      if (failed) await failed.worker.terminate().catch(() => 0);
      this.#failQueued(this.#unavailableReason);
      return;
    }
    const old = this.#worker;
    this.#worker = null;
    old?.settleStartupFailure("Structural Worker startup retry");
    if (old) await old.worker.terminate().catch(() => 0);
    if (this.#closed) return;
    try {
      await this.#startGeneration();
      this.#dispatch();
    } catch (error) {
      await this.#startupFailure(errorMessage(error));
    }
    if (this.#unavailableReason) this.#failQueued(this.#unavailableReason);
  }

  async #restart(_reason: string): Promise<void> {
    if (this.#closed) return;
    const old = this.#worker;
    const generation = ++this.#generation;
    this.#worker = null;
    old?.settleStartupFailure("Structural Worker restart");
    this.#starting = (async () => {
      if (old) await old.worker.terminate().catch(() => 0);
      if (this.#closed || generation !== this.#generation) return;
      await this.#startGeneration();
    })();
    try {
      await this.#starting;
      this.#startupFailures = 0;
      this.#dispatch();
    } catch (error) {
      await this.#startupFailure(errorMessage(error));
    }
  }

  #failQueued(message: string): void {
    for (const request of this.#queue.splice(0)) this.#settle(request, runtimeError(message));
  }

  #settle<T>(request: PendingRequest<T>, result: TreeSitterResult<T>): void {
    if (request.settled) return;
    request.settled = true;
    request.cleanupControl();
    request.resolve(result);
  }

  #reject(request: PendingRequest<unknown>, error: unknown): void {
    if (request.settled) return;
    request.settled = true;
    request.cleanupControl();
    if (isCodeRequestInterruption(error, request.control) || isCodeRequestDeadlineError(error))
      request.reject(error);
    else request.reject(error);
  }
}

function testWorkerFactory(): StructuralWorkerFactory | undefined {
  return (globalThis as typeof globalThis & { [TEST_WORKER_FACTORY]?: StructuralWorkerFactory })[
    TEST_WORKER_FACTORY
  ];
}

function createProductionWorker(options: {
  cwd: string;
  generation: number;
}): StructuralWorkerLike {
  return new Worker(new URL("../worker/bootstrap.mjs", import.meta.url), {
    execArgv: [],
    workerData: options,
  });
}

function runtimeError<T = never>(message: string): TreeSitterResult<T> {
  return { kind: "runtime-error", message };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Structural Worker failed";
}
