// Forensics engine — scan pipeline for cross-session cache investigation.

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { getActiveBranchEntries } from "@mrclrchtr/supi-core/session";
import {
  extractCacheTurnEntries,
  extractToolCallWindows,
  findPreviousComparableTurn,
  parseSessionFile,
} from "./extract.ts";
import {
  breakdownCauses,
  correlateTools,
  detectIdleRegressions,
  findHotspots,
  limitFindings,
} from "./queries.ts";
import { type CacheTurn, resolveTurnCause } from "./turns.ts";
import {
  type CauseBreakdown,
  type ForensicsFinding,
  type ForensicsOptions,
  normalizeFindingsLimit,
} from "./types.ts";

export interface ForensicsResult {
  pattern: ForensicsOptions["pattern"];
  /** Present for hotspots, correlate, and idle patterns. */
  findings?: ForensicsFinding[];
  /** Total findings before the result limit, when the result was limited. */
  findingsTotal?: number;
  /** Maximum findings returned, when the result was limited. */
  findingsLimit?: number;
  /** Present for breakdown pattern. */
  breakdown?: CauseBreakdown;
  sessionsScanned: number;
  turnsAnalyzed: number;
}

/**
 * Run a forensics query across historical sessions.
 *
 * Pipeline:
 * 1. List all sessions via SessionManager.listAll()
 * 2. Filter by date range and maxSessions
 * 3. Parse each session file, resolve active branch
 * 4. Extract cache turns and tool windows
 * 5. Build findings (compute drops, attach tool context)
 * 6. Run the requested query pattern
 */
export async function runForensics(options: ForensicsOptions): Promise<ForensicsResult> {
  const sinceMs = parseDuration(options.since);
  const cutoff = Date.now() - sinceMs;
  const maxSessions = options.maxSessions ?? 100;
  const maxFindings = normalizeFindingsLimit(options.maxFindings);
  const idleThreshold = options.idleThresholdMinutes ?? 5;
  const regressionThreshold = options.regressionThreshold ?? 25;
  const lookback = options.lookback ?? 2;
  const minDrop = options.minDrop ?? 0;

  const allSessions = await SessionManager.listAll();
  const recentSessions = allSessions
    .filter((s) => s.modified.getTime() >= cutoff)
    .sort((a, b) => b.modified.getTime() - a.modified.getTime())
    .slice(0, maxSessions);

  let sessionsScanned = 0;
  let turnsAnalyzed = 0;
  const allFindings: ForensicsFinding[] = [];

  for (const session of recentSessions) {
    try {
      const entries = await parseSessionFile(session.path);
      const branch = getActiveBranchEntries(entries);
      const turns = extractCacheTurnEntries(branch);

      if (turns.length === 0) continue;

      sessionsScanned++;
      turnsAnalyzed += turns.length;

      const toolWindows = extractToolCallWindows(branch, lookback);
      const findings = buildFindings(session.id, turns, toolWindows, regressionThreshold);

      // Apply idle-time reclassification before adding to the pool
      detectIdleRegressions(findings, idleThreshold);

      allFindings.push(...findings);
    } catch {
      // Skip unreadable or malformed session files silently
    }
  }

  switch (options.pattern) {
    case "hotspots": {
      const findings = findHotspots(allFindings, minDrop);
      return makeFindingsResult({
        pattern: "hotspots",
        findings,
        maxFindings,
        sessionsScanned,
        turnsAnalyzed,
      });
    }
    case "breakdown": {
      const bd = breakdownCauses(allFindings);
      return {
        pattern: "breakdown",
        breakdown: bd,
        sessionsScanned,
        turnsAnalyzed,
      };
    }
    case "correlate": {
      const findings = correlateTools(allFindings);
      return makeFindingsResult({
        pattern: "correlate",
        findings,
        maxFindings,
        sessionsScanned,
        turnsAnalyzed,
      });
    }
    case "idle": {
      const findings = allFindings
        .filter((f) => f.cause.type === "idle")
        .sort((a, b) => {
          const gap = (b.idleGapMinutes ?? 0) - (a.idleGapMinutes ?? 0);
          return gap !== 0 ? gap : b.drop - a.drop;
        });
      return makeFindingsResult({
        pattern: "idle",
        findings,
        maxFindings,
        sessionsScanned,
        turnsAnalyzed,
      });
    }
    default: {
      return { pattern: options.pattern, sessionsScanned, turnsAnalyzed };
    }
  }
}

