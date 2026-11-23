import type {
  FindingCounts,
  ReviewBatchDetails,
  ReviewScope,
  ReviewTaskResult,
} from "../../types.ts";
import { formatReviewUsage } from "../usage-format.ts";
import { formatChildFailureDiagnostics } from "./child-failures.ts";

function appendCapabilityWarnings(lines: string[], result: ReviewTaskResult): void {
  for (const warning of result.capabilityWarnings ?? []) {
    lines.push(`Reviewer capability warning: ${warning.message}`);
  }
}

function formatFindingCounts(counts: FindingCounts): string {
  return `Findings: ${counts.total} total · ${counts.blocking} blocking · ${counts.nonBlocking} non-blocking · impact: ${counts.byImpact.high} high, ${counts.byImpact.medium} medium, ${counts.byImpact.low} low`;
}

function formatScopeFocus(scope: ReviewScope | undefined): string {
  const paths = scope?.paths;
  return paths?.length
    ? `path focus\n${paths.map((path) => `- ${JSON.stringify(path)}`).join("\n")}`
    : "repository-wide review";
}

/**
 * Parent-facing warning for a before commit that is not an ancestor of the after commit. The
 * caller chose `from`, so it is the one that can correct a wrong base.
 */
export function formatTargetDivergence(
  snapshot: ReviewBatchDetails["snapshot"],
): string | undefined {
  const divergence = snapshot.divergedFrom;
  if (!divergence) return undefined;
  const from = snapshot.target.fromCommit;
  return divergence.mergeBase
    ? `from ${from} is not an ancestor of the reviewed state (merge base ${divergence.mergeBase}). The reviewed change also reverses the commits only from contains; pass the merge base as from to review only this side's own changes.`
    : `from ${from} has no merge base with the reviewed state; the reviewed change compares unrelated histories.`;
}

function appendSubmissionRecovery(lines: string[], result: ReviewTaskResult): void {
  const recovery = result.submissionRecovery;
  if (!recovery) return;
  lines.push(`Submission recovery: ${recovery.status}`);
  for (const attempt of recovery.attempts) {
    lines.push(
      `- ${attempt.modelId}: ${attempt.outcome}${attempt.usage ? ` (${formatReviewUsage(attempt.usage)})` : ""}`,
    );
  }
  if (recovery.declineReason) lines.push(`Recovery decline: ${recovery.declineReason}`);
}

function appendTaskStatus(
  lines: string[],
  result: ReviewTaskResult & { status: "failed" | "canceled" | "timeout" },
): void {
  lines.push(
    result.status === "failed"
      ? `Status: failed (${result.failureCode})`
      : result.status === "timeout"
        ? `Status: timeout (${result.timeoutMs} ms)`
        : "Status: canceled",
  );
  if (result.diagnostics) lines.push("", ...formatChildFailureDiagnostics(result.diagnostics));
}

function formatTaskResult(result: ReviewTaskResult): string[] {
  const lines = ["", `## ${result.taskId}`, `Review Mode: ${result.mode}`];
  if (result.audit) {
    lines.push(`Local replay: ${result.audit.artifactId} (expires ${result.audit.expiresAt})`);
  }
  appendCapabilityWarnings(lines, result);
  appendSubmissionRecovery(lines, result);
  if (result.status !== "completed") {
    appendTaskStatus(lines, result);
    return lines;
  }

  lines.push(`Verdict: ${result.verdict.toUpperCase()}`, formatFindingCounts(result.findingCounts));
  if (result.criteriaCoverage.status === "incomplete") {
    lines.push(`Criteria coverage: incomplete — ${result.criteriaCoverage.reason}`);
  }
  lines.push("", result.summary);
  for (const finding of result.findings) {
    lines.push(
      "",
      `- ${finding.title} [${finding.blocksAcceptance ? "blocking" : "non-blocking"}; impact ${finding.impact}; effort ${finding.effort}; confidence ${finding.confidence}]`,
      ...(finding.location
        ? [
            `  Location: ${finding.location.path}:${finding.location.startLine}-${finding.location.endLine}`,
          ]
        : []),
      `  ${finding.description}`,
    );
  }
  return lines;
}

/** One-line Review Workspace Receipt: the exact frozen state the Reviewers inspected. */
export function formatWorkspaceReceipt(receipt: ReviewBatchDetails["workspaceReceipt"]): string {
  return [
    `Workspace receipt: ${receipt.status}`,
    `from ${receipt.fromCommit ?? "none"}`,
    `to ${receipt.toCommit}`,
    receipt.includeUncommittedChanges ? "uncommitted changes included" : "committed state only",
    `${receipt.changedPathCount} changed paths`,
    receipt.observedDiffHash,
  ].join(" · ");
}

/** Presentation options for one formatted Review report. */
export interface ReviewBatchFormatOptions {
  /** Line placed under the receipt, such as the reviewed-state note of a Background Review. */
  readonly reviewedStateNote?: string;
  /**
   * Format a Review whose tasks are not all terminal: the heading says so, and each task without a
   * result appears in task order with `Status: running`.
   */
  readonly running?: boolean;
}

function formatTaskSections(details: ReviewBatchDetails, running: boolean): string[] {
  if (!running) return details.results.flatMap(formatTaskResult);
  return details.review.tasks.flatMap((task) => {
    const result = details.results.find((candidate) => candidate.taskId === task.id);
    return result
      ? formatTaskResult(result)
      : ["", `## ${task.id}`, `Review Mode: ${task.mode}`, "Status: running"];
  });
}

/** Format complete Review Engine output for parent-facing Markdown and continuation storage. */
export function formatReviewBatch(
  details: ReviewBatchDetails,
  options: ReviewBatchFormatOptions = {},
): string {
  const lines = [
    options.running ? "# Review Still Running" : "# Review Finished",
    "",
    `Provenance: ${details.provenance}`,
    `Target: ${details.snapshot.title}`,
    `Focus: ${formatScopeFocus(details.scope)}`,
    formatWorkspaceReceipt(details.workspaceReceipt),
  ];
  if (options.reviewedStateNote) lines.push(options.reviewedStateNote);
  const divergence = formatTargetDivergence(details.snapshot);
  if (divergence) lines.push(`Target warning: ${divergence}`);
  if (details.planning) {
    lines.push(
      `Planner: ${details.planning.modelId} (protocol ${details.planning.promptVersion})`,
      ...(details.planning.usage
        ? [`Planner usage: ${formatReviewUsage(details.planning.usage)}`]
        : []),
    );
  }
  if (details.cleanupWarning) {
    lines.push(
      "",
      `Review Workspace cleanup warning: ${details.cleanupWarning.message}`,
      `Workspace: ${details.cleanupWarning.workspacePath}`,
      `Recovery: ${details.cleanupWarning.recoveryCommand}`,
    );
  }
  lines.push(...formatTaskSections(details, options.running ?? false));
  return lines.join("\n");
}
