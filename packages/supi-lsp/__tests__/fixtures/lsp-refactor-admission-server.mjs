// Hold one refactor phase while observing competing public runtime requests.
import * as fs from "node:fs";

const [logPath, heldMethod] = process.argv.slice(2);
let input = Buffer.alloc(0);

function send(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function log(message, phase) {
  fs.appendFileSync(
    logPath,
    `${JSON.stringify({ method: message.method, params: message.params, phase })}\n`,
  );
}

function respond(message, result) {
  const finish = () => {
    if (message.method === heldMethod && !fs.existsSync(`${logPath}.release`)) {
      setTimeout(finish, 5);
      return;
    }
    log(message, "response");
    send({ jsonrpc: "2.0", id: message.id, result });
  };
  finish();
}

const range = { start: { line: 0, character: 9 }, end: { line: 0, character: 16 } };

function handle(message) {
  log(message, "request");
  switch (message.method) {
    case "initialize":
      respond(message, {
        capabilities: {
          textDocumentSync: { openClose: true, change: 1 },
          hoverProvider: true,
          documentSymbolProvider: true,
          renameProvider: { prepareProvider: true },
          codeActionProvider: {
            resolveProvider: true,
            codeActionKinds: ["source.organizeImports"],
          },
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
    case "textDocument/hover":
      respond(message, { contents: { kind: "plaintext", value: "read while planning" } });
      break;
    case "textDocument/documentSymbol":
      respond(message, []);
      break;
    case "textDocument/prepareRename":
      respond(message, range);
      break;
    case "textDocument/rename":
      respond(message, {
        changes: {
          [message.params.textDocument.uri]: [{ range, newText: message.params.newName }],
        },
      });
      break;
    case "textDocument/codeAction":
      respond(message, [
        {
          title: "Organize imports",
          kind: "source.organizeImports",
          data: { uri: message.params.textDocument.uri },
        },
      ]);
      break;
    case "codeAction/resolve":
      respond(message, {
        ...message.params,
        edit: { changes: { [message.params.data.uri]: [{ range, newText: "newName" }] } },
      });
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
