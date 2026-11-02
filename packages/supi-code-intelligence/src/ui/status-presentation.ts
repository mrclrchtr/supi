import { resolve } from "node:path";
import type { DiagnosticEvidenceSummary } from "@mrclrchtr/supi-lsp/api";
import type {
  HealthDiagnosticObservation,
  HealthWorkflowOutcome,
} from "../session/health-types.ts";
import {
  formatProcessCrashRecovery,
  formatSourceTracking,
  formatStartupRetry,
} from "../tool/code_health/refresh-outcome.ts";

/** Inspector-only wording derived from existing diagnostic evidence, not cache freshness. */
export function presentDiagnosticEvidence(observation: HealthDiagnosticObservation): {
  counts?: string;
  summary: string;
  tone: "dim" | "warning" | "success";
} {
  if (observation.kind === "not-requested")
    return { summary: "Diagnostics not requested.", tone: "dim" };
  const evidence = observation.evidence;
  const counts = `${evidence.confirmed}/${evidence.requested} confirmed tracked files · ${evidence.unconfirmed} unconfirmed · ${evidence.failed} failed · ${evidence.removed} removed`;
  if (observation.kind === "unavailable")
    return { counts, summary: `Diagnostics unavailable — ${observation.reason}`, tone: "warning" };
  if (evidence.requested === 0)
    return { counts, summary: "No tracked diagnostic evidence.", tone: "dim" };
  const confirmed =
    evidence.confirmed === evidence.requested &&
    evidence.unconfirmed === 0 &&
    evidence.failed === 0 &&
    evidence.removed === 0;
  if (!confirmed)
    return {
      counts,
      summary: `Diagnostic evidence is incomplete${observation.kind === "partial" ? ` — ${observation.reason}` : "."}`,
      tone: "warning",
    };
  const problems = observation.entries.some((entry) => entry.errors > 0 || entry.warnings > 0);
  const files = `${evidence.confirmed} confirmed tracked file${evidence.confirmed === 1 ? "" : "s"}`;
  return {
    counts,
    summary: problems ? `Errors or warnings reported in ${files}.` : `✓ no issues in ${files}`,
    tone: problems ? "warning" : "success",
  };
}

/** Select only the expanded file's evidence from the same snapshot as its messages. */
export function presentDiagnosticDetails(
  evidence: DiagnosticEvidenceSummary,
  cwd: string,
  file: string,
): string {
  const document = evidence.documents.find(
    (entry) => resolve(cwd, entry.file) === resolve(cwd, file),
  );
  return document?.status ?? "unconfirmed — no file-specific confirmation evidence";
}

/** A failed collection retains action facts separately from the previous coherent evidence view. */
export class CiHealthRefreshError extends Error {
  readonly healthRefresh: readonly string[] | undefined;

  constructor(
    stage: string,
    options: { cause: unknown; elapsedMs: number; healthRefresh?: readonly string[] },
  ) {
    const reason = options.cause instanceof Error ? options.cause.message : String(options.cause);
    const elapsed = (Math.max(0, options.elapsedMs) / 1_000).toFixed(1);
    super(`${stage}: ${reason} (${elapsed}s elapsed; previous view retained)`, options);
    this.healthRefresh = options.healthRefresh;
  }
}

/** Present this interaction's action outcome without retaining its diagnostic evidence or history. */
export function presentHealthRefresh(outcome: HealthWorkflowOutcome, elapsedMs: number): string[] {
  const elapsed = `${(Math.max(0, elapsedMs) / 1_000).toFixed(1)}s`;
  const prefix = "Refresh health";
  if (outcome.kind !== "completed")
    return [
      `${prefix}: ${outcome.kind === "unavailable" ? "unavailable" : "failed"} (${elapsed}) — ${outcome.kind === "unavailable" ? outcome.reason : outcome.message}`,
    ];
  const attempt = outcome.data.refresh;
  const status =
    attempt.kind === "completed"
      ? "completed"
      : attempt.kind === "failed"
        ? "failed"
        : "unavailable";
  return [
    `${prefix}: ${status} (${elapsed})${"reason" in attempt ? ` — ${attempt.reason}` : ""}`,
    "Action completion is not diagnostic confirmation.",
    ...(attempt.kind === "completed" || attempt.kind === "failed"
      ? [
          formatProcessCrashRecovery(attempt.processCrashRecovery),
          formatStartupRetry(attempt.startupRetry),
          attempt.restartedClients
            ? `${attempt.restartedClients} diagnostic recovery client(s) restarted`
            : null,
          formatSourceTracking(attempt.sourceTracking),
        ].filter((line): line is string => line !== null)
      : []),
  ];
}
