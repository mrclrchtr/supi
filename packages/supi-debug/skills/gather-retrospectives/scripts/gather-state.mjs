import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Last-gather markers live outside session storage so collection never modifies sessions.
 * One marker per scope: session storage, workspace (null = all), and source (null = both).
 */
export function gatherStatePath(agentDir) {
  return join(agentDir, "supi", "retrospectives", "last-gather.json");
}

function scopeKey({ sessionsDir, workspace, source }) {
  return JSON.stringify([sessionsDir, workspace, source]);
}

async function readState(path) {
  try {
    const state = JSON.parse(await readFile(path, "utf8"));
    return state?.version === 1 && state.scopes && typeof state.scopes === "object"
      ? state
      : { version: 1, scopes: {} };
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return { version: 1, scopes: {} };
    throw new Error(`Cannot read last-gather state: ${path}`, { cause: error });
  }
}

/** Return the previous collection time in ms for this scope, or null when never gathered. */
export async function previousGather(path, scope) {
  const collectedAt = (await readState(path)).scopes[scopeKey(scope)]?.collectedAt;
  const parsed = typeof collectedAt === "string" ? Date.parse(collectedAt) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Resolve the start date: `--since-last` uses the previous gather of this scope (all dates when
 * none exists); otherwise `explicitSince()` parses `--since`.
 */
export async function sinceOptions(agentDir, scope, sinceLast, explicitSince) {
  const stateFile = gatherStatePath(agentDir);
  const previous = await previousGather(stateFile, scope);
  return {
    since: sinceLast ? previous : explicitSince(),
    sinceLast,
    previousGather: previous === null ? null : new Date(previous).toISOString(),
    stateFile,
  };
}

/**
 * Return why the marker must not advance, or null when it may. Recording requires no
 * `--no-record` and a snapshot without a gap after the previous gather: a complete scan without
 * read failures, no commit filter, and a start date absent or not later than that gather.
 */
export function recordSkipReason(config, coverage) {
  if (config.noRecord) return "no-record";
  if (coverage.sessionLimitReached || coverage.readFailures > 0) return "incomplete-scan";
  if (config.sinceCommit) return "since-commit";
  if (config.since === null) return null;
  if (config.previousGather === null) return "since-without-previous-gather";
  return config.since <= Date.parse(config.previousGather) ? null : "since-after-previous-gather";
}

/** Record `collectedAt` (collection start) for this scope; replaces the file atomically. */
export async function recordGather(path, scope, collectedAt) {
  const state = await readState(path);
  state.scopes[scopeKey(scope)] = {
    sessionsDir: scope.sessionsDir,
    workspace: scope.workspace,
    source: scope.source,
    collectedAt: new Date(collectedAt).toISOString(),
  };
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}
