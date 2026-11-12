// Fake LSP server whose code actions are command-only. Running a command makes
// the server push `workspace/applyEdit` requests before it answers, the way
// kotlin-lsp and clangd do. The command name selects the behavior:
//   capture.single    one applyEdit
//   capture.none      no applyEdit
//   capture.multiple  two applyEdits
//   capture.hang      never answers executeCommand
//   push.unsolicited  answers, then pushes one applyEdit outside any command
// Every received message and every applyEdit reply is appended to the log.
import * as fs from "node:fs";

const [logPath] = process.argv.slice(2);
let input = Buffer.alloc(0);
let nextId = 1000;
const pending = new Map();
const versions = new Map();

function send(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function log(entry) {
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
}

function request(method, params) {
  const id = nextId++;
  send({ jsonrpc: "2.0", id, method, params });
  return new Promise((resolve) => pending.set(id, resolve));
}

function editFor(uri, newText) {
  return {
    documentChanges: [
      {
        textDocument: { uri, version: versions.get(uri) ?? null },
        edits: [
          { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText },
        ],
      },
    ],
  };
}

async function pushEdit(uri, newText) {
  const reply = await request("workspace/applyEdit", {
    label: "fake",
    edit: editFor(uri, newText),
  });
  log({ applyEditReply: reply });
}

async function executeCommand(message) {
  const { command, arguments: args = [] } = message.params;
  const uri = args[0];
  switch (command) {
    case "capture.single":
      await pushEdit(uri, "// one\n");
      break;
    case "capture.multiple":
      await pushEdit(uri, "// one\n");
      await pushEdit(uri, "// two\n");
      break;
    case "capture.hang":
      return;
    case "push.unsolicited":
      send({ jsonrpc: "2.0", id: message.id, result: null });
      setTimeout(() => void pushEdit(uri, "// unsolicited\n"), 10);
      return;
    default:
      break;
  }
  send({ jsonrpc: "2.0", id: message.id, result: null });
}

function handle(message) {
  if (message.id !== undefined && message.method === undefined) {
    pending.get(message.id)?.(message.result);
    pending.delete(message.id);
    return;
  }
  log({ method: message.method, params: message.params });
  switch (message.method) {
    case "initialize":
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          capabilities: {
            textDocumentSync: { openClose: true, change: 1 },
            codeActionProvider: { codeActionKinds: ["refactor", "source"] },
            executeCommandProvider: {
              commands: [
                "capture.single",
                "capture.none",
                "capture.multiple",
                "capture.hang",
                "push.unsolicited",
              ],
            },
          },
        },
      });
      break;
    case "textDocument/didOpen":
      versions.set(message.params.textDocument.uri, message.params.textDocument.version);
      break;
    case "textDocument/didChange":
      versions.set(message.params.textDocument.uri, message.params.textDocument.version);
      break;
    case "workspace/executeCommand":
      void executeCommand(message);
      break;
    case "shutdown":
      send({ jsonrpc: "2.0", id: message.id, result: null });
      break;
    case "exit":
      process.exit(0);
      break;
    default:
      if (message.id !== undefined) send({ jsonrpc: "2.0", id: message.id, result: null });
  }
}

process.stdin.on("data", (chunk) => {
  input = Buffer.concat([input, chunk]);
  for (;;) {
    const headerEnd = input.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const match = /Content-Length: (\d+)/i.exec(input.subarray(0, headerEnd).toString());
    if (!match) return;
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (input.length < start + length) return;
    const body = input.subarray(start, start + length).toString();
    input = input.subarray(start + length);
    handle(JSON.parse(body));
  }
});
