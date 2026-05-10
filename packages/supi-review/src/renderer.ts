import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Box, Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { ReviewFinding, ReviewResult } from "./types.ts";

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
  container.addChild(new Spacer(1));

  const normalizedVerdict = output.overall_correctness.toLowerCase();
  const verdictColor = normalizedVerdict.includes("incorrect")
    ? "warning"
    : normalizedVerdict.includes("correct")
      ? "success"
      : "warning";
  container.addChild(
    new Text(
      `${theme.fg(verdictColor, "●")} ${theme.fg(verdictColor, output.overall_correctness)}` +
        theme.fg("dim", `  (confidence: ${(output.overall_confidence_score * 100).toFixed(0)}%)`),
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

    if (output.findings.length === 0) {
      container.addChild(new Text(theme.fg("success", "✓ No issues found"), 1, 0));
    } else {
      container.addChild(
        new Text(theme.fg("accent", `Findings (${output.findings.length})`), 1, 0),
      );
      for (const finding of output.findings) {
        container.addChild(renderFinding(finding, theme));
      }
    }
  }

  return container;
}

function renderFinding(
  finding: ReviewFinding,
  theme: Parameters<Parameters<ExtensionAPI["registerMessageRenderer"]>[1]>[2],
): Container {
  const container = new Container();
  const priorityColor = priorityColorName(finding.priority);
  const priorityLabel = priorityText(finding.priority);

  const loc = finding.code_location;
  const locText =
    loc.absolute_file_path +
    (loc.line_range.start === loc.line_range.end
      ? `:${loc.line_range.start}`
      : `:${loc.line_range.start}-${loc.line_range.end}`);

  container.addChild(new Spacer(1));
  container.addChild(
    new Text(
      `${theme.fg(priorityColor, "●")} ${theme.fg("text", finding.title)}  ${theme.fg("dim", priorityLabel)}`,
      1,
      0,
    ),
  );
  container.addChild(new Text(theme.fg("dim", locText), 2, 0));

  if (finding.body) {
    const box = new Box(1, 0);
    box.addChild(new Text(theme.fg("text", finding.body), 0, 0));
    container.addChild(box);
  }

  return container;
}

function renderFailed(
  result: Extract<ReviewResult, { kind: "failed" }>,
  theme: Parameters<Parameters<ExtensionAPI["registerMessageRenderer"]>[1]>[2],
): Container {
  const container = new Container();
  container.addChild(new Text(theme.fg("error", "◆ Review Failed"), 1, 0));
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("error", result.reason), 1, 0));
  return container;
}

function renderTimeout(
  result: Extract<ReviewResult, { kind: "timeout" }>,
  theme: Parameters<Parameters<ExtensionAPI["registerMessageRenderer"]>[1]>[2],
): Container {
  const container = new Container();
  container.addChild(new Text(theme.fg("warning", "◆ Review Timed Out"), 1, 0));
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
    const excerpt = result.partialOutput.slice(0, 500);
    container.addChild(new Text(theme.fg("dim", excerpt), 1, 0));
  }
  return container;
}

function renderCanceled(
  _result: Extract<ReviewResult, { kind: "canceled" }>,
  theme: Parameters<Parameters<ExtensionAPI["registerMessageRenderer"]>[1]>[2],
): Container {
  const container = new Container();
  container.addChild(new Text(theme.fg("warning", "◆ Review Canceled"), 1, 0));
  return container;
}

function priorityColorName(priority: number): "success" | "warning" | "error" {
  switch (priority) {
    case 0:
      return "success";
    case 1:
      return "success";
    case 2:
      return "warning";
    case 3:
      return "error";
    default:
      return "success";
  }
}

function priorityText(priority: number): string {
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
