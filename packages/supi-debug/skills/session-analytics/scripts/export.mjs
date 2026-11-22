#!/usr/bin/env node
import { open } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  canonicalPath,
  localPath,
  sessionDirectory,
} from "../../gather-retrospectives/scripts/paths.mjs";
import {
  integer,
  scanComplete,
  scanCoverage,
  scanSessions,
  sinceTimestamp,
} from "../../gather-retrospectives/scripts/sessions.mjs";
import { boundedArgs, head, LIMITS } from "./truncate.mjs";

const KINDS = ["tool-calls", "tool-availability", "debug-events"];

const help = `Export normalized Pi session data as JSONL without modifying sessions.
Usage: node export.mjs <kind> --output <new-file.jsonl> [options]
Kinds:
  tool-calls          One line per tool call: arguments, result status, size, head,
                      and the next calls
  tool-availability   One line per session: tools available and tools called
  debug-events        One line per persisted supi-debug-event: source, level,
                      category, and serialized bytes (no payloads)
Options:
  --workspace <path>     Include sessions in this directory tree (default: cwd)
  --all-workspaces       Explicitly include other projects; replaces --workspace
  --sessions-dir <path>  Override Pi storage discovery
  --since <date|Nd>      Inclusive ISO date/time or number of days ago
  --max-sessions <n>     Bound session scans (default: 5000)
  --output <path>        New JSONL file; existing files are preserved
  --tool <name>          tool-calls only: export calls of this tool
  --match <regex>        tool-calls only: export calls whose result text matches
  --next <0..20>         tool-calls only: following calls to attach (default: 3)
  --help                 Show this help
Stdout prints a compact JSON summary. Files are read linearly, so abandoned
branches are included. Arguments and results are truncated; see SKILL.md.
Storage precedence: flag, PI_CODING_AGENT_SESSION_DIR, project/global sessionDir,
then <PI_CODING_AGENT_DIR or ~/.pi/agent>/sessions. Relative paths use cwd.
`;

async function options() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      workspace: { type: "string" },
      "all-workspaces": { type: "boolean" },
      "sessions-dir": { type: "string" },
      since: { type: "string" },
      "max-sessions": { type: "string" },
      output: { type: "string" },
      tool: { type: "string" },
      match: { type: "string" },
      next: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) return null;
  const kind = validate(values, positionals);
  return {
    kind,
    workspace: values["all-workspaces"]
      ? null
      : await canonicalPath(values.workspace || process.cwd()),
    sessionsDir: await sessionDirectory(values["sessions-dir"]),
    since: sinceTimestamp(values.since),
    maxSessions: integer(values["max-sessions"] ?? "5000", "--max-sessions", 1, 100000),
    output: localPath(values.output),
    tool: values.tool ?? null,
    match: values.match === undefined ? null : pattern(values.match),
    next: integer(values.next ?? "3", "--next", 0, 20),
  };
}

function validate(values, positionals) {
  const [kind, ...extra] = positionals;
  if (!KINDS.includes(kind) || extra.length)
    throw new Error(`Name exactly one kind: ${KINDS.join(", ")}.`);
  if (!values.output) throw new Error("--output must name a new JSONL file.");
  if (values.workspace && values["all-workspaces"])
    throw new Error("Choose --workspace or --all-workspaces, not both.");
  if (
    kind !== "tool-calls" &&
    [values.tool, values.match, values.next].some((v) => v !== undefined)
  )
    throw new Error("--tool, --match, and --next apply to tool-calls only.");
  return kind;
}

function pattern(source) {
  try {
    return new RegExp(source);
  } catch (error) {
    throw new Error(`--match is not a valid regular expression: ${error.message}`, {
      cause: error,
    });
  }
}

function entryTime(entry, fallback) {
  const parsed = typeof entry.timestamp === "string" ? Date.parse(entry.timestamp) : Number.NaN;
  if (Number.isFinite(parsed)) return parsed;
  return Number.isFinite(fallback) ? fallback : null;
}

function isoTime(ms) {
  return ms === null ? null : new Date(ms).toISOString();
}

function inWindow(ms, config) {
  return config.since === null || (ms !== null && ms >= config.since);
}

function resultText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

function toolCalls(entry) {
  const message = entry.type === "message" ? entry.message : null;
  if (message?.role !== "assistant" || !Array.isArray(message.content)) return [];
  return message.content.filter(
    (block) => block?.type === "toolCall" && typeof block.name === "string",
  );
}

