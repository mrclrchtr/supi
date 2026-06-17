import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Box, Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { ReviewFailureDebugInfo, ReviewItem, ReviewResult } from "../types.ts";
import { formatLevel, formatLocation } from "./format-content.ts";

/** Register the custom TUI renderer for `supi-review` messages. */
export function registerReviewRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer("supi-review", (message, { expanded }, theme) => {
    const result = (message.details as { result?: ReviewResult } | undefined)?.result;
    if (!result) {
      return new Text(theme.fg("dim", "No review data"), 1, 0);
    }

    switch (result.kind) {
      case "success":
        return renderSuccess(result, theme, expanded);
      case "failed":
        return renderFailed(result, theme);
      case "canceled":
        return renderCanceled(result, theme);
      case "timeout":
        return renderTimeout(result, theme);
      default:
        return new Text(theme.fg("dim", "Unknown review state"), 1, 0);
    }
  });
}

function renderSuccess(
  result: Extract<ReviewResult, { kind: "success" }>,
  theme: Parameters<Parameters<ExtensionAPI["registerMessageRenderer"]>[1]>[2],
  expanded: boolean,
): Container {
  const container = new Container();
  const output = result.output;

  container.addChild(new Text(theme.fg("accent", "◆ Code Review Results"), 1, 0));
  container.addChild(new Text(theme.fg("muted", `Model: ${result.modelId}`), 1, 0));
  container.addChild(new Text(theme.fg("muted", `Snapshot: ${result.snapshot.title}`), 1, 0));
  container.addChild(new Spacer(1));

  if (result.brief) {
    renderBriefContext(container, result.brief, theme);
    container.addChild(new Spacer(1));
  }

  const normalizedVerdict = output.overall_correctness.toLowerCase();
  const verdictColor = normalizedVerdict.includes("issues") ? "warning" : "success";
  container.addChild(
    new Text(
      `${theme.fg(verdictColor, "●")} ${theme.fg(verdictColor, output.overall_correctness)}` +
        theme.fg("dim", `  (confidence: ${(output.overall_confidence_score * 100).toFixed(0)}%)`),
      1,
      0,
    ),
  );
  container.addChild(
    new Text(
      theme.fg(
        "dim",
        `Summary: ${output.summary.actions.mustFix} must-fix, ${output.summary.actions.shouldFix} should-fix, ${output.summary.actions.consider} consider`,
      ),
      1,
      0,
    ),
  );

  if (output.overall_explanation) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("dim", output.overall_explanation), 1, 0));
  }

  if (expanded) {
    container.addChild(new Spacer(1));

    if (output.items.length === 0) {
      container.addChild(new Text(theme.fg("success", "✓ No review items"), 1, 0));
    } else {
      container.addChild(
        new Text(theme.fg("accent", `Review Items (${output.items.length})`), 1, 0),
      );
      output.items.forEach((item, index) => {
        container.addChild(renderReviewItem(item, index, theme));
      });
    }
  }

  return container;
}

function renderBriefContext(
  container: Container,
  brief: NonNullable<Extract<ReviewResult, { kind: "success" }>["brief"]>,
  theme: Parameters<Parameters<ExtensionAPI["registerMessageRenderer"]>[1]>[2],
): void {
  container.addChild(new Text(theme.fg("muted", `Summary: ${brief.summary}`), 1, 0));
  container.addChild(new Text(theme.fg("muted", `Outcome: ${brief.intendedOutcome}`), 1, 0));
  if (brief.focusAreas.length > 0) {
    container.addChild(
      new Text(theme.fg("muted", `Focus: ${brief.focusAreas.slice(0, 3).join(", ")}`), 1, 0),
    );
  }
  if (brief.riskyFiles.length > 0) {
    container.addChild(
      new Text(theme.fg("muted", `Risky files: ${brief.riskyFiles.slice(0, 3).join(", ")}`), 1, 0),
    );
  }
}

