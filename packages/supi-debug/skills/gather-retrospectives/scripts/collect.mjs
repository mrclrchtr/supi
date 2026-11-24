#!/usr/bin/env node
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { recordGather, recordSkipReason, sinceOptions } from "./gather-state.mjs";
import {
  agentDirectory,
  canonicalPath,
  localPath,
  projectRoot,
  sessionDirectory,
} from "./paths.mjs";
import {
  FAILURE_REASONS,
  isProducer,
  isProducerEvent,
  isRetrospectiveCategory,
  PRODUCER_NAMES,
} from "./producers.mjs";
import {
  admitByCommit,
  provenanceOf,
  resolveCommit,
  SINCE_COMMIT_LIMITATION,
} from "./provenance.mjs";
import { integer, scanComplete, scanCoverage, scanSessions, sinceTimestamp } from "./sessions.mjs";
import { displayPage, exportReports, readEvidence, summarize } from "./snapshot.mjs";

const help = `Collect stored retrospectives without modifying sessions.
Usage: node collect.mjs --output <new-file.json> [collection options]
       node collect.mjs --read <evidence.json> [display options]
       node collect.mjs --read <evidence.json> --export <new-file.jsonl> [--refs]
  --workspace <path>     Include sessions in this directory tree (default: cwd);
                         repeat to combine trees, such as sibling Git worktrees
  --all-workspaces       Explicitly include other projects; replaces --workspace
  --sessions-dir <path>  Override Pi storage discovery
  --source <name>        supi-agent (delegated runs), supi-review (Reviewer Runs), or
                         supi-debug (/supi-tooling-retro reports); default: all
                         producers. Not a topic filter
  --since <date|Nd>      Inclusive ISO date/time or number of days ago
  --since-last           Start at the previous gather for the same storage,
                         workspace, and source (all dates when none is recorded)
  --no-record            Do not update the last-gather marker
  --since-commit <rev>   Only reports from sessions whose recorded SuPi commit is
                         at least as new as <rev> (resolved with git in cwd);
                         reports without runtime provenance are excluded and counted
  --max-sessions <n>     Bound session scans (default: 5000)
  --output <path>        Save all matching reports; existing files are preserved
  --read <path>          Read a saved snapshot without accessing session storage
  --refs <ref,ref>       Select report references from --read (default: all)
  --limit <1..100>       Maximum reports displayed per response (default: 20)
  --offset <number>      Report offset within the selection (default: 0)
  --text-offset <number> UTF-16 offset within an oversized report (--read only)
  --export <path>        With --read: write selected reports as complete JSONL
                         (one report per line) instead of paginated display
  --help                Show this help
Only persisted supi-debug-event entries of category agent-run-retrospective
(supi-agent, supi-review) or tooling-retrospective (supi-debug) are collected.
Quoted tool results and /supi-tooling-retro reports written before that command
stored them are excluded. Stdout is bounded to
16 KB. Follow nextCommand until display.complete; oversized text is continued
with explicit textRange offsets. coverage.complete describes the scan, not display.
Storage precedence: flag, PI_CODING_AGENT_SESSION_DIR, project/global sessionDir,
then <PI_CODING_AGENT_DIR or ~/.pi/agent>/sessions. Relative paths use cwd.
`;

function readOptions(values, display) {
  const collectionFlags = [
    "workspace",
    "all-workspaces",
    "sessions-dir",
    "source",
    "since",
    "since-last",
    "no-record",
    "since-commit",
    "max-sessions",
    "output",
  ];
  if (collectionFlags.some((key) => values[key] !== undefined))
    throw new Error("--read cannot be combined with collection options.");
  if (display.refs?.some((ref) => !/^R-[a-f0-9]{16}$/.test(ref)))
    throw new Error("--refs must contain comma-separated report references.");
  if (values.export !== undefined && (values["text-offset"] || values.offset !== "0"))
    throw new Error("--export writes the whole selection; omit --offset and --text-offset.");
  return {
    read: localPath(values.read),
    display,
    ...(values.export === undefined ? {} : { exportFile: localPath(values.export) }),
  };
}

