import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { ContextAnalysis } from "../analysis.ts";
import { healthColor, pct } from "../format-helpers.ts";
import { ContextReportComponent } from "../report-component.ts";
import { formatTokens, pluralize } from "../utils.ts";

export interface ContextToolDetails {
  analysis: ContextAnalysis;
}

interface ContextToolResult {
  content: Array<{ type: string; text?: string }>;
  details?: unknown;
  isError?: boolean;
}

interface ResultOptions {
  expanded: boolean;
  isPartial: boolean;
}

export function renderContextToolCall(_args: unknown, theme: Theme): Text {
  const content = `${theme.fg("toolTitle", "supi_context")} ${theme.fg("muted", "current session")}`;
  return new Text(content, 0, 0);
}

export function renderContextToolResult(
  result: ContextToolResult | undefined,
  options: ResultOptions,
  theme: Theme,
): Text | ContextReportComponent {
  if (options.isPartial) {
    return new Text(theme.fg("warning", "Analyzing context…"), 0, 0);
  }

  if (result?.isError) {
    return new Text(theme.fg("error", "supi_context failed"), 0, 0);
  }

  const analysis = extractAnalysis(result?.details);
  if (!analysis) {
    return new Text(theme.fg("dim", "No context analysis data"), 0, 0);
  }

  if (options.expanded) {
    return new ContextReportComponent(analysis, theme);
  }

  return new Text(formatCollapsedSummary(analysis, theme), 0, 0);
}

function extractAnalysis(details: unknown): ContextAnalysis | undefined {
  if (!details || typeof details !== "object" || !("analysis" in details)) {
    return undefined;
  }
  return (details as ContextToolDetails).analysis;
}

function formatCollapsedSummary(analysis: ContextAnalysis, theme: Theme): string {
  const used = analysis.totalTokens ?? 0;
  const usage =
    analysis.contextWindow > 0
      ? `${formatTokens(used)} / ${formatTokens(analysis.contextWindow)} (${pct(used, analysis.contextWindow)})`
      : `${formatTokens(used)} tokens`;
  const dot = theme.fg("dim", "·");
  const parts = [
    `${theme.fg(healthColor(analysis), "●")} ${theme.fg("dim", "usage")} ${theme.fg("text", theme.bold(usage))}`,
  ];

  if (analysis.contextWindow > 0) {
    parts.push(
      `${theme.fg("dim", "free")} ${theme.fg("muted", formatTokens(analysis.categories.freeSpace))}`,
    );
  }

  if (analysis.compaction) {
    parts.push(
      `${theme.fg("dim", "compacted")} ${theme.fg("muted", pluralize(analysis.compaction.summarizedTurns, "turn", "turns"))}`,
    );
  }

  parts.push(`${theme.fg("dim", "model")} ${theme.fg("muted", analysis.modelName)}`);

  if (!analysis.approximationNote) {
    return parts.join(` ${dot} `);
  }

  return `${parts.join(` ${dot} `)}\n${theme.fg("warning", analysis.approximationNote)}`;
}
