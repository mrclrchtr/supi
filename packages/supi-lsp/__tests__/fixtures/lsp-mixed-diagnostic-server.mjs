import * as fs from "node:fs";

let input = Buffer.alloc(0);
const logPath = process.argv[2];
const documents = new Map();

function log(method, params) {
  fs.appendFileSync(logPath, `${JSON.stringify({ method, params })}\n`);
}

function send(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function respond(id, result) {
  setTimeout(() => send({ jsonrpc: "2.0", id, result }), 10);
}

function diagnosticItems(uri) {
  if (uri.endsWith("/probe.py")) {
    return [
      {
        message: "Python diagnostic under a TypeScript config.",
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        severity: 1,
        source: "mixed-language-fixture",
      },
    ];
  }
  if (uri.endsWith("/inside.ts")) {
    return [
      {
        message: "Inside directory diagnostic.",
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        severity: 1,
        source: "mixed-language-fixture",
      },
    ];
  }
  if (uri.endsWith("/outside.ts")) {
    return [
      {
        message: "Outside directory diagnostic.",
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        severity: 1,
        source: "mixed-language-fixture",
      },
    ];
  }
  return [];
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
    setTimeout(
      () =>
        send({
          jsonrpc: "2.0",
          method: "$/progress",
          params: { token: "ready", value: { kind: "end" } },
        }),
      1,
    );
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
  if (message.method === "textDocument/documentSymbol") {
    respond(message.id, []);
    return;
  }
  if (message.method === "textDocument/diagnostic") {
    const uri = message.params.textDocument.uri;
    respond(message.id, { kind: "full", items: diagnosticItems(uri) });
    return;
  }
  if (message.method === "shutdown") {
    send({ jsonrpc: "2.0", id: message.id, result: null });
    return;
  }
  if (message.method === "exit") process.exit(0);
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
