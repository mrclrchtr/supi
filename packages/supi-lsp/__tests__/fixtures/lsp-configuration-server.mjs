import fs from "node:fs";

let input = Buffer.alloc(0);
const recordPath = process.argv[2];
const events = [];
let rootUri = "";

function record(event) {
  events.push(event);
  fs.writeFileSync(recordPath, `${events.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
}

function send(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function sendConfigurationRequests() {
  send({
    jsonrpc: "2.0",
    id: 11,
    method: "workspace/configuration",
    params: {
      items: [
        { section: "python.analysis.typeCheckingMode" },
        { section: "plain", scopeUri: `${rootUri}/src/main.py` },
        {},
        { section: "missing" },
        { section: "plain", scopeUri: `${rootUri}/../outside/main.py` },
        { section: "__proto__" },
        { section: "constructor" },
        { section: 42 },
        null,
      ],
    },
  });
  send({
    jsonrpc: "2.0",
    id: 12,
    method: "workspace/configuration",
    params: { items: "malformed" },
  });
}

function handle(message) {
  if (message.method) record({ method: message.method, params: message.params });
  else if (message.id !== undefined) record({ responseId: message.id, result: message.result });

  if (message.method === "initialize") {
    rootUri = message.params.workspaceFolders[0].uri;
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        capabilities: {
          positionEncoding: "utf-16",
          textDocumentSync: { openClose: true, change: 1, save: true },
        },
      },
    });
    return;
  }
  if (message.method === "initialized") {
    sendConfigurationRequests();
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

fs.writeFileSync(recordPath, "");
process.stdin.on("data", (chunk) => {
  input = Buffer.concat([input, chunk]);
  drain();
});
