#!/usr/bin/env node
/**
 * Live probe for extension behavior: drive `pi --mode rpc` from the current working tree with a
 * sequence of prompts and print a compact timeline. Each prompt waits for `agent_settled`; after the
 * last one, the probe keeps listening for turns that background work starts by itself (Completion
 * Notices) until `--idle-ms` passes without one.
 *
 * Usage:
 *   node scripts/pi-rpc-probe.mjs [--cwd <dir>] [--tools review_run,agent_result] [--idle-ms 60000]
 *     [--abort-on-tool bash] [--answer confirm=yes --answer select=Allow ...] [--commands <regex>]
 *     [--exit-on <regex>] [--events /tmp/events.jsonl] -- "prompt 1" "/some-command"
 *
 * - `--cwd` starts Pi in another directory; Pi loads the SuPi extensions of that working tree.
 * - `--answer` answers extension dialogs in request order: `confirm=yes|no`, `select=<label>` or
 *   `select=#<index>`, `input=<text>`, `editor=<text>`, or `cancel`. A dialog whose method does not
 *   match the next answer, or that arrives after the answers run out, is cancelled and reported, so a
 *   probe never blocks on a dialog.
 * - `--commands` prints the registered slash commands whose names match the regex before prompting.
 * - `--exit-on` stops listening as soon as a timeline line matches the regex.
 * - A prompt that an extension command handles (`disposition: "handled"`) starts no run, so the
 *   probe does not wait for it to settle.
 *
 * The timeline lists tool calls with result excerpts, custom messages, assistant text, turn
 * boundaries, notifications, dialogs with their answers, and status-line changes. Spinner frames are collapsed: each status key is printed only
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
    cwd: { type: "string" },
    answer: { type: "string", multiple: true, default: [] },
    commands: { type: "string" },
    "exit-on": { type: "string" },
  },
});
if (positionals.length === 0 && values.commands === undefined) {
  console.error("Pass at least one prompt after --. See the header of this script for usage.");
  process.exit(2);
}

const idleMs = Number(values["idle-ms"]);
const excerpt = Number(values.excerpt);
const args = ["--mode", "rpc", "--no-session"];
if (values.tools) args.push("--tools", values.tools);
const pi = spawn("pi", args, {
  stdio: ["pipe", "pipe", "inherit"],
  ...(values.cwd ? { cwd: values.cwd } : {}),
});
const log = createWriteStream(values.events);
const started = Date.now();
const seconds = () => ((Date.now() - started) / 1000).toFixed(1).padStart(6);
const exitOn = values["exit-on"] ? new RegExp(values["exit-on"], "u") : undefined;
let onExitMatch;
const print = (line) => {
  console.log(`[${seconds()}] ${line}`);
  if (exitOn?.test(line)) onExitMatch?.();
};
const clip = (text) => (text.length > excerpt ? `${text.slice(0, excerpt)}…` : text);
const SPINNER = /^[\u2800-\u28ff✓]\s*/u;

const counts = { setStatus: 0, setTitle: 0, settled: 0, dialogs: 0 };
const answers = values.answer.map(parseAnswer);
const pending = new Map();
let nextId = 0;
const statusText = new Map();
let onSettled;

