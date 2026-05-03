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
    case "success": {
      const output = result.output;
      const confidencePercent = Math.round(output.overall_confidence_score * 100);
      const lines = [
        "## Code Review Result",
        "",
        `Verdict: ${output.overall_correctness} (confidence: ${confidencePercent}%)`,
      ];

      if (output.findings.length > 0) {
        lines.push("", "### Findings", "");
        for (let i = 0; i < output.findings.length; i++) {
          const f = output.findings[i];
          const loc = f.code_location;
          const lineRange =
            loc.line_range.start === loc.line_range.end
              ? String(loc.line_range.start)
              : `${loc.line_range.start}-${loc.line_range.end}`;
          lines.push(
            `#${i + 1} [${priorityLabel(f.priority)}] ${f.title}`,
            `   ${loc.absolute_file_path}:${lineRange}`,
            `   ${f.body}`,
          );
        }
      }

      lines.push("", `Overall: ${output.overall_explanation}`);
      return lines.join("\n");
    }
    case "failed":
      return `Review failed: ${result.reason}`;
    case "canceled":
      return "Review canceled";
    case "timeout":
      return "Review timed out";
  }
}
