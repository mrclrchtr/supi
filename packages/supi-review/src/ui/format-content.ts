import type { ReviewItem, ReviewResult } from "../types.ts";

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
  lines.push(
    `Summary: ${output.summary.actions.mustFix} must-fix, ${output.summary.actions.shouldFix} should-fix, ${output.summary.actions.consider} consider`,
  );

  if (output.items.length > 0) {
    lines.push("", "### Review Items", "", ...formatReviewItems(output.items));
  }

  lines.push("", `Overall: ${output.overall_explanation}`);
  return lines.join("\n");
}

function formatReviewItems(items: ReviewItem[]): string[] {
  return items.flatMap((item, index) => {
    const location = item.code_location
      ? `   ${formatLocation(item.code_location.absolute_file_path, item.code_location.line_range.start, item.code_location.line_range.end)}`
      : undefined;

    const lines = [
      `#${index + 1} [${item.recommended_action}][${item.category}] ${item.title}`,
      `   Impact / effort: ${item.impact} / ${item.effort}`,
    ];

    if (location) {
      lines.push(location);
    }

    lines.push(`   ${item.body}`);
    lines.push(`   Suggested fix: ${item.suggested_fix}`);
    lines.push(`   Verification: ${item.verification_hint}`);
    return lines;
  });
}

function formatLocation(file: string, startLine: number, endLine: number): string {
  const lineRange = startLine === endLine ? String(startLine) : `${startLine}-${endLine}`;
  return `${file}:${lineRange}`;
}
