import type { AgentRunDiagnosticErrorRow } from "@mrclrchtr/supi-agent-runtime/api";
import {
  formatAgentRunDiagnostics,
  getAgentRunDiagnosticErrorRows,
} from "@mrclrchtr/supi-agent-runtime/api";
import type { ChildFailureCode, ChildFailureDiagnostics, ChildStage } from "../../types.ts";

/** Generate static parent-facing copy for a review-owned failure code. */
export function formatChildFailureCopy(stage: ChildStage, code: ChildFailureCode): string {
  const label = stage === "planner" ? "Planner" : "Reviewer";
  switch (code) {
    case "session-creation-failed":
      return `${label} session could not be created.`;
    case "prompt-rejected":
      return `${label} prompt was rejected before it ran.`;
    case "missing-structured-output":
      return `${label} ended without the required structured output.`;
    case "unexpected-runner-failure":
      return `${label} ended unexpectedly.`;
  }
}

/** Runtime diagnostic row retained under review's existing helper name. */
export type ChildDiagnosticErrorRow = AgentRunDiagnosticErrorRow;

/** Return bounded provider error rows shared by review text and TUI output. */
export function getChildDiagnosticErrorRows(
  diagnostics: ChildFailureDiagnostics,
): ChildDiagnosticErrorRow[] {
  return getAgentRunDiagnosticErrorRows(diagnostics);
}

/** Format runtime-owned diagnostics with review-compatible lifecycle labels. */
export function formatChildFailureDiagnostics(diagnostics: ChildFailureDiagnostics): string[] {
  return formatAgentRunDiagnostics(diagnostics).map((line) =>
    line.replace("Agent Run Lifecycle Trace", "Child Lifecycle Trace"),
  );
}
