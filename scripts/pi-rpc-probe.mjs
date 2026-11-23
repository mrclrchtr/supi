#!/usr/bin/env node
/**
 * Live probe for extension behavior: drive `pi --mode rpc` from the current working tree with a
 * sequence of prompts and print a compact timeline. Each prompt waits for `agent_settled`; after the
 * last one, the probe keeps listening for turns that background work starts by itself (Completion
 * Notices) until `--idle-ms` passes without one.
 *
 * Usage:
 *   node scripts/pi-rpc-probe.mjs [--tools review_run,agent_result] [--idle-ms 60000]
 *     [--abort-on-tool bash] [--events /tmp/events.jsonl] -- "prompt 1" "prompt 2"
 *
 * The timeline lists tool calls with result excerpts, custom messages, assistant text, turn
 * boundaries, and status-line changes. Spinner frames are collapsed: each status key is printed only
 * when its text (without the spinner glyph) changes, and the summary counts the raw `setStatus` and
 * `setTitle` records so RPC chattiness stays visible. All raw records go to `--events`.
 */
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    tools: { type: "string" },
    "idle-ms": { type: "string", default: "60000" },
    "abort-on-tool": { type: "string" },
    events: { type: "string", default: "/tmp/pi-rpc-probe-events.jsonl" },
    excerpt: { type: "string", default: "600" },
  },
});
if (positionals.length === 0) {
  console.error("Pass at least one prompt after --. See the header of this script for usage.");
  process.exit(2);
}

const idleMs = Number(values["idle-ms"]);
const excerpt = Number(values.excerpt);
const args = ["--mode", "rpc", "--no-session"];
if (values.tools) args.push("--tools", values.tools);
const pi = spawn("pi", args, { stdio: ["pipe", "pipe", "inherit"] });
const log = createWriteStream(values.events);
const started = Date.now();
const seconds = () => ((Date.now() - started) / 1000).toFixed(1).padStart(6);
const print = (line) => console.log(`[${seconds()}] ${line}`);
const clip = (text) => (text.length > excerpt ? `${text.slice(0, excerpt)}…` : text);
const SPINNER = /^[\u2800-\u28ff✓]\s*/u;

const counts = { setStatus: 0, setTitle: 0, settled: 0 };
const statusText = new Map();
let onSettled;

function textOf(content) {
  if (typeof content === "string") return content;
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function handleStatus(record) {
  counts.setStatus++;
  const text = (record.statusText ?? "").replace(SPINNER, "");
  if (statusText.get(record.statusKey) === text) return;
  statusText.set(record.statusKey, text);
  print(`◆ status ${record.statusKey}: ${text || "<cleared>"}`);
}

function handleMessage({ message }) {
  if (message.role === "custom")
    print(`✉ custom ${message.customType}: ${clip(textOf(message.content))}`);
  else if (message.role === "assistant" && textOf(message.content))
    print(`💬 ${clip(textOf(message.content))}`);
}

function handleToolStart(record) {
  print(`▶ ${record.toolName} ${clip(JSON.stringify(record.args ?? {}))}`);
  if (record.toolName !== values["abort-on-tool"]) return;
  setTimeout(() => send({ type: "abort" }), 500);
  print("✋ abort sent");
}

const handlers = {
  agent_start: () => print("── turn start"),
  agent_settled: () => {
    counts.settled++;
    print("── turn settled");
    onSettled?.();
  },
  tool_execution_start: handleToolStart,
  tool_execution_end: (record) =>
    print(
      `◀ ${record.toolName}${record.isError ? " (error)" : ""}\n${clip(textOf(record.result?.content ?? []))}`,
    ),
  message_end: handleMessage,
  extension_ui_request: (record) => {
    if (record.method === "setStatus") handleStatus(record);
    else if (record.method === "setTitle") counts.setTitle++;
  },
};

function handle(record) {
  handlers[record.type]?.(record);
}

let buffer = Buffer.alloc(0);
pi.stdout.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  let newline = buffer.indexOf(0x0a);
  while (newline !== -1) {
    const line = buffer.subarray(0, newline).toString("utf8").replace(/\r$/, "");
    buffer = buffer.subarray(newline + 1);
    newline = buffer.indexOf(0x0a);
    if (!line) continue;
    log.write(`${line}\n`);
    try {
      handle(JSON.parse(line));
    } catch {
      // Non-JSON output is not a protocol record.
    }
  }
});

function send(command) {
  pi.stdin.write(`${JSON.stringify(command)}\n`);
}

/** Resolve once `count` more turns have settled, or after `timeoutMs` with false. */
function settledTurns(count, timeoutMs) {
  const target = counts.settled + count;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    onSettled = () => {
      if (counts.settled < target) return;
      clearTimeout(timer);
      resolve(true);
    };
  });
}

for (const [index, message] of positionals.entries()) {
  print(`» prompt ${index + 1}: ${clip(message)}`);
  const settled = settledTurns(1, 15 * 60_000);
  send({ type: "prompt", message });
  if (!(await settled)) print("!! prompt did not settle within 15 minutes");
}
print(`… listening ${idleMs / 1000}s for turns started by background work`);
while (await settledTurns(1, idleMs)) print("… a background turn settled; listening again");

pi.stdin.end();
await new Promise((resolve) => pi.once("exit", resolve));
print(
  `done: ${counts.settled} settled turns, ${counts.setStatus} setStatus and ${counts.setTitle} setTitle records; raw events in ${values.events}`,
);
