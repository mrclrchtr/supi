import * as path from "node:path";
import {
  MAX_PROCESS_CRASH_RECOVERY_ENTRIES,
  type ProcessCrashRecoveryEntry,
  type ProcessCrashRecoveryNextAction,
  type ProcessCrashRecoveryOutcome,
  type ProcessCrashRecoveryReport,
} from "../session/runtime-diagnostics.ts";

/** One route result before its root is projected to a workspace-relative path. */
export interface ProcessCrashRecoveryRouteResult {
  readonly name: string;
  readonly root: string;
  readonly outcome: ProcessCrashRecoveryOutcome;
  /** The caught Error.message from a failed replacement, when available. */
  readonly failureMessage?: string;
}

/** Maximum failure detail retained in a process-crash report. */
export const MAX_PROCESS_CRASH_FAILURE_MESSAGE_LENGTH = 512;

const OUTCOME_ORDER: Record<ProcessCrashRecoveryOutcome, number> = {
  "recovery-failed": 0,
  "recovery-exhausted": 1,
  "skipped-no-retained-file": 2,
  recovered: 3,
};

/** Build the bounded, deterministic report for one process-crash demand. */
export function buildProcessCrashRecoveryReport(
  routes: readonly ProcessCrashRecoveryRouteResult[],
  cwd: string,
): ProcessCrashRecoveryReport {
  const entries = routes.map((route) => toReportEntry(route, cwd)).sort(compareEntries);
  const visibleEntries = entries.slice(0, MAX_PROCESS_CRASH_RECOVERY_ENTRIES);

  return {
    recoveredRoutes: countRoutes(routes, "recovered"),
    skippedRoutes: countRoutes(routes, "skipped-no-retained-file"),
    failedRoutes: countRoutes(routes, "recovery-failed"),
    exhaustedRoutes: countRoutes(routes, "recovery-exhausted"),
    entries: visibleEntries,
    omittedEntries: Math.max(0, entries.length - visibleEntries.length),
  };
}

/** Limit one caught Error.message without retaining other error fields. */
export function boundProcessCrashFailureMessage(message: string): string {
  if (message.length <= MAX_PROCESS_CRASH_FAILURE_MESSAGE_LENGTH) return message;
  return `${message.slice(0, MAX_PROCESS_CRASH_FAILURE_MESSAGE_LENGTH - 1)}…`;
}

function toReportEntry(
  route: ProcessCrashRecoveryRouteResult,
  cwd: string,
): ProcessCrashRecoveryEntry {
  const action = nextAction(route.outcome);
  const entry: ProcessCrashRecoveryEntry = {
    name: route.name,
    root: relativeRoot(cwd, route.root),
    outcome: route.outcome,
    ...(action ? { nextAction: action } : {}),
    ...(route.outcome === "recovery-failed" && route.failureMessage
      ? { failureMessage: boundProcessCrashFailureMessage(route.failureMessage) }
      : {}),
  };
  return entry;
}

function relativeRoot(cwd: string, root: string): string {
  return (path.relative(path.resolve(cwd), path.resolve(cwd, root)) || ".").replaceAll("\\", "/");
}

function nextAction(outcome: ProcessCrashRecoveryOutcome): ProcessCrashRecoveryNextAction | null {
  switch (outcome) {
    case "skipped-no-retained-file":
      return "use-exact-file";
    case "recovery-failed":
    case "recovery-exhausted":
      return "reload-workspace";
    case "recovered":
      return null;
  }
}

function compareEntries(
  first: ProcessCrashRecoveryEntry,
  second: ProcessCrashRecoveryEntry,
): number {
  return (
    OUTCOME_ORDER[first.outcome] - OUTCOME_ORDER[second.outcome] ||
    compareStrings(first.root, second.root) ||
    compareStrings(first.name, second.name)
  );
}

function compareStrings(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function countRoutes(
  routes: readonly ProcessCrashRecoveryRouteResult[],
  outcome: ProcessCrashRecoveryOutcome,
): number {
  return routes.filter((route) => route.outcome === outcome).length;
}