function makeFindingsResult(options: {
  pattern: ForensicsOptions["pattern"];
  findings: ForensicsFinding[];
  maxFindings: number;
  sessionsScanned: number;
  turnsAnalyzed: number;
}): ForensicsResult {
  const limitedFindings = limitFindings(options.findings, options.maxFindings);
  const wasLimited = limitedFindings.length < options.findings.length;

  return {
    pattern: options.pattern,
    findings: limitedFindings,
    sessionsScanned: options.sessionsScanned,
    turnsAnalyzed: options.turnsAnalyzed,
    ...(wasLimited
      ? { findingsTotal: options.findings.length, findingsLimit: options.maxFindings }
      : {}),
  };
}

/** Build findings from a single session's turns. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: regression detection requires multiple condition checks
export function buildFindings(
  sessionId: string,
  turns: CacheTurn[],
  toolWindows: Map<number, import("./types.ts").ToolCallShape[]>,
  regressionThreshold: number,
): ForensicsFinding[] {
  const findings: ForensicsFinding[] = [];

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const prevTurn = findPreviousComparableTurn(turns, i);

    if (turn.hitRate === undefined) continue;

    const drop = prevTurn?.hitRate !== undefined ? prevTurn.hitRate - turn.hitRate : 0;

    // Persisted-cause regressions (compaction, model_change, prompt_change) are
    // always included. Unknown-cause drops are only included when they exceed the
    // configured regression threshold.
    const resolvedCause = resolveTurnCause(turn);
    const hasPersistedCause = resolvedCause !== undefined && resolvedCause.type !== "unknown";

    if (!hasPersistedCause && drop <= regressionThreshold) {
      continue;
    }

    const gapMs = prevTurn !== undefined ? turn.timestamp - prevTurn.timestamp : 0;
    const idleGapMinutes =
      turn.idleMs !== undefined
        ? Math.round(turn.idleMs / 1000 / 60)
        : gapMs > 0
          ? Math.round(gapMs / 1000 / 60)
          : undefined;

    const toolsBefore = toolWindows.get(turn.turnIndex) ?? [];
    const { pathsInvolved, commandSummaries } = extractHumanDetail(toolsBefore);

    findings.push({
      sessionId,
      turnIndex: turn.turnIndex,
      previousRate: prevTurn?.hitRate,
      currentRate: turn.hitRate,
      drop,
      cause: resolvedCause ?? { type: "unknown" },
      toolsBefore,
      idleGapMinutes,
      ...(turn.missedTokens !== undefined ? { missedTokens: turn.missedTokens } : {}),
      ...(turn.missedCost !== undefined ? { missedCost: turn.missedCost } : {}),
      ...(turn.modelChanged ? { modelChanged: true } : {}),
      ...(pathsInvolved.length > 0 ? { _pathsInvolved: pathsInvolved } : {}),
      ...(commandSummaries.length > 0 ? { _commandSummaries: commandSummaries } : {}),
    });
  }

  return findings;
}

/**
 * Param keys on `write`/`edit` tools that are expected to hold file paths.
 *
 * Tracks PI's tool API surface. If PI changes these param names, update this
 * constant to keep `_pathsInvolved` extraction working.
 */
const PATH_PARAM_KEYS = ["file_path", "path"];

/** Extract file paths and command summaries from preceding tool calls. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: per-tool-type extraction logic
function extractHumanDetail(tools: import("./types.ts").ToolCallShape[]): {
  pathsInvolved: string[];
  commandSummaries: string[];
} {
  const pathsInvolved: string[] = [];
  const commandSummaries: string[] = [];

  for (const tool of tools) {
    if (tool.toolName === "write" || tool.toolName === "edit") {
      const pathKey = tool.paramKeys.find((k) => PATH_PARAM_KEYS.includes(k));
      if (pathKey) {
        const shape = tool.paramShapes[pathKey];
        if (shape?.kind === "string" && shape.len > 0) {
          pathsInvolved.push(`[${tool.toolName}] ${pathKey}`);
        }
      }
    }
    if (tool.toolName === "bash") {
      const shape = tool.paramShapes.command;
      if (shape?.kind === "string" && shape.len > 0) {
        commandSummaries.push(`bash(${shape.len} chars${shape.multiline ? ", multiline" : ""})`);
      }
    }
  }

  return { pathsInvolved, commandSummaries };
}

/** Parse a duration string like "7d", "24h", "30m" into milliseconds. */
export function parseDuration(dur: string): number {
  const match = dur.match(/^(\d+)([dhm])$/i);
  if (!match) {
    // Default to 7 days for unparseable input
    return 7 * 24 * 60 * 60 * 1000;
  }
  const value = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case "d":
      return value * 24 * 60 * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "m":
      return value * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}
