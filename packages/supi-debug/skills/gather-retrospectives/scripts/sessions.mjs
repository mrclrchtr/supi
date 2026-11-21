import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { canonicalPath } from "./paths.mjs";

/**
 * Shared session-storage scan for skill scripts: discovery, LF-only JSONL streaming, the
 * workspace filter on session headers, and scan coverage. Callers own entry interpretation,
 * date filtering, and deduplication.
 */

/** Parse a CLI integer within an inclusive range. */
export function integer(value, name, min, max) {
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer from ${min} through ${max}.`);
  }
  return parsed;
}

/** Parse `--since` as an ISO date/time or `Nd` days ago; returns epoch ms or null. */
export function sinceTimestamp(value) {
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

/** Scan counters shared by all session readers; callers may add their own fields. */
export function scanCoverage() {
  return {
    scannedSessions: 0,
    scopedSessions: 0,
    malformedEntries: 0,
    ignoredSymlinks: 0,
    sessionLimitReached: false,
    readFailures: 0,
    failures: [],
  };
}

/** True when the scan saw every session and entry it was asked to read. */
export function scanComplete(coverage) {
  return (
    !coverage.sessionLimitReached &&
    coverage.ignoredSymlinks === 0 &&
    coverage.readFailures === 0 &&
    coverage.malformedEntries === 0
  );
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

async function readHeader(line, path, config, coverage) {
  const session = parseEntry(line, coverage);
  if (session?.type !== "session" || typeof session.cwd !== "string" || !isAbsolute(session.cwd)) {
    recordFailure(coverage, path, "INVALID_SESSION_HEADER");
    return null;
  }
  const cwd = await canonicalPath(session.cwd);
  const workspaces = config.workspace === null ? null : [config.workspace].flat();
  if (workspaces && !workspaces.some((workspace) => within(workspace, cwd))) return null;
  coverage.scopedSessions++;
  return session;
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

async function readLines(path, config, coverage, visitor) {
  const input = createReadStream(path, { encoding: "utf8" });
  let lineNumber = 0;
  let context = null;
  try {
    for await (const line of jsonLines(input)) {
      lineNumber++;
      if (lineNumber === 1) {
        const session = await readHeader(line, path, config, coverage);
        if (!session) break;
        context = { sessionFile: path, sessionId: session.id, cwd: session.cwd };
        visitor.startSession?.(context);
      } else await visitLine(line, { ...context, line: lineNumber }, coverage, visitor);
    }
    if (lineNumber === 0) recordFailure(coverage, path, "EMPTY_SESSION");
  } catch (error) {
    recordFailure(coverage, path, error.code ?? "READ_FAILED");
  } finally {
    input.destroy();
  }
  return context;
}

async function visitLine(line, location, coverage, visitor) {
  if (!line.trim() || (visitor.accept && !visitor.accept(line))) return;
  const entry = parseEntry(line, coverage);
  if (entry !== null) await visitor.entry(entry, { ...location, raw: line });
}

async function scanSession(path, config, coverage, visitor) {
  coverage.scannedSessions++;
  const context = await readLines(path, config, coverage, visitor);
  if (context) await visitor.endSession?.(context);
}

/**
 * Stream every in-scope session under `config.sessionsDir` (at most `config.maxSessions` files,
 * filtered by `config.workspace`, a path or path array, unless null). Calls
 * `visitor.startSession(context)`, then `visitor.entry(entry, { ...context, line, raw })` for
 * each parsed entry after the header, then `visitor.endSession(context)`. Optional
 * `visitor.accept(raw)` skips lines before parsing (a cheap prefilter; skipped lines are not
 * checked for malformed JSON). Malformed lines count in
 * `coverage.malformedEntries` and are skipped. Symlinks are not followed.
 */
export async function scanSessions(config, coverage, visitor) {
  const files = await discover(config, coverage);
  for (const file of files) await scanSession(file, config, coverage, visitor);
}
