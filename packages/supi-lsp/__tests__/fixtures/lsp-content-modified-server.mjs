import * as fs from "node:fs";

let input = Buffer.alloc(0);
const logPath = process.argv[2];
const contentModifiedLimit = process.argv[3] === "always" ? Infinity : Number(process.argv[3] ?? 1);
let hoverCount = 0;

function send(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function log(method) {
  fs.appendFileSync(logPath, `${method}\n`);
}

function handle(message) {
  if (typeof message.method === "string") log(message.method);
  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        capabilities: {
          textDocumentSync: { openClose: true, change: 1 },
          hoverProvider: true,
        },
      },
    });
    return;
  }
  if (message.method === "initialized") {
    send({
      jsonrpc: "2.0",
      method: "$/progress",
      params: { token: "ready", value: { kind: "begin", title: "Ready" } },
    });
    send({
      jsonrpc: "2.0",
      method: "$/progress",
      params: { token: "ready", value: { kind: "end" } },
    });
    return;
  }
  if (message.method === "textDocument/hover") {
    hoverCount++;
    if (hoverCount <= contentModifiedLimit) {
      send({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32801, message: "content modified" },
      });
    } else {
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: { contents: { kind: "plaintext", value: "current result" } },
      });
    }
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
