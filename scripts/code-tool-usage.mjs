#!/usr/bin/env node
/**
 * Summarize how agents use code_* tools in persisted Pi sessions: result
 * status, output size, and what the agent did next. Observational only:
 * follow-up classes are heuristics, and with/without comparisons are
 * correlations, not proof of effect. See docs/ops/code-tool-usage.md.
 */
/* biome-ignore-all lint/suspicious/noConsole: CLI report output */
import { readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  admitByCommit,
  provenanceOf,
  resolveCommit,
} from "../packages/supi-debug/skills/gather-retrospectives/scripts/provenance.mjs";

const SNAPSHOT_MARKER = "supi-orientation-";
const PATH_TOKEN = /[\w@.-]*[\w@-]\/[\w@./-]*\w|[\w@-]+\.[a-z]{1,5}\b/gi;
const EDIT_TOOLS = new Set(["edit", "write", "code_refactor_apply"]);

/**
 * Follow-up classes for the call after a code_* result.
 * - `followed`: reads/inspects a file the result named.
 * - `descend`: reads/inspects below a directory the result named (`dir/`).
 * - `snapshot`: reads the captured orientation snapshot.
 * - `gap`: reads/inspects a file the result did not name.
 * - `retry`: the same tool again (narrowing, disambiguation, correction).
 * - `chain`: another code_* tool.
 * - `edit`: a mutation.
 * - `other`: anything else, including no further call.
 */
export const FOLLOW_UP_CLASSES = [
  "followed",
  "descend",
  "snapshot",
  "gap",
  "retry",
  "chain",
  "edit",
  "other",
];

/** Path-like tokens a follow-up call targets: `read.path` or tokens in a bash command. */
export function targetPaths(call) {
  if (!call) return [];
  const args = call.arguments ?? {};
  if (call.name === "read" && typeof args.path === "string") return [args.path];
  if (call.name === "bash" && typeof args.command === "string")
    return [...args.command.matchAll(PATH_TOKEN)].map((match) => match[0]);
  return [];
}

