import type { ReviewResult } from "../types.ts";

function priorityLabel(priority: number): string {
  switch (priority) {
    case 0:
      return "info";
    case 1:
      return "minor";
    case 2:
      return "major";
    case 3:
      return "critical";
    default:
      return "info";
  }
}

/** Format review results for the LLM-visible custom message content. */
export function formatReviewContent(result: ReviewResult): string {
  switch (result.kind) {
    case "success":
      return formatSuccessContent(result);
    case "failed":
      return `Review failed: ${result.reason}`;
    case "canceled":
      return "Review canceled";
    case "timeout":
      return formatTimeoutContent(result);
  }
}

function formatTimeoutContent(result: Extract<ReviewResult, { kind: "timeout" }>): string {
  const parts = [`Review timed out (exceeded ${(result.timeoutMs / 1000).toFixed(0)}s)`];
  if (result.partialOutput) {
    parts.push("", "Partial output:", result.partialOutput);
  }
  return parts.join("\n");
}

function formatSuccessContent(result: Extract<ReviewResult, { kind: "success" }>): string {
  const { output } = result;
  const confidencePercent = Math.round(output.overall_confidence_score * 100);
  const lines: string[] = ["## Code Review Result", "", `**Model:** ${result.modelId}`];

  if (result.brief) {
    lines.push("", "### Session-derived Brief", "");
    lines.push(`**Summary:** ${result.brief.summary}`);
    lines.push(`**Intended outcome:** ${result.brief.intendedOutcome}`);
    if (result.brief.constraints.length > 0) {
      lines.push("**Constraints:**");
      lines.push(...result.brief.constraints.map((item) => `- ${item}`));
    }
    if (result.brief.focusAreas.length > 0) {
      lines.push("**Focus areas:**");
      lines.push(...result.brief.focusAreas.map((item) => `- ${item}`));
    }
    if (result.brief.riskyFiles.length > 0) {
      lines.push("**Risky files:**");
      lines.push(...result.brief.riskyFiles.map((item) => `- ${item}`));
    }
  }

  lines.push("", `Verdict: ${output.overall_correctness} (confidence: ${confidencePercent}%)`);

  if (output.findings.length > 0) {
    lines.push("", "### Findings", "", ...formatFindings(output.findings));
  }

  lines.push("", `Overall: ${output.overall_explanation}`);
  return lines.join("\n");
}

function formatFindings(
  findings: Extract<ReviewResult, { kind: "success" }>["output"]["findings"],
): string[] {
  return findings.flatMap((finding, index) => {
    const location = finding.code_location;
    const lineRange =
      location.line_range.start === location.line_range.end
        ? String(location.line_range.start)
        : `${location.line_range.start}-${location.line_range.end}`;
    return [
      `#${index + 1} [${priorityLabel(finding.priority)}] ${finding.title}`,
      `   ${location.absolute_file_path}:${lineRange}`,
      `   ${finding.body}`,
    ];
  });
}
