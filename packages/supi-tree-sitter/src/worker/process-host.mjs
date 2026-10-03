import { Worker } from "node:worker_threads";

const [cwd, generationValue] = process.argv.slice(2);
const generation = Number(generationValue);
if (!cwd || !Number.isSafeInteger(generation) || generation < 1) {
  throw new Error("Structural Worker process received invalid startup data");
}

const worker = new Worker(new URL("./bootstrap.mjs", import.meta.url), {
  execArgv: [],
  workerData: { cwd, generation },
});
const cancellationFlags = new Map();
let closing = false;
let workerExited = false;

worker.on("message", (message) => {
  if (message.kind === "terminal") cancellationFlags.delete(message.requestId);
  send({ channel: "supi-tree-sitter-worker", message });
});
worker.on("error", (error) => {
  send(
    {
      channel: "supi-tree-sitter-worker",
      message: { kind: "worker-error", message: error.message },
    },
    () => stopWorker(1),
  );
});
worker.on("exit", (code) => {
  workerExited = true;
  cancellationFlags.clear();
  process.exitCode = code === 0 ? 1 : code;
  disconnect();
});

process.on("message", (value) => {
  if (!isParentChannel(value)) {
    stopWorker(1);
    return;
  }
  forwardToWorker(value.message);
});
process.on("disconnect", () => stopWorker());
if (!process.connected) stopWorker();

function forwardToWorker(message) {
  if (!message || typeof message !== "object") {
    throw new Error("Structural Worker process received an invalid message");
  }
  if (message.kind === "request") {
    if (cancellationFlags.size !== 0) {
      throw new Error("Structural Worker process received overlapping requests");
    }
    // The process host creates the flag that it can share with its Worker thread.
    const buffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
    cancellationFlags.set(message.requestId, new Int32Array(buffer));
    worker.postMessage({ ...message, cancellationFlag: buffer });
    return;
  }
  if (message.kind === "cancel") {
    const cancellationFlag = cancellationFlags.get(message.requestId);
    if (cancellationFlag) Atomics.store(cancellationFlag, 0, 1);
  }
  worker.postMessage(message);
}

function isParentChannel(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    value.channel === "supi-tree-sitter-parent" &&
    value.message !== null &&
    typeof value.message === "object"
  );
}

function send(message, callback) {
  if (process.connected && process.send) process.send(message, callback);
}

function disconnect() {
  if (process.connected) process.disconnect();
}

function stopWorker(exitCode) {
  if (closing || workerExited) return;
  closing = true;
  if (exitCode !== undefined) process.exitCode = exitCode;
  cancellationFlags.clear();
  void worker.terminate().finally(disconnect);
}