function validateCollection(values) {
  if (
    values.refs !== undefined ||
    values["text-offset"] !== undefined ||
    values.export !== undefined
  )
    throw new Error("--refs, --text-offset, and --export require --read.");
  if (!values.output) throw new Error("--output must name a new JSON evidence file.");
  if (values.workspace && values["all-workspaces"])
    throw new Error("Choose --workspace or --all-workspaces, not both.");
  if (values.since && values["since-last"])
    throw new Error("Choose --since or --since-last, not both.");
  if (values.source && !isProducer(values.source)) {
    throw new Error(
      `--source must be one of ${PRODUCER_NAMES.join(", ")}; topic relevance is assessed separately.`,
    );
  }
}

/**
 * One tree stays a string so existing last-gather markers keep their scope key; several trees
 * become a sorted, deduplicated array so argument order does not split markers.
 */
async function workspaces(paths = [process.cwd()]) {
  const unique = [...new Set(await Promise.all(paths.map(canonicalPath)))].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return unique.length === 1 ? unique[0] : unique;
}

async function options() {
  const { values } = parseArgs({
    options: {
      workspace: { type: "string", multiple: true },
      "all-workspaces": { type: "boolean" },
      "sessions-dir": { type: "string" },
      source: { type: "string" },
      since: { type: "string" },
      "since-last": { type: "boolean" },
      "no-record": { type: "boolean" },
      "since-commit": { type: "string" },
      limit: { type: "string", default: "20" },
      offset: { type: "string", default: "0" },
      "max-sessions": { type: "string" },
      output: { type: "string" },
      read: { type: "string" },
      refs: { type: "string" },
      "text-offset": { type: "string" },
      export: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) return null;
  const display = {
    limit: integer(values.limit, "--limit", 1, 100),
    offset: integer(values.offset, "--offset", 0, Number.MAX_SAFE_INTEGER),
    textOffset: integer(values["text-offset"] ?? "0", "--text-offset", 0, Number.MAX_SAFE_INTEGER),
    refs: values.refs?.split(",") ?? null,
  };
  if (values.read) return readOptions(values, display);
  validateCollection(values);
  const scope = {
    workspace: values["all-workspaces"] ? null : await workspaces(values.workspace),
    sessionsDir: await sessionDirectory(values["sessions-dir"]),
    source: values.source ?? null,
  };
  return {
    ...scope,
    ...(await sinceOptions(agentDirectory(), scope, values["since-last"] === true, () =>
      sinceTimestamp(values.since),
    )),
    noRecord: values["no-record"] === true,
    sinceCommit: resolveCommit(values["since-commit"]),
    maxSessions: integer(values["max-sessions"] ?? "5000", "--max-sessions", 1, 100000),
    output: localPath(values.output),
    display,
  };
}

function assessment(entry) {
  if (entry?.type !== "custom" || entry.customType !== "supi-debug-event") return null;
  const event = entry.data;
  if (!isRetrospectiveCategory(event?.category)) return null;
  const data = event.data;
  if (
    !isProducerEvent(event.source, event.category) ||
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
  if (Number.isSafeInteger(data.promptRevision)) report.promptRevision = data.promptRevision;
  if (report.status === "failed" && FAILURE_REASONS.includes(data.failureReason)) {
    report.failureReason = data.failureReason;
  }
  const metrics = taskMetrics(data.metrics);
  if (metrics) report.metrics = metrics;
  const identity = report.runKey
    ? [report.source, report.runKey]
    : [report.source, report.timestamp, report.status, report.text, report.entryId];
  report.ref = `R-${createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 16)}`;
  return report;
}

const count = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : undefined);

// Task measurements recorded with delegated and Reviewer Run reports; absent on older events.
function taskMetrics(value) {
  if (!value || typeof value !== "object") return null;
  const metrics = {};
  for (const key of ["durationMs", "turns", "toolUses", "toolErrors"]) {
    if (count(value[key]) !== undefined) metrics[key] = value[key];
  }
  if (Array.isArray(value.tools)) {
    metrics.tools = value.tools.filter(
      (tool) => typeof tool?.name === "string" && count(tool.uses) !== undefined,
    );
  }
  if (Array.isArray(value.availableTools)) {
    metrics.availableTools = value.availableTools.filter((name) => typeof name === "string");
  }
  if (count(value.usage?.total) !== undefined) metrics.totalTokens = value.usage.total;
  if (typeof value.usage?.cost?.total === "number") metrics.cost = value.usage.cost.total;
  return Object.keys(metrics).length > 0 ? metrics : null;
}

function trackProvenance(entry, state) {
  const provenance = provenanceOf(entry);
  if (provenance) state.provenanceContext = { provenance };
  return Boolean(provenance);
}

function collectEntry(entry, context, state) {
  const { config, coverage, reports } = state;
  if (trackProvenance(entry, state)) return;
  if (
    entry?.type !== "custom" ||
    entry.customType !== "supi-debug-event" ||
    !isRetrospectiveCategory(entry.data?.category)
  )
    return;
  const { raw: _raw, ...location } = context;
  const item = report(entry, { ...location, ...state.provenanceContext });
  if (!item) {
    coverage.malformedEntries++;
    return;
  }
  if (
    (config.source && item.source !== config.source) ||
    (config.since !== null && item.timestamp < config.since)
  )
    return;
  if (!admitByCommit(item, config.sinceCommit, coverage)) return;
  coverage.matchingEvents++;
  if (reports.has(item.ref)) coverage.duplicateEvents++;
  else reports.set(item.ref, item);
}

async function collect(config) {
  const coverage = {
    ...scanCoverage(),
    matchingEvents: 0,
    duplicateEvents: 0,
    unknownProvenance: 0,
  };
  const reports = new Map();
  const state = { config, coverage, reports, provenanceContext: {} };
  await scanSessions(config, coverage, {
    // Provenance applies to entries after it until the next session_start record.
    startSession: () => {
      state.provenanceContext = {};
    },
    entry: (entry, context) => collectEntry(entry, context, state),
  });
  const sorted = [...reports.values()].sort(
    (a, b) => b.timestamp - a.timestamp || a.ref.localeCompare(b.ref),
  );
  const projects = new Map();
  for (const record of sorted) {
    if (!projects.has(record.cwd)) projects.set(record.cwd, projectRoot(record.cwd));
    record.project = projects.get(record.cwd);
  }
  const { display: _display, output: _output, stateFile: _stateFile, ...filters } = config;
  return {
    version: 1,
    filters,
    coverage: {
      ...coverage,
      complete: scanComplete(coverage),
      uniqueReports: sorted.length,
    },
    limitations: [
      "Persisted retrospectives only; /supi-tooling-retro reports from before they were stored are excluded.",
      "Stored text is best-effort sanitized, not guaranteed free of sensitive task details.",
      "Successful-task selection and optional logging prevent population failure-rate estimates.",
      "Source identifies the producer, not the topic; suggestions are not verified improvements.",
      ...(config.sinceCommit ? [SINCE_COMMIT_LIMITATION] : []),
    ],
    records: sorted,
  };
}

try {
  const config = await options();
  if (!config) process.stdout.write(help);
  else {
    const startedAt = Date.now();
    const evidence = config.read ? await readEvidence(config.read) : await collect(config);
    const evidenceFile = config.read ?? config.output;
    if (!config.read) {
      evidence.summary = summarize(evidence.records);
      const skipReason = recordSkipReason(config, evidence.coverage);
      evidence.filters.recordedGather = skipReason ? null : new Date(startedAt).toISOString();
      evidence.filters.recordSkipReason = skipReason;
      await writeFile(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`, {
        flag: "wx",
        mode: 0o600,
      });
      if (evidence.filters.recordedGather) await recordGather(config.stateFile, config, startedAt);
    }
    const result = config.exportFile
      ? await exportReports(evidence, evidenceFile, config.exportFile, config.display.refs)
      : displayPage(evidence, evidenceFile, config.display, fileURLToPath(import.meta.url));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
} catch (error) {
  process.stderr.write(`Retrospective collection failed: ${error.message}\n`);
  process.exitCode = 1;
}
