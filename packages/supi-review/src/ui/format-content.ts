import type { ReviewFailureDebugInfo, ReviewItem, ReviewResult } from "../types.ts";

/** Format review results for the LLM-visible custom message content. */
export function formatReviewContent(result: ReviewResult): string {
  switch (result.kind) {
    case "success":
      return formatSuccessContent(result);
    case "failed":
      return formatFailureContent(result);
    case "canceled":
      return formatCanceledContent(result);
    case "timeout":
      return formatTimeoutContent(result);
  }
}

function formatFailureContent(result: Extract<ReviewResult, { kind: "failed" }>): string {
  const parts = [`Review failed: ${result.reason}`];
  appendDebugContent(parts, result.debug);
  return parts.join("\n");
}

function formatCanceledContent(result: Extract<ReviewResult, { kind: "canceled" }>): string {
  const parts = ["Review canceled"];
  appendDebugContent(parts, result.debug);
  return parts.join("\n");
}

function formatTimeoutContent(result: Extract<ReviewResult, { kind: "timeout" }>): string {
  const parts = [`Review timed out (exceeded ${(result.timeoutMs / 1000).toFixed(0)}s)`];
  if (result.partialOutput) {
    parts.push("", "Partial output:", result.partialOutput);
  }
  appendDebugContent(parts, result.debug);
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

function appendDebugContent(parts: string[], debug: ReviewFailureDebugInfo | undefined): void {
  if (!debug) return;

  const lines = [
    `- Turns: ${debug.turns}`,
    `- Tool uses: ${debug.toolUses}`,
    debug.activities && debug.activities.length > 0
      ? `- Active: ${debug.activities.join(", ")}`
      : undefined,
    debug.tokens
      ? `- Tokens: ${debug.tokens.input} in / ${debug.tokens.output} out / ${debug.tokens.total} total`
      : undefined,
    debug.recentEvents && debug.recentEvents.length > 0
      ? `- Recent events: ${debug.recentEvents.join(" → ")}`
      : undefined,
    debug.lastAssistantStopReason
      ? `- Last assistant stop: ${debug.lastAssistantStopReason}`
      : undefined,
    debug.lastAssistantToolCalls && debug.lastAssistantToolCalls.length > 0
      ? `- Last assistant tools: ${debug.lastAssistantToolCalls.join(", ")}`
      : undefined,
    debug.lastAssistantErrorMessage
      ? `- Last assistant error: ${debug.lastAssistantErrorMessage}`
      : undefined,
  ].filter((line): line is string => !!line);

  if (lines.length === 0) return;

  parts.push("", "Debug:", ...lines);
}

function formatReviewItems(items: ReviewItem[]): string[] {
  return items.flatMap((item, index) => {
    const location = item.code_location
      ? `      ${formatLocation(item.code_location.absolute_file_path, item.code_location.line_range.start, item.code_location.line_range.end)}`
      : undefined;

    const lines = [
      `   #${index + 1} ${item.title} [${item.recommended_action}]`,
      `      Category: ${item.category}`,
      `      Impact: ${formatLevel(item.impact)}`,
      `      Effort: ${formatLevel(item.effort)}`,
    ];

    if (location) {
      lines.push(location);
    }

    lines.push(`      ${item.body}`);
    lines.push(`      Suggested fix: ${item.suggested_fix}`);
    lines.push(`      Verification: ${item.verification_hint}`);
    return lines;
  });
}

function formatLevel(value: ReviewItem["impact"] | ReviewItem["effort"]): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

function formatLocation(file: string, startLine: number, endLine: number): string {
  const lineRange = startLine === endLine ? String(startLine) : `${startLine}-${endLine}`;
  return `${file}:${lineRange}`;
}