function toolResult(entry) {
  const message = entry.type === "message" ? entry.message : null;
  return message?.role === "toolResult" && typeof message.toolCallId === "string" ? message : null;
}

function callRecord(block, entry, context, ms) {
  return {
    sessionId: context.sessionId,
    sessionFile: context.sessionFile,
    line: context.line,
    cwd: context.cwd,
    timestamp: isoTime(ms),
    model: typeof entry.message.model === "string" ? entry.message.model : null,
    tool: block.name,
    callId: typeof block.id === "string" ? block.id : null,
    ...boundedArgs(block.arguments),
    isError: null,
    resultBytes: null,
    resultHead: null,
    next: [],
    state: { callId: block.id, resolved: false, text: null, openNext: 0 },
  };
}

/**
 * One record per call; a record is written once its result, its `--next` calls, and their
 * results are known, or at the session end. Each `next` entry carries its own `isError` and
 * a short `resultHead`, so a retry's outcome is visible without a second lookup.
 */
function toolCallExporter(config, write) {
  let pending = [];
  const byCallId = new Map();
  /** Next entries waiting for the result of their call, keyed by call id. */
  const waitingNext = new Map();

  function ready(record) {
    return (
      record.state.resolved && record.next.length >= config.next && record.state.openNext === 0
    );
  }

  function flush(all) {
    const keep = [];
    for (const record of pending) {
      if (!all && !ready(record)) {
        keep.push(record);
        continue;
      }
      const { state, ...line } = record;
      byCallId.delete(state.callId);
      if (!config.match || (state.text !== null && config.match.test(state.text))) write(line);
    }
    pending = keep;
  }

  function addNext(record, block) {
    const next = {
      tool: block.name,
      ...boundedArgs(block.arguments),
      isError: null,
      resultHead: null,
    };
    record.next.push(next);
    if (typeof block.id !== "string") return;
    record.state.openNext++;
    const waiting = waitingNext.get(block.id) ?? [];
    waiting.push({ next, record });
    waitingNext.set(block.id, waiting);
  }

  function addCall(block, entry, context) {
    for (const record of pending) {
      // Calls from the same assistant message ran in parallel, not in reaction to the result.
      if (record.line !== context.line && record.next.length < config.next) addNext(record, block);
    }
    const ms = entryTime(entry, entry.message.timestamp);
    if ((config.tool && block.name !== config.tool) || !inWindow(ms, config)) return;
    const record = callRecord(block, entry, context, ms);
    pending.push(record);
    if (typeof block.id === "string") byCallId.set(block.id, record);
  }

  function addResult(message) {
    const text = resultText(message.content);
    for (const { next, record } of waitingNext.get(message.toolCallId) ?? []) {
      next.isError = message.isError === true;
      next.resultHead = head(text, LIMITS.nextHead);
      record.state.openNext--;
    }
    waitingNext.delete(message.toolCallId);
    const record = byCallId.get(message.toolCallId);
    if (!record) return;
    record.isError = message.isError === true;
    record.resultBytes = Buffer.byteLength(text);
    record.resultHead = head(text, LIMITS.resultHead);
    record.state.resolved = true;
    record.state.text = text;
  }

  return {
    accept: (raw) => raw.includes("toolCall") || raw.includes("toolResult"),
    entry(entry, context) {
      for (const block of toolCalls(entry)) addCall(block, entry, context);
      const result = toolResult(entry);
      if (result) addResult(result);
      flush(false);
    },
    endSession() {
      flush(true);
      byCallId.clear();
      waitingNext.clear();
    },
  };
}

function toolNames(list) {
  return Array.isArray(list)
    ? list.map((tool) => tool?.name).filter((name) => typeof name === "string")
    : [];
}

/**
 * Replay system messages and compaction checkpoints: `available` is every tool any of them
 * added, so a tool counts as available when it was in the loadout at some point. A session is
 * in the `--since` window when any tool call, assistant message, or loadout change falls in it.
 */
