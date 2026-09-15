// Controlled protocol server for public code_graph enrollment tests.
import * as fs from "node:fs";

const logPath = process.argv[2];
let input = Buffer.alloc(0);
const referenceCounts = new Map();

function log(event) {
  fs.appendFileSync(logPath, `${JSON.stringify(event)}\n`);
}

function send(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function respond(message, result) {
  log({ method: message.method, phase: "response", params: message.params });
  send({ jsonrpc: "2.0", id: message.id, result });
}

function references(message) {
  const uri = message.params.textDocument.uri;
  const attempt = (referenceCounts.get(uri) ?? 0) + 1;
  referenceCounts.set(uri, attempt);
  const result = [
    {
      uri,
      range: {
        start: { line: attempt, character: 0 },
        end: { line: attempt, character: 4 },
      },
    },
  ];
  if (!uri.endsWith("/cold-a.test")) return respond(message, result);
  const timer = setInterval(() => {
    if (!fs.existsSync(`${logPath}.release-${attempt}`)) return;
    clearInterval(timer);
    respond(message, result);
  }, 5);
}

function handle(message) {
  log({ method: message.method, phase: "request", params: message.params });
  switch (message.method) {
    case "initialize":
      respond(message, {
        capabilities: {
          textDocumentSync: { openClose: true, change: 1 },
          referencesProvider: true,
          documentSymbolProvider: true,
        },
      });
      break;
    case "initialized":
      send({
        jsonrpc: "2.0",
        id: 90,
        method: "window/workDoneProgress/create",
        params: { token: "ready" },
      });
      for (const kind of ["begin", "end"]) {
        send({
          jsonrpc: "2.0",
          method: "$/progress",
          params: { token: "ready", value: { kind, title: "Ready" } },
        });
      }
      break;
    case "textDocument/documentSymbol":
      respond(message, [
        {
          name: "work",
          kind: 12,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 18 } },
          selectionRange: { start: { line: 0, character: 9 }, end: { line: 0, character: 13 } },
        },
      ]);
      break;
    case "textDocument/references":
      references(message);
      break;
    case "shutdown":
      respond(message, null);
      break;
    case "exit":
      process.exit(0);
      break;
    default:
      if (message.method && message.id !== undefined) respond(message, null);
  }
}

process.stdin.on("data", (chunk) => {
  input = Buffer.concat([input, chunk]);
  for (;;) {
    const headerEnd = input.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const match = /Content-Length:\s*(\d+)/i.exec(input.subarray(0, headerEnd).toString("ascii"));
    if (!match) process.exit(2);
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    if (input.length < bodyStart + length) return;
    const body = input.subarray(bodyStart, bodyStart + length).toString("utf8");
    input = input.subarray(bodyStart + length);
    handle(JSON.parse(body));
  }
});
