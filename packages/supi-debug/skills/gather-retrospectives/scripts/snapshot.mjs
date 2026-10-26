import { readFile } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";

/** Count deduplicated reports, not independent experiments or all sessions scanned. */
export function summarize(records) {
  const bySource = { "supi-agent": 0, "supi-review": 0 };
  const byStatus = { completed: 0, failed: 0 };
  let earliest = Infinity;
  let latest = -Infinity;
  for (const record of records) {
    bySource[record.source]++;
    byStatus[record.status]++;
    earliest = Math.min(earliest, record.timestamp);
    latest = Math.max(latest, record.timestamp);
  }
  return {
    reports: records.length,
    containingSessions: new Set(records.map((record) => record.sessionFile)).size,
    bySource,
    byStatus,
    earliest: records.length ? new Date(earliest).toISOString() : null,
    latest: records.length ? new Date(latest).toISOString() : null,
  };
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
        ["supi-agent", "supi-review"].includes(record.source) &&
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
      scope: {
        workspace: filters.workspace,
        source: filters.source,
        since: filters.since === null ? null : new Date(filters.since).toISOString(),
      },
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
    const item = {
      ref: record.ref,
      source: record.source,
      date: new Date(record.timestamp).toISOString(),
      status: record.status,
      file: relative(filters.sessionsDir, record.sessionFile),
      line: record.line,
      text: record.text?.slice(textOffset),
    };
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
