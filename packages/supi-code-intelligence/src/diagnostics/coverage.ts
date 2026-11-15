import type { HealthDiagnosticObservation } from "../session/health-types.ts";

/**
 * What a requested diagnostic observation establishes, derived only from its kind and exact
 * evidence counts. Shared by the model-facing `code_health` output and the status inspector.
 *
 * - `unavailable`: no diagnostic result could be collected.
 * - `none`: zero files were requested and no diagnostics exist, so nothing was checked.
 * - `incomplete`: some requested files are unconfirmed, failed, or removed, or collection was partial.
 *   Removed files block a clean claim even when the observation `kind` is `completed` (#371).
 * - `confirmed`: every requested file was confirmed. This never establishes project-wide validity.
 */
export type DiagnosticCoverage = "unavailable" | "none" | "incomplete" | "confirmed";

/**
 * Classify a collected observation. Stricter than the observation `kind`: removed files keep a
 * `completed` observation `incomplete`, and `partial` is never `confirmed`. Zero requested files
 * with no entries is `none`, even for a `partial` observation.
 */
export function classifyDiagnosticCoverage(
  observation: Exclude<HealthDiagnosticObservation, { kind: "not-requested" }>,
): DiagnosticCoverage {
  if (observation.kind === "unavailable") return "unavailable";
  const evidence = observation.evidence;
  if (evidence.requested === 0 && observation.entries.length === 0) return "none";
  const allConfirmed =
    evidence.confirmed === evidence.requested &&
    evidence.unconfirmed === 0 &&
    evidence.failed === 0 &&
    evidence.removed === 0;
  return observation.kind === "completed" && allConfirmed ? "confirmed" : "incomplete";
}
