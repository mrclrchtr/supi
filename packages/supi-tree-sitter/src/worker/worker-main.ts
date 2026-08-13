import type { MessagePort } from "node:worker_threads";
import { isCodeRequestDeadlineError } from "@mrclrchtr/supi-code-runtime/api";
import type { StructuralTimingEvent } from "../session/structural-timing.ts";
import { assertStructuralProtocolMessageSize } from "../session/structural-worker-message-size.ts";
import {
  encodeStructuralResult,
  type ParentToStructuralWorkerMessage,
  STRUCTURAL_WORKER_PROTOCOL_VERSION,
  type StructuralWorkerChunkAckMessage,
  type StructuralWorkerRequestMessage,
} from "../session/structural-worker-protocol.ts";
import type { TreeSitterResult } from "../types.ts";
import type { StructuralRequestControl } from "./request-control.ts";
import { TreeSitterRuntime } from "./runtime.ts";
import { StructuralWorkerService } from "./service.ts";

interface WorkerBootstrapData {
  readonly cwd: string;
  readonly generation: number;
}

interface ActiveWorkerRequest {
  readonly message: StructuralWorkerRequestMessage;
  readonly control: StructuralRequestControl;
  readonly abortController: AbortController;
  chunks: Uint8Array[];
  nextSequence: number;
  awaitingAck: boolean;
  outcome: "completed" | "cancelled" | "timeout";
}

/** Start the package-private Structural Worker implementation. */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: one Worker loop owns active request and chunk acknowledgement state
export async function runStructuralWorker(
  parentPort: MessagePort,
  workerData: WorkerBootstrapData,
): Promise<void> {
  const runtime = new TreeSitterRuntime(workerData.cwd, (event) => forwardObservation(event));
  const service = new StructuralWorkerService(runtime);
  let active: ActiveWorkerRequest | null = null;

  const post = (message: unknown) => {
    assertStructuralProtocolMessageSize(message);
    parentPort.postMessage(message);
  };
  const forwardObservation = (observation: StructuralTimingEvent) => {
    if (!active) return;
    post({
      kind: "observation",
      version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
      generation: workerData.generation,
      requestId: active.message.requestId,
      observation,
    });
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: protocol dispatch keeps request, cancel, and acknowledgement validation together
  parentPort.on("message", (message: ParentToStructuralWorkerMessage) => {
    if (message.version !== STRUCTURAL_WORKER_PROTOCOL_VERSION) return;
    if (message.generation !== workerData.generation) return;
    if (message.kind === "cancel") {
      if (active?.message.requestId === message.requestId) active.abortController.abort();
      return;
    }
    if (message.kind === "chunk-ack") {
      if (active?.message.requestId === message.requestId) sendNextChunk(message);
      return;
    }
    if (message.kind !== "request" || active) return;
    void execute(message);
  });

  try {
    await runtime.ensureGrammarParser("javascript");
    post({
      kind: "ready",
      version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
      generation: workerData.generation,
    });
  } catch (error) {
    post({
      kind: "startup-failure",
      version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
      generation: workerData.generation,
      message: error instanceof Error ? error.message : "Structural Worker startup failed",
    });
    runtime.dispose();
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one terminal boundary classifies every operation result and interruption
  async function execute(message: StructuralWorkerRequestMessage): Promise<void> {
    const abortController = new AbortController();
    const cancellationFlag = new Int32Array(message.cancellationFlag);
    const control: StructuralRequestControl = {
      signal: abortController.signal,
      deadline: message.deadline,
      cancellationFlag,
    };
    active = {
      message,
      control,
      abortController,
      chunks: [],
      nextSequence: 0,
      awaitingAck: false,
      outcome: "completed",
    };
    let result: TreeSitterResult<unknown>;
    try {
      result = await service.execute(message.input, control);
    } catch (error) {
      const timedOut =
        isCodeRequestDeadlineError(error) ||
        (message.deadline !== undefined && Date.now() >= message.deadline);
      const cancelled = abortController.signal.aborted || Atomics.load(cancellationFlag, 0) !== 0;
      active.outcome = timedOut ? "timeout" : cancelled ? "cancelled" : "completed";
      result = {
        kind: "runtime-error",
        message: timedOut
          ? "Structural request deadline exceeded"
          : cancelled
            ? "Structural request cancelled"
            : error instanceof Error
              ? error.message
              : "Structural Worker operation failed",
      };
    }
    if (!active || active.message.requestId !== message.requestId) return;
    try {
      active.chunks = encodeStructuralResult(result);
    } catch (error) {
      active.chunks = encodeStructuralResult({
        kind: "runtime-error",
        message: error instanceof Error ? error.message : "Structural result encoding failed",
      });
    }
    sendChunk();
  }

  function sendNextChunk(message: StructuralWorkerChunkAckMessage): void {
    if (!active?.awaitingAck || message.sequence !== active.nextSequence - 1) return;
    active.awaitingAck = false;
    if (active.nextSequence >= active.chunks.length) {
      postTerminal();
      return;
    }
    sendChunk();
  }

  function sendChunk(): void {
    if (!active || active.awaitingAck) return;
    updateInterruptionOutcome(active);
    const sequence = active.nextSequence;
    const payload = active.chunks[sequence];
    if (!payload) {
      postTerminal();
      return;
    }
    active.nextSequence += 1;
    active.awaitingAck = true;
    post({
      kind: "chunk",
      version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
      generation: workerData.generation,
      requestId: active.message.requestId,
      sequence,
      final: active.nextSequence === active.chunks.length,
      encodedBytes: payload.byteLength,
      payload,
    });
  }

  function postTerminal(): void {
    if (!active) return;
    updateInterruptionOutcome(active);
    post({
      kind: "terminal",
      version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
      generation: workerData.generation,
      requestId: active.message.requestId,
      outcome: active.outcome,
    });
    active = null;
  }

  function updateInterruptionOutcome(request: ActiveWorkerRequest): void {
    if (request.message.deadline !== undefined && Date.now() >= request.message.deadline) {
      request.outcome = "timeout";
    } else if (
      request.abortController.signal.aborted ||
      (request.control.cancellationFlag !== undefined &&
        Atomics.load(request.control.cancellationFlag, 0) !== 0)
    ) {
      request.outcome = "cancelled";
    }
  }
}
