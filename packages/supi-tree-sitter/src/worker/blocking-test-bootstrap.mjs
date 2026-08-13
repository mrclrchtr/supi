// Package-owned deterministic test Worker. Production never selects this entry.
import { parentPort, workerData } from "node:worker_threads";

const version = 1;
parentPort.postMessage({ kind: "ready", version, generation: workerData.generation });
parentPort.on("message", (message) => {
  if (message.kind !== "request") return;
  const started = Date.now();
  while (Date.now() - started < 120) {
    // Block only this test Worker thread.
  }
  const payload = Buffer.from(JSON.stringify({ kind: "success", data: [] }), "utf8");
  parentPort.postMessage({
    kind: "chunk",
    version,
    generation: workerData.generation,
    requestId: message.requestId,
    sequence: 0,
    final: true,
    encodedBytes: payload.byteLength,
    payload,
  });
});

parentPort.on("message", (message) => {
  if (message.kind !== "chunk-ack") return;
  parentPort.postMessage({
    kind: "terminal",
    version,
    generation: workerData.generation,
    requestId: message.requestId,
    outcome: "completed",
  });
});
