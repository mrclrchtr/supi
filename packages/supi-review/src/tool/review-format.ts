import type {
  EffectiveFindingScope,
  FindingCounts,
  ReviewBatchDetails,
  ReviewTaskResult,
} from "../types.ts";
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

function formatTaskResult(result: ReviewTaskResult, findingScope: EffectiveFindingScope): string[] {
  const lines = [
    "",
    `## ${result.taskId}`,
    `Finding Scope: ${findingScope}`,
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
  if (result.criteriaCoverage?.status === "incomplete") {
    lines.push(
      `Criteria coverage: incomplete — ${result.criteriaCoverage.reason ?? "unspecified"}`,
    );
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
  const currentState = details.snapshot.target.kind === "current-state";
  const workspaceReceipt = currentState
    ? `Workspace receipt: ${details.workspaceReceipt.status} · current-state · frozen filesystem verified`
    : `Workspace receipt: ${details.workspaceReceipt.status} · ${details.workspaceReceipt.targetKind} · ${details.workspaceReceipt.changedPathCount} changed paths · ${details.workspaceReceipt.observedDiffHash}`;
  const lines = [
    "# Review Finished",
    "",
    `Mode: ${details.mode}`,
    `Provenance: ${details.provenance}`,
    `Target: ${details.snapshot.title}`,
    workspaceReceipt,
  ];
  if (details.planning) {
    lines.push(
      `Planner: ${details.planning.modelId} (protocol ${details.planning.promptVersion})`,
      `Planner decision: ${details.planning.decision}`,
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
  const findingScopes = new Map<string, EffectiveFindingScope>(
    details.review.tasks.map((task) => [
      task.id,
      currentState ? "criteria-only" : (task.findingScope ?? "change-only"),
    ]),
  );
  for (const result of details.results) {
    lines.push(...formatTaskResult(result, findingScopes.get(result.taskId) ?? "change-only"));
  }
  return lines.join("\n");
}
