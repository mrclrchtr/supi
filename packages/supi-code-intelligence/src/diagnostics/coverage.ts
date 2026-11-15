import type { DiagnosticEvidenceSummary } from "@mrclrchtr/supi-lsp/api";
import type { HealthDiagnosticObservation } from "../session/health-types.ts";

/**
 * The single rule for complete diagnostic evidence: every requested file is confirmed. Unconfirmed,
 * failed, and removed files all block completeness. A removed file blocks it because files that
 * imported it may not have been re-checked yet (#371, #602).
 *
 * Collection uses it to choose a `completed` or `partial` observation, and
 * {@link classifyDiagnosticCoverage} uses it for `confirmed`, so a `completed` observation is always
 * `confirmed` or `none` coverage, never `incomplete`.
 */
export function allRequestedFilesConfirmed(
  evidence: Omit<DiagnosticEvidenceSummary, "documents">,
): boolean {
  return (
    evidence.confirmed === evidence.requested &&
    evidence.unconfirmed === 0 &&
    evidence.failed === 0 &&
    evidence.removed === 0
  );
}

/**
 * What a requested diagnostic observation establishes, derived only from its kind and exact
 * evidence counts. Shared by the model-facing `code_health` output and the status inspector.
 *
 * - `unavailable`: no diagnostic result could be collected.
 * - `none`: zero files were requested and no diagnostics exist, so nothing was checked.
 * - `incomplete`: some requested files are unconfirmed, failed, or removed, or collection was partial.
 * - `confirmed`: every requested file was confirmed. This never establishes project-wide validity.
 */
export type DiagnosticCoverage = "unavailable" | "none" | "incomplete" | "confirmed";

/**
 * Classify a collected observation. `partial` is never `confirmed`. Zero requested files with no
 * entries is `none`, even for a `partial` observation. Uses the same completeness rule as
 * collection ({@link allRequestedFilesConfirmed}), so `completed` never classifies as `incomplete`.
 */
export function classifyDiagnosticCoverage(
  observation: Exclude<HealthDiagnosticObservation, { kind: "not-requested" }>,
): DiagnosticCoverage {
  if (observation.kind === "unavailable") return "unavailable";
  const evidence = observation.evidence;
  if (evidence.requested === 0 && observation.entries.length === 0) return "none";
  return observation.kind === "completed" && allRequestedFilesConfirmed(evidence)
    ? "confirmed"
    : "incomplete";
}
