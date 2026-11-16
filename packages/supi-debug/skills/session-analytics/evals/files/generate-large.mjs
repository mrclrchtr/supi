#!/usr/bin/env node
/**
 * Generate a deterministic, larger session storage for the session-analytics evals and print
 * the expected totals, counted while generating (independent of the exporter).
 * Usage: node generate-large.mjs <empty-output-dir> > expected.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
if (!root) throw new Error("Usage: generate-large.mjs <output-dir>");

let seed = 601;
function random() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const pick = (items) => items[Math.floor(random() * items.length)];

const TOOLS = ["bash", "read", "edit", "write", "code_find", "web_search", "web_fetch_md"];
const ERROR_RATE = {
  bash: 0.2,
  read: 0.05,
  edit: 0.1,
  write: 0,
  code_find: 0.3,
  web_search: 0,
  web_fetch_md: 0.5,
};
const WEIGHTS = {
  bash: 8,
  read: 6,
  edit: 3,
  write: 1,
  code_find: 2,
  web_search: 0,
  web_fetch_md: 1,
};
const weighted = Object.entries(WEIGHTS).flatMap(([tool, weight]) => Array(weight).fill(tool));
const WINDOW_START = Date.parse("2026-10-01T00:00:00Z");

const expected = { calls: {}, errors: {}, sessionsInScope: 0, availableNeverCalled: [] };
const available = new Set();
const called = new Set();

function addCall(lines, { index, call, loadout, counted, time }) {
  const picked = pick(weighted);
  const tool = loadout.includes(picked) ? picked : "bash";
  const id = `s${index}c${call}`;
  const failed = random() < ERROR_RATE[tool];
  lines.push({
    type: "message",
    timestamp: time(),
    message: {
      role: "assistant",
      model: "test-model",
      content: [{ type: "toolCall", id, name: tool, arguments: { n: call } }],
    },
  });
  lines.push({
    type: "message",
    timestamp: time(),
    message: {
      role: "toolResult",
      toolCallId: id,
      toolName: tool,
      content: [{ type: "text", text: failed ? "Error: failed" : "ok ".repeat(40) }],
      isError: failed,
    },
  });
  if (!counted) return;
  called.add(tool);
  expected.calls[tool] = (expected.calls[tool] ?? 0) + 1;
  if (failed) expected.errors[tool] = (expected.errors[tool] ?? 0) + 1;
}

function session(index) {
  const inMonorepo = index % 5 !== 0;
  const cwd = inMonorepo
    ? `/example/monorepo${index % 3 === 0 ? "/packages/app one" : ""}`
    : "/example/elsewhere";
  // Two months back to two weeks back; about half before the window.
  let clock = Date.parse("2026-09-01T00:00:00Z") + Math.floor(random() * 55 * 86400000);
  const time = () => {
    clock += 4000;
    return new Date(clock).toISOString();
  };
  const counted = inMonorepo && clock >= WINDOW_START;
  if (counted) expected.sessionsInScope++;
  const loadout = TOOLS.filter((tool) => tool === "bash" || tool === "read" || random() < 0.7);
  if (counted) for (const tool of loadout) available.add(tool);
  const lines = [
    { type: "session", version: 3, id: `s${index}`, timestamp: time(), cwd },
    {
      type: "message",
      timestamp: time(),
      message: { role: "system", content: "", toolsAdded: loadout.map((name) => ({ name })) },
    },
  ];
  const callCount = 5 + Math.floor(random() * 25);
  for (let call = 0; call < callCount; call++)
    addCall(lines, { index, call, loadout, counted, time });
  const dir = join(root, `--${cwd.replaceAll("/", "-")}--`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `session-${String(index).padStart(4, "0")}.jsonl`),
    `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
  );
}

for (let index = 0; index < 400; index++) session(index);
expected.availableNeverCalled = [...available]
  .filter((tool) => !called.has(tool))
  .sort((a, b) => a.localeCompare(b));
process.stdout.write(`${JSON.stringify(expected, null, 2)}\n`);
