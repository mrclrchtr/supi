import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { FAILURE_REASONS, isProducer, PRODUCER_NAMES } from "./producers.mjs";
import { TOOL_SELECTION_FAMILIES } from "./tool-selection.mjs";

// Snapshots written before projects were resolved carry only the session working directory.
const projectOf = (record) => record.project ?? record.cwd ?? "unknown";

/**
 * Count deduplicated reports, not independent experiments or all sessions scanned. `byProject`
 * lists report counts per project, largest first. `byFailureReason` splits failed reports by
 * their recorded reason; reports from before reasons were recorded count as `unknown`.
 */
export function summarize(records) {
  const bySource = Object.fromEntries(PRODUCER_NAMES.map((name) => [name, 0]));
  const byStatus = { completed: 0, failed: 0 };
  const byFailureReason = Object.fromEntries([...FAILURE_REASONS, "unknown"].map((r) => [r, 0]));
  const projects = new Map();
  const toolSelection = {};
  let earliest = Infinity;
  let latest = -Infinity;
  for (const record of records) {
    bySource[record.source]++;
    byStatus[record.status]++;
    if (record.status === "failed") {
      byFailureReason[
        FAILURE_REASONS.includes(record.failureReason) ? record.failureReason : "unknown"
      ]++;
    }
    projects.set(projectOf(record), (projects.get(projectOf(record)) ?? 0) + 1);
    countToolSelection(toolSelection, record);
    earliest = Math.min(earliest, record.timestamp);
    latest = Math.max(latest, record.timestamp);
  }
  return {
    reports: records.length,
    containingSessions: new Set(records.map((record) => record.sessionFile)).size,
    bySource,
    byStatus,
    byFailureReason,
    byProject: Object.fromEntries(
      [...projects].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    ),
    earliest: records.length ? new Date(earliest).toISOString() : null,
    latest: records.length ? new Date(latest).toISOString() : null,
    ...answeredToolSelection(toolSelection),
  };
}

// Omit revisions, and then producers, whose reports never answered with Tool Selection lines.
function answeredToolSelection(summary) {
  const answered = Object.entries(summary)
    .map(([source, revisions]) => [
      source,
      Object.fromEntries(
        Object.entries(revisions).filter(
          ([, entry]) => entry.reports.parsed + entry.reports.invalid > 0,
        ),
      ),
    ])
    .filter(([, revisions]) => Object.keys(revisions).length > 0);
  return answered.length > 0 ? { toolSelection: Object.fromEntries(answered) } : {};
}

/**
 * Count parsed Tool Selection answers per producer and `promptRevision` (`unknown` when none was
 * recorded), since revisions may define codes differently: reports by parse status, and per
 * family the moments by code plus the reports that answered "No such moment.". `missing`
 * includes reports from prompts without the question and runs without these tools.
 */
function countToolSelection(summary, record) {
  const parsed = record.toolSelection;
  if (!parsed) return;
  summary[record.source] ??= {};
  const revisions = summary[record.source];
  const revision = String(record.promptRevision ?? "unknown");
  revisions[revision] ??= {
    reports: { parsed: 0, invalid: 0, missing: 0 },
    invalidLines: 0,
    families: Object.fromEntries(
      TOOL_SELECTION_FAMILIES.map((family) => [family, { codes: {}, noMoment: 0 }]),
    ),
  };
  const entry = revisions[revision];
  entry.reports[parsed.status]++;
  entry.invalidLines += parsed.invalidLines;
  for (const moment of parsed.moments) {
    const codes = entry.families[moment.family].codes;
    codes[moment.code] = (codes[moment.code] ?? 0) + 1;
  }
  for (const family of new Set(parsed.noMoment)) entry.families[family].noMoment++;
}

