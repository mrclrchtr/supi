import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";

const [server, ...args] = process.argv.slice(2);
const logPath = process.env.SUPI_C_FAMILY_PROTOCOL_LOG;
if (!server || !logPath) throw new Error("The clangd command and protocol log path are required.");

const child = spawn(server, args, { stdio: ["pipe", "pipe", "inherit"] });
let input = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  child.stdin.write(chunk);
  input = Buffer.concat([input, chunk]);
  consumeMessages();
});
process.stdin.on("end", () => child.stdin.end());
process.stdin.on("error", reportError);
child.stdin.on("error", reportError);
child.stdout.pipe(process.stdout);
child.on("error", reportError);
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});

function consumeMessages() {
  for (;;) {
    const headerEnd = input.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const header = input.toString("ascii", 0, headerEnd);
    const contentLength = /^Content-Length:\s*(\d+)\s*$/imu.exec(header)?.[1];
    if (!contentLength) throw new Error("The LSP message has no Content-Length header.");
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + Number(contentLength);
    if (input.length < bodyEnd) return;
    recordMetadata(input.toString("utf8", bodyStart, bodyEnd));
    input = input.subarray(bodyEnd);
  }
}

function recordMetadata(body) {
  const message = JSON.parse(body);
  if (typeof message.method !== "string") return;
  const textDocument = message.params?.textDocument;
  const record = { method: message.method };
  if (typeof textDocument?.uri === "string") record.documentId = textDocument.uri;
  if (typeof textDocument?.languageId === "string") record.languageId = textDocument.languageId;
  appendFileSync(logPath, `${JSON.stringify(record)}\n`);
}

function reportError(error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