function availabilityExporter(config, write) {
  let session;

  function addLoadout(message) {
    for (const name of toolNames(message.toolsAdded)) session.available.add(name);
    session.loadoutKnown = true;
  }

  return {
    accept: (raw) =>
      raw.includes("system") || raw.includes("compaction") || raw.includes("assistant"),
    startSession() {
      session = { available: new Set(), called: {}, loadoutKnown: false, inWindow: false };
    },
    entry(entry) {
      if (entry.type === "compaction" && entry.systemMessage) addLoadout(entry.systemMessage);
      const message = entry.type === "message" ? entry.message : null;
      if (message?.role === "system") addLoadout(message);
      if (!["system", "assistant"].includes(message?.role) && entry.type !== "compaction") return;
      if (!inWindow(entryTime(entry, message?.timestamp), config)) return;
      session.inWindow = true;
      for (const block of toolCalls(entry))
        session.called[block.name] = (session.called[block.name] ?? 0) + 1;
    },
    endSession(context) {
      if (!session.inWindow) return;
      write({
        sessionId: context.sessionId,
        sessionFile: context.sessionFile,
        cwd: context.cwd,
        loadoutKnown: session.loadoutKnown,
        available: [...session.available].sort((a, b) => a.localeCompare(b)),
        called: Object.fromEntries(
          Object.entries(session.called).sort(([a], [b]) => a.localeCompare(b)),
        ),
      });
    },
  };
}

function debugEventExporter(config, write) {
  return {
    accept: (raw) => raw.includes("supi-debug-event"),
    entry(entry, context) {
      if (entry.type !== "custom" || entry.customType !== "supi-debug-event") return;
      const event = entry.data ?? {};
      const ms = Number.isFinite(event.timestamp) ? event.timestamp : entryTime(entry, null);
      if (!inWindow(ms, config)) return;
      write({
        sessionId: context.sessionId,
        sessionFile: context.sessionFile,
        line: context.line,
        cwd: context.cwd,
        timestamp: isoTime(ms),
        source: typeof event.source === "string" ? event.source : null,
        level: typeof event.level === "string" ? event.level : null,
        category: typeof event.category === "string" ? event.category : null,
        bytes: Buffer.byteLength(context.raw),
      });
    },
  };
}

const EXPORTERS = {
  "tool-calls": toolCallExporter,
  "tool-availability": availabilityExporter,
  "debug-events": debugEventExporter,
};

/** Buffered JSONL writer on a newly created file. */
async function jsonlWriter(path) {
  const handle = await open(path, "wx", 0o600);
  let buffer = "";
  let records = 0;
  return {
    write(record) {
      records++;
      buffer += `${JSON.stringify(record)}\n`;
    },
    async drain(force) {
      if (buffer.length < 1 << 20 && !force) return;
      const chunk = buffer;
      buffer = "";
      await handle.write(chunk);
    },
    async close() {
      try {
        await this.drain(true);
      } finally {
        await handle.close();
      }
      return records;
    },
  };
}

async function exportSessions(config) {
  const coverage = scanCoverage();
  const writer = await jsonlWriter(config.output);
  let records;
  try {
    const exporter = EXPORTERS[config.kind](config, (record) => writer.write(record));
    await scanSessions(config, coverage, {
      accept: exporter.accept,
      startSession: (context) => exporter.startSession?.(context),
      entry: async (entry, context) => {
        exporter.entry(entry, context);
        await writer.drain(false);
      },
      endSession: async (context) => {
        exporter.endSession?.(context);
        await writer.drain(false);
      },
    });
  } finally {
    records = await writer.close();
  }
  return {
    kind: config.kind,
    outputFile: config.output,
    records,
    filters: {
      sessionsDir: config.sessionsDir,
      workspace: config.workspace,
      since: isoTime(config.since),
      ...(config.kind === "tool-calls"
        ? { tool: config.tool, match: config.match?.source ?? null, next: config.next }
        : {}),
    },
    coverage: { ...coverage, complete: scanComplete(coverage) },
    limitations: [
      "Files are read linearly: abandoned branches and forked copies are included.",
      "Lines without the record's marker text are skipped unparsed and not checked for malformed JSON.",
      `Strings in arguments are cut at ${LIMITS.string} characters, arrays at ${LIMITS.array} items, and nesting at depth ${LIMITS.depth}; result heads at ${LIMITS.resultHead} characters (${LIMITS.nextHead} in next calls).`,
      "Exported arguments and result heads can contain sensitive task details; the file is private (0600).",
    ],
  };
}

try {
  const config = await options();
  if (!config) process.stdout.write(help);
  else process.stdout.write(`${JSON.stringify(await exportSessions(config))}\n`);
} catch (error) {
  process.stderr.write(`Session export failed: ${error.message}\n`);
  process.exitCode = 1;
}
