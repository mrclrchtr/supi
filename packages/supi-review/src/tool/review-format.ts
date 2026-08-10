import type { FindingCounts, ReviewBatchDetails, ReviewScope, ReviewTaskResult } from "../types.ts";
import { formatChildFailureDiagnostics } from "./child-failure-diagnostics.ts";
import { formatReviewUsage } from "./usage-format.ts";

function appendCapabilityWarnings(lines: string[], result: ReviewTaskResult): void {
  for (const warning of result.capabilityWarnings ?? []) {
    lines.push(`Reviewer capability warning: ${warning.message}`);
  }
}

function formatFindingCounts(counts: FindingCounts): string {
  return `Findings: ${counts.total} total · ${counts.blocking} blocking · ${counts.nonBlocking} non-blocking · impact: ${counts.byImpact.high} high, ${counts.byImpact.medium} medium, ${counts.byImpact.low} low`;
}

function formatScopeFocus(scope: ReviewScope | undefined): string {
  const count = scope?.paths?.length ?? 0;
  return count === 0
    ? "repository-wide review"
    : `path focus: ${count} ${count === 1 ? "path" : "paths"}`;
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
  const lines = [
    "",
    `## ${result.taskId}`,
    `Review Mode: ${result.mode}`,
    `Model: ${result.modelId}`,
    `Packet SHA-256: ${result.packetHash}`,
  ];
  if (result.usage) lines.push(`Usage: ${formatReviewUsage(result.usage)}`);
  if (result.audit) {
    lines.push(`Local replay: ${result.audit.artifactId} (expires ${result.audit.expiresAt})`);
  }
  appendCapabilityWarnings(lines, result);
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

/** Format complete Review Engine output for parent-facing Markdown and continuation storage. */
export function formatReviewBatch(details: ReviewBatchDetails): string {
  const receipt = details.workspaceReceipt;
  const workspaceReceipt = [
    `Workspace receipt: ${receipt.status}`,
    `from ${receipt.fromCommit ?? "none"}`,
    `to ${receipt.toCommit}`,
    receipt.includeUncommittedChanges ? "uncommitted changes included" : "committed state only",
    `${receipt.changedPathCount} changed paths`,
    receipt.observedDiffHash,
  ].join(" · ");
  const lines = [
    "# Review Finished",
    "",
    `Provenance: ${details.provenance}`,
    `Target: ${details.snapshot.title}`,
    `Focus: ${formatScopeFocus(details.scope)}`,
    workspaceReceipt,
  ];
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
  for (const result of details.results) lines.push(...formatTaskResult(result));
  return lines.join("\n");
}