function mentions(text, path) {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\w./-])${escaped}($|[^\\w./-])`).test(text);
}

/**
 * True when the result text names the path, or a suffix of at least two
 * segments of it (results print workspace- or focus-relative paths while
 * calls often use absolute ones). Bare file names must match on their own.
 */
export function namesPath(text, path) {
  const segments = path.replace(/^\.\//, "").split("/").filter(Boolean);
  if (segments.length === 1) return mentions(text, segments[0]);
  for (let start = 0; start <= segments.length - 2; start++)
    if (mentions(text, segments.slice(start).join("/"))) return true;
  return false;
}

/** True when the result names an ancestor directory of the path as `dir/` (directory listings). */
export function namesAncestor(text, path) {
  const segments = path.replace(/^\.\//, "").split("/").filter(Boolean);
  for (let end = segments.length - 1; end > 0; end--)
    for (let start = 0; start < end; start++)
      if (mentions(text, `${segments.slice(start, end).join("/")}/`)) return true;
  return false;
}

/** Classify the call that follows a code_* result. */
export function classifyFollowUp(previous, next) {
  if (!next) return "other";
  if (next.name === previous.name) return "retry";
  if (next.name.startsWith("code_") && !EDIT_TOOLS.has(next.name)) return "chain";
  if (EDIT_TOOLS.has(next.name)) return "edit";
  const paths = targetPaths(next);
  if (!paths.length) return "other";
  if (paths.some((path) => path.includes(SNAPSHOT_MARKER))) return "snapshot";
  if (paths.some((path) => namesPath(previous.text, path))) return "followed";
  return paths.some((path) => namesAncestor(previous.text, path)) ? "descend" : "gap";
}

function resultText(message) {
  return (message.content ?? []).map((item) => item.text ?? "").join("");
}

/**
 * Ordered tool calls of one session with their results. Uses file order;
 * branched sessions interleave branches (rare; disclosed as a limitation).
 */
export function sessionCalls(entries) {
  const pending = new Map();
  const calls = [];
  for (const entry of entries) {
    const message = entry?.message;
    if (message?.role === "assistant" && Array.isArray(message.content)) {
      for (const item of message.content) if (item.type === "toolCall") pending.set(item.id, item);
    } else if (message?.role === "toolResult") {
      const call = pending.get(message.toolCallId);
      calls.push({
        name: message.toolName ?? call?.name ?? "unknown",
        arguments: call?.arguments ?? {},
        text: resultText(message),
        isError: message.isError === true,
        status: message.details?.status,
        truncated: message.details?.truncation?.truncated === true,
      });
    }
  }
  return calls;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))];
}

function emptyTool() {
  return {
    calls: 0,
    errors: 0,
    truncated: 0,
    status: {},
    followUp: Object.fromEntries(FOLLOW_UP_CLASSES.map((name) => [name, 0])),
    chars: [],
    argKeys: {},
  };
}

/** Effort before the first mutation: calls and model-visible result characters. */
function effortBeforeEdit(calls) {
  const index = calls.findIndex((call) => EDIT_TOOLS.has(call.name));
  if (index < 0) return null;
  const before = calls.slice(0, index);
  return { calls: before.length, chars: before.reduce((sum, call) => sum + call.text.length, 0) };
}

function median(values) {
  return percentile(values, 50);
}

function recordCall(tools, call, next) {
  tools[call.name] ??= emptyTool();
  const tool = tools[call.name];
  tool.calls++;
  if (call.isError) tool.errors++;
  if (call.truncated) tool.truncated++;
  const status = call.isError ? "error" : (call.status ?? "unknown");
  tool.status[status] = (tool.status[status] ?? 0) + 1;
  tool.followUp[classifyFollowUp(call, next)]++;
  tool.chars.push(call.text.length);
  for (const key of Object.keys(call.arguments)) tool.argKeys[key] = (tool.argKeys[key] ?? 0) + 1;
}

const isCodeTool = (call) => call.name.startsWith("code_");

/** Aggregate code_* usage across sessions, each given as its ordered call list. */
export function analyze(sessions) {
  const tools = {};
  const groups = { withCode: [], withoutCode: [] };
  for (const calls of sessions) {
    calls.forEach((call, index) => {
      if (isCodeTool(call)) recordCall(tools, call, calls[index + 1]);
    });
    const effort = effortBeforeEdit(calls);
    if (!effort) continue;
    const usedCode = calls.slice(0, effort.calls).some(isCodeTool);
    groups[usedCode ? "withCode" : "withoutCode"].push(effort);
  }
  const summarizeGroup = (group) => ({
    sessions: group.length,
    medianCallsBeforeEdit: median(group.map((item) => item.calls)),
    medianCharsBeforeEdit: median(group.map((item) => item.chars)),
  });
  return {
    sessions: sessions.length,
    sessionsWithCode: sessions.filter((calls) =>
      calls.some((call) => call.name.startsWith("code_")),
    ).length,
    tools: Object.fromEntries(
      Object.entries(tools)
        .sort((a, b) => b[1].calls - a[1].calls)
        .map(([name, { chars, ...tool }]) => [
          name,
          {
            ...tool,
            avgChars: Math.round(chars.reduce((sum, value) => sum + value, 0) / chars.length),
            p90Chars: percentile(chars, 90),
          },
        ]),
    ),
    beforeFirstEdit: {
      withCode: summarizeGroup(groups.withCode),
      withoutCode: summarizeGroup(groups.withoutCode),
    },
  };
}

function within(directory, path) {
  const rel = relative(directory, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function canonical(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function sessionFiles(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => join(entry.parentPath, entry.name));
}

/**
 * Split a session at each runtime-provenance record (startup, reload, …) and
 * keep the segments whose recorded code is at least as new as `sinceCommit`.
 * Segments without provenance are counted in `coverage.unknownProvenance`.
 */
export function segmentsSince(entries, sinceCommit, coverage) {
  const segments = [];
  let current = { provenance: undefined, entries: [] };
  for (const entry of entries) {
    const provenance = provenanceOf(entry);
    if (!provenance) {
      current.entries.push(entry);
      continue;
    }
    segments.push(current);
    current = { provenance, entries: [] };
  }
  segments.push(current);
  return segments
    .filter((segment) => sessionCalls(segment.entries).length > 0)
    .filter((segment) => admitByCommit(segment, sinceCommit, coverage))
    .map((segment) => sessionCalls(segment.entries));
}

/** Parse one session file into analyzable call lists; empty when out of scope. */
function readSession(file, { workspace, since, sinceCommit, coverage }) {
  if (since && statSync(file).mtimeMs < since) return [];
  const entries = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Partially written trailing lines are skipped.
    }
  }
  const header = entries[0];
  if (header?.type !== "session" || typeof header.cwd !== "string") return [];
  if (workspace && !within(workspace, canonical(header.cwd))) return [];
  return sinceCommit ? segmentsSince(entries, sinceCommit, coverage) : [sessionCalls(entries)];
}

function sinceTimestamp(value) {
  if (!value) return undefined;
  const days = /^(\d+)d$/.exec(value);
  const time = days ? Date.now() - Number(days[1]) * 86_400_000 : Date.parse(value);
  if (Number.isNaN(time)) throw new Error(`Invalid --since value: ${value}`);
  return time;
}

function printReport(report) {
  const unknown =
    report.unknownProvenanceSegments === undefined
      ? ""
      : `; ${report.unknownProvenanceSegments} segments without provenance excluded`;
  console.log(
    `Sessions: ${report.sessions} (${report.sessionsWithCode} with code_* calls${unknown})\n`,
  );
  console.table(
    Object.entries(report.tools).map(([name, tool]) => ({
      tool: name,
      calls: tool.calls,
      errors: tool.errors,
      status: Object.entries(tool.status)
        .map(([key, count]) => `${key}:${count}`)
        .join(" "),
      "avg/p90 chars": `${tool.avgChars}/${tool.p90Chars}`,
      ...Object.fromEntries(FOLLOW_UP_CLASSES.map((name) => [name, tool.followUp[name]])),
    })),
  );
  const { withCode, withoutCode } = report.beforeFirstEdit;
  console.log(
    "Before first edit (median, correlation only):\n" +
      `  with code_*:    ${withCode.sessions} sessions, ${withCode.medianCallsBeforeEdit} calls, ${withCode.medianCharsBeforeEdit} result chars\n` +
      `  without code_*: ${withoutCode.sessions} sessions, ${withoutCode.medianCallsBeforeEdit} calls, ${withoutCode.medianCharsBeforeEdit} result chars`,
  );
}

function main() {
  const { values } = parseArgs({
    options: {
      workspace: { type: "string" },
      "all-workspaces": { type: "boolean" },
      "sessions-dir": { type: "string" },
      since: { type: "string" },
      "since-commit": { type: "string" },
      output: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(`Usage: node scripts/code-tool-usage.mjs [options]

  --workspace <path>    Sessions whose cwd is in this tree (default: cwd)
  --all-workspaces      Include every workspace
  --sessions-dir <path> Session storage (default: PI_CODING_AGENT_SESSION_DIR,
                        then <PI_CODING_AGENT_DIR or ~/.pi/agent>/sessions)
  --since <date|Nd>     Only session files modified since then (e.g. 30d)
  --since-commit <rev>  Only session segments whose recorded SuPi commit is at
                        least as new as <rev>; needs Debug capture (runtime
                        provenance). Each reload segment counts as a session.
  --output <path>       Also write the JSON report`);
    return;
  }
  const sessionsDir = resolve(
    values["sessions-dir"] ??
      process.env.PI_CODING_AGENT_SESSION_DIR ??
      join(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi/agent"), "sessions"),
  );
  const workspace = values["all-workspaces"]
    ? undefined
    : canonical(values.workspace ?? process.cwd());
  const since = sinceTimestamp(values.since);
  const sinceCommit = resolveCommit(values["since-commit"]);
  const coverage = { unknownProvenance: 0 };
  const sessions = sessionFiles(sessionsDir).flatMap((file) =>
    readSession(file, { workspace, since, sinceCommit, coverage }),
  );
  const report = {
    scope: {
      sessionsDir,
      workspace: workspace ?? null,
      since: since ? new Date(since).toISOString() : null,
      sinceCommit,
    },
    ...(sinceCommit ? { unknownProvenanceSegments: coverage.unknownProvenance } : {}),
    ...analyze(sessions),
  };
  printReport(report);
  if (values.output) writeFileSync(values.output, `${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
