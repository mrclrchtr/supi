import * as fs from "node:fs";

let input = Buffer.alloc(0);
const logPath = process.argv[2];
const controlPath = process.argv[3];
const responseDelayMs = Number(process.argv[4] ?? 150);
const documents = new Map();
const pendingRefreshes = new Set();
let nextRequestId = 1000;
let refreshGeneration = 0;
let activeDiagnosticRequests = 0;
let maxActiveDiagnosticRequests = 0;
let lastCommand = "";

function log(method, params) {
  fs.appendFileSync(logPath, `${JSON.stringify({ method, params })}\n`);
}

function send(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function sendRefreshRequests(count) {
  for (let index = 0; index < count; index++) {
    refreshGeneration++;
    const id = nextRequestId++;
    pendingRefreshes.add(id);
    log("test/refresh-sent", { generation: refreshGeneration, id });
    send({ jsonrpc: "2.0", id, method: "workspace/diagnostic/refresh", params: null });
  }
}

function pollControlFile() {
  let command;
  try {
    command = fs.readFileSync(controlPath, "utf8").trim();
  } catch {
    return;
  }
  if (!command || command === lastCommand) return;
  lastCommand = command;
  if (command.startsWith("burst:")) {
    const count = Number(command.slice("burst:".length));
    sendRefreshRequests(Number.isInteger(count) && count > 0 ? count : 1);
    return;
  }
  sendRefreshRequests(1);
}

const controlTimer = setInterval(pollControlFile, 5);

function sendReadyProgress() {
  send({
    jsonrpc: "2.0",
    id: 90,
    method: "window/workDoneProgress/create",
    params: { token: "ready" },
  });
  send({
    jsonrpc: "2.0",
    method: "$/progress",
    params: { token: "ready", value: { kind: "begin", title: "Ready" } },
  });
  setTimeout(() => {
    send({
      jsonrpc: "2.0",
      method: "$/progress",
      params: { token: "ready", value: { kind: "end" } },
    });
  }, 1);
}

function diagnosticItems(generation) {
  if (generation === 0) return [];
  return [
    {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      severity: 1,
      message: `refresh-generation-${generation}`,
      source: "controlled-refresh-server",
    },
  ];
}

function handle(message) {
  log(message.method ?? `response:${message.id}`, message.params);

  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        capabilities: {
          textDocumentSync: { openClose: true, change: 1 },
          diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
        },
      },
    });
    return;
  }
  if (message.method === "initialized") {
    sendReadyProgress();
    return;
  }
  if (message.method === "textDocument/didOpen") {
    const document = message.params.textDocument;
    documents.set(document.uri, document.text);
    return;
  }
  if (message.method === "textDocument/didChange") {
    const document = message.params.textDocument;
    const changes = message.params.contentChanges;
    documents.set(document.uri, changes.at(-1)?.text ?? documents.get(document.uri) ?? "");
    return;
  }
  if (message.method === "textDocument/didClose") {
    documents.delete(message.params.textDocument.uri);
    return;
  }
  if (message.method === "textDocument/diagnostic") {
    const requestGeneration = refreshGeneration;
    activeDiagnosticRequests++;
    maxActiveDiagnosticRequests = Math.max(maxActiveDiagnosticRequests, activeDiagnosticRequests);
    log("test/diagnostic-start", {
      active: activeDiagnosticRequests,
      maxActive: maxActiveDiagnosticRequests,
      generation: requestGeneration,
    });
    setTimeout(() => {
      activeDiagnosticRequests--;
      log("test/diagnostic-end", {
        active: activeDiagnosticRequests,
        maxActive: maxActiveDiagnosticRequests,
        generation: refreshGeneration,
      });
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: { kind: "full", items: diagnosticItems(requestGeneration) },
      });
    }, responseDelayMs);
    return;
  }
  if (message.id !== undefined && pendingRefreshes.delete(message.id)) return;
  if (message.method === "shutdown") {
    send({ jsonrpc: "2.0", id: message.id, result: null });
    return;
  }
  if (message.method === "exit") {
    clearInterval(controlTimer);
    process.exit(0);
  }
}

function drain() {
  for (;;) {
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
