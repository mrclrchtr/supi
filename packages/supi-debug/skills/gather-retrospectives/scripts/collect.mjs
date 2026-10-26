#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

const help = `Collect stored Agent Run retrospectives without modifying sessions.
Usage: node collect.mjs --output <new-file.json> [options]
  --workspace <path>     Include sessions in this directory tree (default: cwd)
  --all-workspaces       Explicitly include other projects; replaces --workspace
  --sessions-dir <path>  Override PI storage discovery
  --source <name>        supi-agent or supi-review (default: both, not a topic filter)
  --since <date|Nd>      Inclusive ISO date/time or number of days ago
  --limit <1..100>       Reports in this page (default: 20)
  --offset <number>      Page offset (default: 0; rescan against a stable corpus)
  --max-sessions <n>     Bound session scans (default: 5000)
  --output <path>        Save full page and coverage; existing files are preserved
  --help                Show this help
Only persisted supi-debug-event / agent-run-retrospective entries are collected.
Interactive reports and quoted tool results are excluded. Stdout contains complete
assessments within 16 KB; omittedRefs identifies text available only in the file.
Storage precedence: flag, PI_CODING_AGENT_SESSION_DIR, project/global sessionDir,
then <PI_CODING_AGENT_DIR or ~/.pi/agent>/sessions. Relative paths use cwd.
`;

function localPath(path) {
  return resolve(
    path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path,
  );
}

async function canonicalPath(path) {
  const absolute = localPath(path);
  try {
    return await realpath(absolute);
  } catch (error) {
    if (error.code === "ENOENT") return absolute;
    throw error;
  }
}

async function settings(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error(`Cannot read settings: ${path}`, { cause: error });
  }
}

