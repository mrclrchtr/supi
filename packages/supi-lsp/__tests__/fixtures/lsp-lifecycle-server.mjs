import * as fs from "node:fs";

let input = Buffer.alloc(0);
const mode = process.argv[2] ?? "stable";
const delayMs = Number(process.argv[3] ?? 50);
const crashMarker = process.argv[4];
const pushLongDelayMs = Number(process.argv[3] ?? 1000);
const pushShortDelayMs = Number(process.argv[5] ?? 50);

function send(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

const progressSequence = process.argv[3] ?? "normal";
const progressStepMs = Number(process.argv[4] ?? 40);

let pushDelayMs = pushLongDelayMs;
if (mode === "push" && crashMarker) {
  try {
    const descriptor = fs.openSync(crashMarker, "wx");
    fs.closeSync(descriptor);
  } catch {
    // The marker exists: this process is a replacement, publish quickly.
    pushDelayMs = pushShortDelayMs;
  }
}

function schedulePush(textDocument) {
  const { uri, version } = textDocument;
  setTimeout(() => publishDiagnostics(uri, version), pushDelayMs);
}

function sendProgressNotification(token, kind) {
  send({
    jsonrpc: "2.0",
    method: "$/progress",
    params: {
      token,
      value: { kind, title: kind === "begin" ? "Indexing" : undefined },
    },
  });
}

function runProgressSequence(sequence, stepMs) {
  const token = "progress-token-1";
  const at = (step, run) => setTimeout(run, step * stepMs);
  switch (sequence) {
    case "create-only":
      at(0, () =>
        send({
          jsonrpc: "2.0",
          id: 99,
          method: "window/workDoneProgress/create",
          params: { token },
        }),
      );
      return;
    case "begin-only":
      at(1, () => sendProgressNotification(token, "begin"));
      return;
    case "end-only":
      at(1, () => sendProgressNotification(token, "end"));
      return;
    case "duplicate-create":
      at(0, () =>
        send({
          jsonrpc: "2.0",
          id: 99,
          method: "window/workDoneProgress/create",
          params: { token },
        }),
      );
      at(1, () =>
        send({
          jsonrpc: "2.0",
          id: 100,
          method: "window/workDoneProgress/create",
          params: { token },
        }),
      );
      at(2, () => sendProgressNotification(token, "begin"));
      at(3, () => sendProgressNotification(token, "end"));
      return;
    default:
      at(0, () =>
        send({
          jsonrpc: "2.0",
          id: 99,
          method: "window/workDoneProgress/create",
          params: { token },
        }),
      );
      at(1, () => sendProgressNotification(token, "begin"));
      at(2, () => sendProgressNotification(token, "report"));
      at(3, () => sendProgressNotification(token, "end"));
  }
}

function publishDiagnostics(uri, version) {
  send({
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params: {
      uri,
      ...(version !== undefined ? { version } : {}),
      diagnostics: [
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          severity: 1,
          message: `fresh-${process.pid}`,
        },
      ],
    },
  });
}

function handle(message) {
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { capabilities: {} } });
    return;
  }
  if (message.method === "initialized" && shouldCrash()) {
    setTimeout(() => process.exit(17), delayMs);
    return;
  }
  if (mode === "progress" && message.method === "initialized") {
    runProgressSequence(progressSequence, progressStepMs);
    return;
  }
  if (mode === "push" && message.method === "textDocument/didOpen") {
    schedulePush(message.params.textDocument);
    return;
  }
  if (mode === "push" && message.method === "textDocument/didChange") {
    schedulePush(message.params.textDocument);
    return;
  }
  if (message.method === "shutdown") {
    send({ jsonrpc: "2.0", id: message.id, result: null });
    return;
  }
  if (message.method === "exit") process.exit(0);
}

function shouldCrash() {
  if (mode === "crash") return true;
  if (mode !== "crash-once" || !crashMarker) return false;
  try {
    const descriptor = fs.openSync(crashMarker, "wx");
    fs.closeSync(descriptor);
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  }
}

function drain() {
  while (true) {
    const headerEnd = input.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const header = input.subarray(0, headerEnd).toString("ascii");
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) process.exit(2);
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    if (input.length < bodyStart + length) return;
    const body = input.subarray(bodyStart, bodyStart + length).toString("utf8");
    input = input.subarray(bodyStart + length);
    handle(JSON.parse(body));
  }
}

process.stdin.on("data", (chunk) => {
  input = Buffer.concat([input, chunk]);
  drain();
});