function textOf(content) {
  if (typeof content === "string") return content;
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function parseAnswer(spec) {
  if (spec === "cancel") return { method: undefined, cancel: true };
  const separator = spec.indexOf("=");
  const method = separator === -1 ? spec : spec.slice(0, separator);
  if (!["confirm", "select", "input", "editor"].includes(method) || separator === -1) {
    console.error(`Unsupported --answer ${spec}. See the header of this script for usage.`);
    process.exit(2);
  }
  return { method, value: spec.slice(separator + 1) };
}

/** Why the next queued answer cannot answer this dialog, or undefined when it can. */
function skipReason(answer, record) {
  if (!answer) return "no answer left";
  if (answer.cancel) return "--answer cancel";
  if (answer.method !== record.method) return `next answer is ${answer.method}`;
  return undefined;
}

/** Build the response for one dialog from the next queued answer, or cancel it. */
function dialogResponse(record) {
  const answer = answers.shift();
  const skipped = skipReason(answer, record);
  if (skipped) return { response: { cancelled: true }, label: `cancelled (${skipped})` };
  if (record.method === "confirm") {
    const confirmed = /^(yes|y|true|1)$/iu.test(answer.value);
    return { response: { confirmed }, label: confirmed ? "yes" : "no" };
  }
  if (record.method === "select") {
    const options = record.options ?? [];
    const value = answer.value.startsWith("#")
      ? options[Number(answer.value.slice(1))]
      : options.find((option) => option === answer.value);
    if (value === undefined)
      return { response: { cancelled: true }, label: `cancelled (no option ${answer.value})` };
    return { response: { value }, label: value };
  }
  return { response: { value: answer.value }, label: JSON.stringify(answer.value) };
}

function handleDialog(record) {
  counts.dialogs++;
  const body = [
    record.title,
    record.message,
    record.options?.map((o, i) => `#${i} ${o}`).join(" | "),
  ]
    .filter(Boolean)
    .join("\n");
  const { response, label } = dialogResponse(record);
  send({ type: "extension_ui_response", id: record.id, ...response });
  print(`❓ ${record.method}: ${clip(body)}\n→ ${label}`);
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
    else if (["confirm", "select", "input", "editor"].includes(record.method)) handleDialog(record);
    else if (record.method === "notify")
      print(`🔔 notify ${record.notifyType ?? "info"}: ${clip(record.message ?? "")}`);
  },
  response: (record) => {
    const resolve = pending.get(record.id);
    if (!resolve) return;
    pending.delete(record.id);
    resolve(record);
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

/** Send a command with an id and resolve with its `response` record. */
function request(command) {
  const id = `probe-${++nextId}`;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    send({ ...command, id });
  });
}

/** Resolve true on the next `--exit-on` match, or false after `timeoutMs`. */
function exitMatch(timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    onExitMatch = () => {
      clearTimeout(timer);
      resolve(true);
    };
  });
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

if (values.commands !== undefined) {
  const pattern = new RegExp(values.commands, "u");
  const reply = await request({ type: "get_commands" });
  const names = (reply.data?.commands ?? [])
    .map((command) => command.name)
    .filter((name) => pattern.test(name));
  print(`☰ commands matching /${values.commands}/: ${names.join(", ") || "<none>"}`);
}

let exited = false;
const exitWatch = exitMatch(2 ** 31 - 1).then((matched) => {
  exited = matched;
});
for (const [index, message] of positionals.entries()) {
  if (exited) break;
  print(`» prompt ${index + 1}: ${clip(message)}`);
  const settled = settledTurns(1, 15 * 60_000);
  const reply = await request({ type: "prompt", message });
  const disposition = reply.data?.disposition;
  if (!reply.success) print(`!! prompt rejected: ${reply.error ?? "unknown error"}`);
  else if (disposition === "handled") print("── prompt handled without a run");
  else if (!(await Promise.race([settled, exitWatch.then(() => true)])))
    print("!! prompt did not settle within 15 minutes");
}
if (!exited) {
  print(`… listening ${idleMs / 1000}s for turns started by background work`);
  while (!exited) {
    const settled = await Promise.race([settledTurns(1, idleMs), exitWatch.then(() => false)]);
    if (!settled) break;
    print("… a background turn settled; listening again");
  }
}
if (exited) print("… --exit-on matched; stopping");

pi.stdin.end();
await new Promise((resolve) => pi.once("exit", resolve));
print(
  `done: ${counts.settled} settled turns, ${counts.dialogs} dialogs, ${counts.setStatus} setStatus and ${counts.setTitle} setTitle records; raw events in ${values.events}`,
);