async function sessionDirectory(explicit) {
  if (explicit) return localPath(explicit);
  if (process.env.PI_CODING_AGENT_SESSION_DIR)
    return localPath(process.env.PI_CODING_AGENT_SESSION_DIR);
  const agentDir = localPath(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi/agent"));
  const project = await settings(join(process.cwd(), ".pi/settings.json"));
  if (typeof project.sessionDir === "string") return localPath(project.sessionDir);
  const global = await settings(join(agentDir, "settings.json"));
  return typeof global.sessionDir === "string"
    ? localPath(global.sessionDir)
    : join(agentDir, "sessions");
}

function integer(value, name, min, max) {
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer from ${min} through ${max}.`);
  }
  return parsed;
}

function sinceTimestamp(value) {
  if (!value) return null;
  if (/^\d+d$/.test(value)) {
    const days = integer(value.slice(0, -1), "--since days", 0, 36500);
    return Date.now() - days * 86400000;
  }
  const parsed = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) ? Date.parse(value) : Number.NaN;
  if (
    !Number.isFinite(parsed) ||
    (value.length === 10 && new Date(parsed).toISOString().slice(0, 10) !== value)
  ) {
    throw new Error("--since must be an ISO date/time or a duration such as 30d.");
  }
  return parsed;
}

async function options() {
  const { values } = parseArgs({
    options: {
      workspace: { type: "string" },
      "all-workspaces": { type: "boolean" },
      "sessions-dir": { type: "string" },
      source: { type: "string" },
      since: { type: "string" },
      limit: { type: "string", default: "20" },
      offset: { type: "string", default: "0" },
      "max-sessions": { type: "string", default: "5000" },
      output: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) return null;
  if (!values.output) throw new Error("--output must name a new JSON evidence file.");
  if (values.workspace && values["all-workspaces"])
    throw new Error("Choose --workspace or --all-workspaces, not both.");
  if (values.source && !["supi-agent", "supi-review"].includes(values.source)) {
    throw new Error(
      "--source must be supi-agent or supi-review; topic relevance is assessed separately.",
    );
  }
  return {
    workspace: values["all-workspaces"]
      ? null
      : await canonicalPath(values.workspace || process.cwd()),
    sessionsDir: await sessionDirectory(values["sessions-dir"]),
    source: values.source ?? null,
    since: sinceTimestamp(values.since),
    limit: integer(values.limit, "--limit", 1, 100),
    offset: integer(values.offset, "--offset", 0, Number.MAX_SAFE_INTEGER),
    maxSessions: integer(values["max-sessions"], "--max-sessions", 1, 100000),
    output: localPath(values.output),
  };
}

function within(directory, path) {
  const child = relative(directory, path);
  return child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

function recordFailure(coverage, path, code) {
  coverage.readFailures++;
  if (coverage.failures.length < 10) coverage.failures.push({ path, code });
}

async function directoryEntries(directory, config, coverage) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (directory === config.sessionsDir)
      throw new Error(`Cannot list session storage: ${directory}`, { cause: error });
    recordFailure(coverage, directory, error.code ?? "READ_FAILED");
    return [];
  }
}

function discoverEntry(entry, directory, state) {
  const path = join(directory, entry.name);
  if (entry.isSymbolicLink()) state.coverage.ignoredSymlinks++;
  else if (entry.isDirectory()) state.pending.push(path);
  else if (entry.isFile() && entry.name.endsWith(".jsonl")) state.files.push(path);
}

async function discover(config, coverage) {
  const files = [];
  const pending = [config.sessionsDir];
  while (pending.length) {
    const directory = pending.pop();
    const entries = await directoryEntries(directory, config, coverage);
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      discoverEntry(entry, directory, { files, pending, coverage });
      if (files.length > config.maxSessions) {
        coverage.sessionLimitReached = true;
        return files.slice(0, config.maxSessions);
      }
    }
  }
  return files;
}

function parseEntry(line, coverage) {
  try {
    return JSON.parse(line);
  } catch {
    coverage.malformedEntries++;
    return null;
  }
}

function assessment(entry) {
  if (entry?.type !== "custom" || entry.customType !== "supi-debug-event") return null;
  const event = entry.data;
  if (event?.category !== "agent-run-retrospective") return null;
  const data = event.data;
  if (
    !["supi-agent", "supi-review"].includes(event.source) ||
    !Number.isFinite(event.timestamp) ||
    Math.abs(event.timestamp) > 8.64e15 ||
    !["completed", "failed"].includes(data?.status) ||
    (data.text !== undefined && typeof data.text !== "string")
  )
    return null;
  return { event, data };
}

// Project only known sanitized assessment fields; never copy whole entries or rawData.
function report(entry, context) {
  const parsed = assessment(entry);
  if (!parsed) return null;
  const { event, data } = parsed;
  const report = {
    timestamp: event.timestamp,
    source: event.source,
    status: data.status,
    text: data.text,
    ...context,
    entryId: typeof entry.id === "string" ? entry.id : null,
  };
  for (const key of ["runKey", "caller", "batchId", "taskId", "label", "conversationId"]) {
    if (typeof data[key] === "string") report[key] = data[key];
  }
  const identity = report.runKey
    ? [report.source, report.runKey]
    : [report.source, report.timestamp, report.status, report.text, report.entryId];
  report.ref = `R-${createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 16)}`;
  return report;
}

async function readHeader(line, path, state) {
  const session = parseEntry(line, state.coverage);
  if (session?.type !== "session" || typeof session.cwd !== "string" || !isAbsolute(session.cwd)) {
    recordFailure(state.coverage, path, "INVALID_SESSION_HEADER");
    return null;
  }
  const cwd = await canonicalPath(session.cwd);
  if (state.config.workspace && !within(state.config.workspace, cwd)) return null;
  state.coverage.scopedSessions++;
  return session;
}

function collectLine(line, context, state) {
  if (!line.trim()) return;
  const { config, coverage, reports } = state;
  const entry = parseEntry(line, coverage);
  if (
    entry?.type !== "custom" ||
    entry.customType !== "supi-debug-event" ||
    entry.data?.category !== "agent-run-retrospective"
  )
    return;
  const item = report(entry, context);
  if (!item) {
    coverage.malformedEntries++;
    return;
  }
  if (
    (config.source && item.source !== config.source) ||
    (config.since !== null && item.timestamp < config.since)
  )
    return;
  coverage.matchingEvents++;
  if (reports.has(item.ref)) coverage.duplicateEvents++;
  else reports.set(item.ref, item);
}

/** Split JSONL only on LF; readline also splits valid JSON string content at U+2028/U+2029. */
async function* jsonLines(input) {
  let pending = "";
  for await (const chunk of input) {
    pending += chunk;
    let index = pending.indexOf("\n");
    while (index !== -1) {
      yield pending.slice(0, index);
      pending = pending.slice(index + 1);
      index = pending.indexOf("\n");
    }
  }
  if (pending) yield pending;
}

async function scanSession(path, state) {
  const { coverage } = state;
  coverage.scannedSessions++;
  const input = createReadStream(path, { encoding: "utf8" });
  const lines = jsonLines(input);
  let lineNumber = 0;
  let session;
  try {
    for await (const line of lines) {
      lineNumber++;
      if (lineNumber === 1) {
        session = await readHeader(line, path, state);
        if (!session) break;
        continue;
      }
      collectLine(
        line,
        { sessionFile: path, sessionId: session.id, cwd: session.cwd, line: lineNumber },
        state,
      );
    }
    if (lineNumber === 0) recordFailure(coverage, path, "EMPTY_SESSION");
  } catch (error) {
    recordFailure(coverage, path, error.code ?? "READ_FAILED");
  } finally {
    input.destroy();
  }
}

async function collect(config) {
  const coverage = {
    scannedSessions: 0,
    scopedSessions: 0,
    matchingEvents: 0,
    duplicateEvents: 0,
    malformedEntries: 0,
    ignoredSymlinks: 0,
    sessionLimitReached: false,
    readFailures: 0,
    failures: [],
  };
  const reports = new Map();
  const files = await discover(config, coverage);
  for (const file of files) await scanSession(file, { config, coverage, reports });
  const sorted = [...reports.values()].sort(
    (a, b) => b.timestamp - a.timestamp || a.ref.localeCompare(b.ref),
  );
  const records = sorted.slice(config.offset, config.offset + config.limit);
  const next = config.offset + records.length;
  return {
    filters: config,
    coverage: {
      ...coverage,
      complete:
        !coverage.sessionLimitReached &&
        coverage.ignoredSymlinks === 0 &&
        coverage.readFailures === 0 &&
        coverage.malformedEntries === 0,
      uniqueReports: sorted.length,
      returnedReports: records.length,
      nextOffset: next < sorted.length ? next : null,
    },
    limitations: [
      "Structured persisted retrospectives only; interactive reports are excluded.",
      "Stored text is best-effort sanitized, not guaranteed free of sensitive task details.",
      "Successful-task selection and optional logging prevent population failure-rate estimates.",
      "Source identifies the producer, not the topic; suggestions are not verified improvements.",
    ],
    records,
  };
}

/** Display whole assessments once; preserve oversized text only in the evidence artifact. */
function displayPage({ filters, coverage, records }) {
  const { failures: _failures, ...counts } = coverage;
  let display = {
    evidenceFile: filters.output,
    sessionsDir: filters.sessionsDir,
    scope: {
      workspace: filters.workspace,
      source: filters.source,
      since: filters.since === null ? null : new Date(filters.since).toISOString(),
    },
    coverage: counts,
    records: [],
    omittedRefs: records.map((record) => record.ref),
  };
  const fits = (value) => Buffer.byteLength(JSON.stringify(value)) + 1 <= 16_000;
  if (!fits(display))
    throw new Error("Display metadata exceeds 16 KB; full evidence was saved to --output.");
  for (const record of records) {
    const item = {
      ref: record.ref,
      source: record.source,
      date: new Date(record.timestamp).toISOString(),
      status: record.status,
      file: relative(filters.sessionsDir, record.sessionFile),
      line: record.line,
      text: record.text,
    };
    const candidate = {
      ...display,
      records: [...display.records, item],
      omittedRefs: display.omittedRefs.filter((ref) => ref !== record.ref),
    };
    if (fits(candidate)) display = candidate;
  }
  return display;
}

try {
  const config = await options();
  if (!config) process.stdout.write(help);
  else {
    const evidence = await collect(config);
    await writeFile(config.output, `${JSON.stringify(evidence, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    process.stdout.write(`${JSON.stringify(displayPage(evidence))}\n`);
  }
} catch (error) {
  process.stderr.write(`Retrospective collection failed: ${error.message}\n`);
  process.exitCode = 1;
}
