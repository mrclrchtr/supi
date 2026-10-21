// Hold readiness between rename requests so tests can change enrolled inputs.
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";

const [sourceFile, referenceFile, releaseFile] = process.argv.slice(2);
let input = Buffer.alloc(0);
let renameCount = 0;

function send(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function respond(message, result) {
  send({ jsonrpc: "2.0", id: message.id, result });
}

function progress(token, kind) {
  send({
    jsonrpc: "2.0",
    method: "$/progress",
    params: { token, value: { kind, title: "Fixture work" } },
  });
}

function holdEnrollment() {
  send({
    jsonrpc: "2.0",
    id: 91,
    method: "window/workDoneProgress/create",
    params: { token: "enrollment" },
  });
  progress("enrollment", "begin");
  const timer = setInterval(() => {
    if (!fs.existsSync(releaseFile)) return;
    clearInterval(timer);
    progress("enrollment", "end");
  }, 5);
}

function rename(message) {
  if (++renameCount === 1) holdEnrollment();
  respond(message, {
    changes: {
      [pathToFileURL(sourceFile).href]: [edit(9, message.params.newName)],
      [pathToFileURL(referenceFile).href]: [edit(0, message.params.newName)],
    },
  });
}

function edit(character, newText) {
  return {
    range: { start: { line: 0, character }, end: { line: 0, character: character + 7 } },
    newText,
  };
}

function handle(message) {
  switch (message.method) {
    case "initialize":
      respond(message, {
        capabilities: {
          textDocumentSync: { openClose: true, change: 1 },
          documentSymbolProvider: true,
          renameProvider: true,
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
      progress("ready", "begin");
      progress("ready", "end");
      break;
    case "textDocument/documentSymbol":
      respond(message, [
        {
          name: "oldName",
          kind: 12,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 21 } },
          selectionRange: { start: { line: 0, character: 9 }, end: { line: 0, character: 16 } },
        },
      ]);
      break;
    case "textDocument/rename":
      rename(message);
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