/** Snapshot reads never discover storage or open original session files. */
export async function readEvidence(path) {
  const evidence = JSON.parse(await readFile(path, "utf8"));
  if (
    evidence.version !== 1 ||
    !evidence.filters ||
    !evidence.coverage ||
    !Array.isArray(evidence.records) ||
    typeof evidence.filters.sessionsDir !== "string" ||
    !evidence.records.every(
      (record) =>
        /^R-[a-f0-9]{16}$/.test(record.ref) &&
        isProducer(record.source) &&
        ["completed", "failed"].includes(record.status) &&
        Number.isFinite(record.timestamp) &&
        Math.abs(record.timestamp) <= 8.64e15 &&
        typeof record.sessionFile === "string" &&
        isAbsolute(record.sessionFile) &&
        Number.isSafeInteger(record.line) &&
        record.line > 0 &&
        (record.text === undefined || typeof record.text === "string"),
    )
  )
    throw new Error("Invalid retrospective snapshot; collect a new evidence file.");
  return evidence;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

const fits = (value) => Buffer.byteLength(JSON.stringify(value)) + 1 <= 16_000;

function selectRecords(allRecords, options) {
  const refs = options.refs ? new Set(options.refs) : null;
  if (refs && [...refs].some((ref) => !allRecords.some((record) => record.ref === ref)))
    throw new Error("Unknown report reference in --refs.");
  const records = refs ? allRecords.filter((record) => refs.has(record.ref)) : allRecords;
  if (options.offset > records.length)
    throw new Error("--offset exceeds the number of selected reports.");
  const initialText = records[options.offset]?.text ?? "";
  if (
    options.textOffset &&
    (options.textOffset >= initialText.length ||
      safeTextEnd(initialText, options.textOffset) !== options.textOffset)
  )
    throw new Error("--text-offset must address unread text at a Unicode boundary.");

  return records;
}

function displayScope(filters) {
  return {
    workspace: filters.workspace,
    source: filters.source,
    since: filters.since === null ? null : new Date(filters.since).toISOString(),
    ...(filters.sinceCommit ? { sinceCommit: filters.sinceCommit } : {}),
    ...(filters.sinceLast ? { sinceLast: true } : {}),
    previousGather: filters.previousGather ?? null,
    recordedGather: filters.recordedGather ?? null,
    ...(filters.recordSkipReason ? { recordSkipReason: filters.recordSkipReason } : {}),
  };
}

function displayRecord(record, filters) {
  return {
    ref: record.ref,
    source: record.source,
    date: new Date(record.timestamp).toISOString(),
    status: record.status,
    ...(record.failureReason === undefined ? {} : { failureReason: record.failureReason }),
    ...(record.promptRevision === undefined ? {} : { promptRevision: record.promptRevision }),
    ...(record.provenance?.commit
      ? { commit: record.provenance.commit.slice(0, 12), dirty: record.provenance.dirty === true }
      : {}),
    file: relative(filters.sessionsDir, record.sessionFile),
    line: record.line,
    project: projectOf(record),
    ...(record.sessionId === undefined ? {} : { session: record.sessionId }),
  };
}

/**
 * Write the selected reports as complete JSONL, one whole assessment per line, for bulk analysis
 * in scripts. Stdout carries only the export path, scope, coverage, and summary.
 */
export async function exportReports(evidence, evidenceFile, exportFile, refs) {
  const records = selectRecords(evidence.records, { refs, offset: 0, textOffset: 0 });
  const lines = records.map((record) =>
    JSON.stringify({
      ...displayRecord(record, evidence.filters),
      ...(record.label === undefined ? {} : { label: record.label }),
      ...(record.metrics === undefined ? {} : { metrics: record.metrics }),
      ...(record.toolSelection === undefined ? {} : { toolSelection: record.toolSelection }),
      text: record.text ?? null,
    }),
  );
  await writeFile(exportFile, lines.length ? `${lines.join("\n")}\n` : "", {
    flag: "wx",
    mode: 0o600,
  });
  const { failures: _failures, ...coverage } = evidence.coverage;
  return {
    evidenceFile,
    exportFile,
    exportedReports: records.length,
    scope: displayScope(evidence.filters),
    coverage,
    summary: summarize(evidence.records),
  };
}

function createRenderer(evidence, records, { evidenceFile, options, scriptFile }) {
  const { filters, coverage, records: allRecords } = evidence;
  const { failures: _failures, ...counts } = coverage;
  const summary = summarize(allRecords);
  return (items, offset, textOffset = 0) => {
    const complete = offset === records.length;
    const args = [process.execPath, scriptFile, "--read", evidenceFile];
    if (options.refs) args.push("--refs", options.refs.join(","));
    args.push("--limit", String(options.limit), "--offset", String(offset));
    if (textOffset) args.push("--text-offset", String(textOffset));
    return {
      evidenceFile,
      sessionsDir: filters.sessionsDir,
      scope: displayScope(filters),
      coverage: counts,
      summary,
      display: {
        selectedReports: records.length,
        displayedReports: items.length,
        remainingReports: records.length - offset,
        complete,
        nextOffset: complete ? null : offset,
        nextTextOffset: complete ? null : textOffset,
      },
      records: items,
      nextCommand: complete ? null : args.map(shellQuote).join(" "),
    };
  };
}

/** Fit escaped JSON bytes, preserving Unicode and making forward progress on long assessments. */
function fragmentPage(record, item, { offset, textOffset, render, evidenceFile }) {
  const text = record.text ?? "";
  let low = textOffset + 1;
  let high = text.length;
  let best;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const end = safeTextEnd(text, middle);
    const fragment = {
      ...item,
      text: text.slice(textOffset, end),
      textRange: { start: textOffset, end, total: text.length },
    };
    const page = render(
      [fragment],
      end === text.length ? offset + 1 : offset,
      end === text.length ? 0 : end,
    );
    if (end > textOffset && fits(page)) {
      best = page;
      low = middle + 1;
    } else high = middle - 1;
  }
  if (!best)
    throw new Error(`Display metadata exceeds 16 KB; full evidence is in ${evidenceFile}.`);
  return best;
}

/** Display a frozen selection with resumable report and UTF-16 text cursors. */
export function displayPage(evidence, evidenceFile, options, scriptFile) {
  const records = selectRecords(evidence.records, options);
  const { filters } = evidence;
  const render = createRenderer(evidence, records, { evidenceFile, options, scriptFile });
  const items = [];
  let offset = options.offset;
  let textOffset = options.textOffset;
  let display = render(items, offset, textOffset);
  while (offset < records.length && items.length < options.limit) {
    const record = records[offset];
    const item = { ...displayRecord(record, filters), text: record.text?.slice(textOffset) };
    if (textOffset)
      item.textRange = { start: textOffset, end: record.text.length, total: record.text.length };
    const candidate = render([...items, item], offset + 1);
    if (fits(candidate)) {
      items.push(item);
      offset++;
      textOffset = 0;
      display = candidate;
      continue;
    }
    // Defer whole reports rather than splitting them merely to fill a response.
    if (items.length) break;
    return fragmentPage(record, item, { offset, textOffset, render, evidenceFile });
  }
  if (!fits(display))
    throw new Error(`Display metadata exceeds 16 KB; full evidence is in ${evidenceFile}.`);
  return display;
}

function safeTextEnd(text, end) {
  const before = text.charCodeAt(end - 1);
  const after = text.charCodeAt(end);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff ? end - 1 : end;
}
