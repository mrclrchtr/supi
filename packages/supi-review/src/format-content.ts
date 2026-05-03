import type { ReviewResult } from "./types.ts";

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

export function formatReviewContent(result: ReviewResult): string {
  switch (result.kind) {
    case "success":
      return formatSuccessContent(result);
    case "failed":
      return withWarning(`Review failed: ${result.reason}`, result.warning);
    case "canceled":
      return withWarning("Review canceled", result.warning);
    case "timeout":
      return withWarning("Review timed out", result.warning);
  }
}

function withWarning(text: string, warning: string | undefined): string {
  return warning ? `${text}\n\n⚠️ ${warning}` : text;
}

function formatSuccessContent(result: Extract<ReviewResult, { kind: "success" }>): string {
  const output = result.output;
  const confidencePercent = Math.round(output.overall_confidence_score * 100);
  const lines = [
    "## Code Review Result",
    "",
    `Verdict: ${output.overall_correctness} (confidence: ${confidencePercent}%)`,
  ];

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
    const loc = finding.code_location;
    const lineRange =
      loc.line_range.start === loc.line_range.end
        ? String(loc.line_range.start)
        : `${loc.line_range.start}-${loc.line_range.end}`;
    return [
      `#${index + 1} [${priorityLabel(finding.priority)}] ${finding.title}`,
      `   ${loc.absolute_file_path}:${lineRange}`,
      `   ${finding.body}`,
    ];
  });
}