function renderReviewItem(
  item: ReviewItem,
  index: number,
  theme: Parameters<Parameters<ExtensionAPI["registerMessageRenderer"]>[1]>[2],
): Container {
  const container = new Container();
  const actionColor = actionColorName(item.recommended_action);
  const locationText = item.code_location
    ? formatLocation(
        item.code_location.absolute_file_path,
        item.code_location.line_range.start,
        item.code_location.line_range.end,
      )
    : undefined;

  container.addChild(new Spacer(1));
  container.addChild(
    new Text(
      `${theme.fg("text", `#${index + 1} ${item.title}`)} ${theme.fg(actionColor, `[${item.recommended_action}]`)}`,
      1,
      0,
    ),
  );
  container.addChild(new Text(theme.fg("dim", `Category: ${item.category}`), 2, 0));
  container.addChild(new Text(theme.fg("dim", `Impact: ${formatLevel(item.impact)}`), 2, 0));
  container.addChild(new Text(theme.fg("dim", `Effort: ${formatLevel(item.effort)}`), 2, 0));

  if (locationText) {
    container.addChild(new Text(theme.fg("dim", locationText), 2, 0));
  }

  if (item.body) {
    const body = new Box(2, 0);
    body.addChild(new Text(theme.fg("text", item.body), 0, 0));
    container.addChild(body);
  }

  container.addChild(new Text(theme.fg("dim", `Suggested fix: ${item.suggested_fix}`), 2, 0));
  container.addChild(new Text(theme.fg("dim", `Verification: ${item.verification_hint}`), 2, 0));

  return container;
}

function renderFailed(
  result: Extract<ReviewResult, { kind: "failed" }>,
  theme: Parameters<Parameters<ExtensionAPI["registerMessageRenderer"]>[1]>[2],
): Container {
  const container = new Container();
  container.addChild(new Text(theme.fg("error", "◆ Review Failed"), 1, 0));
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("muted", `Model: ${result.modelId}`), 1, 0));
  container.addChild(new Text(theme.fg("muted", `Snapshot: ${result.snapshot.title}`), 1, 0));
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("error", result.reason), 1, 0));
  renderFailureDebug(container, result.debug, theme);
  return container;
}

function renderTimeout(
  result: Extract<ReviewResult, { kind: "timeout" }>,
  theme: Parameters<Parameters<ExtensionAPI["registerMessageRenderer"]>[1]>[2],
): Container {
  const container = new Container();
  container.addChild(new Text(theme.fg("warning", "◆ Review Timed Out"), 1, 0));
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("muted", `Model: ${result.modelId}`), 1, 0));
  container.addChild(new Text(theme.fg("muted", `Snapshot: ${result.snapshot.title}`), 1, 0));
  container.addChild(new Spacer(1));
  container.addChild(
    new Text(
      theme.fg("warning", `Reviewer exceeded the ${(result.timeoutMs / 1000).toFixed(0)}s timeout`),
      1,
      0,
    ),
  );
  if (result.partialOutput) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("dim", "Partial output:"), 1, 0));
    container.addChild(new Text(theme.fg("dim", result.partialOutput.slice(0, 500)), 1, 0));
  }
  renderFailureDebug(container, result.debug, theme);
  return container;
}

function renderCanceled(
  result: Extract<ReviewResult, { kind: "canceled" }>,
  theme: Parameters<Parameters<ExtensionAPI["registerMessageRenderer"]>[1]>[2],
): Container {
  const container = new Container();
  container.addChild(new Text(theme.fg("warning", "◆ Review Canceled"), 1, 0));
  renderFailureDebug(container, result.debug, theme);
  return container;
}

function renderFailureDebug(
  container: Container,
  debug: ReviewFailureDebugInfo | undefined,
  theme: Parameters<Parameters<ExtensionAPI["registerMessageRenderer"]>[1]>[2],
): void {
  if (!debug) return;

  const lines = [
    `Turns: ${debug.turns} · Tool uses: ${debug.toolUses}`,
    debug.tokens
      ? `Tokens: ${debug.tokens.input} in / ${debug.tokens.output} out / ${debug.tokens.total} total`
      : undefined,
    debug.recentEvents && debug.recentEvents.length > 0
      ? `Recent events: ${debug.recentEvents.join(" → ")}`
      : undefined,
    debug.lastAssistantStopReason
      ? `Last assistant stop: ${debug.lastAssistantStopReason}`
      : undefined,
    debug.lastAssistantToolCalls && debug.lastAssistantToolCalls.length > 0
      ? `Last assistant tools: ${debug.lastAssistantToolCalls.join(", ")}`
      : undefined,
    debug.lastAssistantErrorMessage
      ? `Last assistant error: ${debug.lastAssistantErrorMessage}`
      : undefined,
  ].filter((line): line is string => !!line);

  if (lines.length === 0) return;

  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("dim", "Debug:"), 1, 0));
  for (const line of lines) {
    container.addChild(new Text(theme.fg("dim", line), 1, 0));
  }
}

function actionColorName(
  action: ReviewItem["recommended_action"],
): "success" | "warning" | "error" {
  switch (action) {
    case "must-fix":
      return "error";
    case "should-fix":
      return "warning";
    case "consider":
      return "success";
    default:
      return "success";
  }
}
