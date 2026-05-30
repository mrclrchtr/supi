import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { formatSectionHeader, wrapReportText } from "@mrclrchtr/supi-core/report";
import type { ContextAnalysis } from "./analysis.ts";
import {
  allocateBlocks,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  healthColor,
  padLeft,
  padRight,
  pct,
  sum,
} from "./format-helpers.ts";
import { formatTokens } from "./utils.ts";

export function renderSummary(analysis: ContextAnalysis, theme: Theme, width: number): string[] {
  const used = analysis.totalTokens ?? 0;
  const health = theme.fg(healthColor(analysis), "●");
  const usage =
    analysis.contextWindow > 0
      ? `${formatTokens(used)} / ${formatTokens(analysis.contextWindow)} tokens (${pct(used, analysis.contextWindow)})`
      : `${formatTokens(used)} tokens`;

  const lines = [
    truncateToWidth(
      `${health} ${theme.fg("text", analysis.modelName)}${theme.fg("dim", `  ·  ${usage}`)}`,
      width,
    ),
  ];

  if (analysis.approximationNote) {
    lines.push(...wrapReportText(theme.fg("warning", analysis.approximationNote), width));
  }

  return lines;
}

export function renderUsageBar(analysis: ContextAnalysis, theme: Theme, width: number): string[] {
  if (analysis.contextWindow <= 0) {
    return [theme.fg("dim", "No model selected — usage bar unavailable")];
  }

  const percentLabel = pct(analysis.totalTokens ?? 0, analysis.contextWindow);
  const barWidth = Math.max(12, Math.min(48, width - visibleWidth(percentLabel) - 3));
  const values = [
    ...CATEGORY_ORDER.map((key) => analysis.categories[key]),
    analysis.categories.autocompactBuffer,
    analysis.categories.freeSpace,
  ];
  const counts = allocateBlocks(values, barWidth);

  const segments = [
    ...CATEGORY_ORDER.map((key, index) => ({
      color: CATEGORY_COLORS[key],
      block: "█",
      count: counts[index] ?? 0,
    })),
    {
      color: "warning" as const,
      block: "▒",
      count: counts[CATEGORY_ORDER.length] ?? 0,
    },
    {
      color: "dim" as const,
      block: "░",
      count: counts[CATEGORY_ORDER.length + 1] ?? 0,
    },
  ];

  const bar = segments
    .map((segment) =>
      segment.count > 0 ? theme.fg(segment.color, segment.block.repeat(segment.count)) : "",
    )
    .join("");

  const barLine = truncateToWidth(
    `${theme.fg("dim", "[")}${bar}${theme.fg("dim", "]")} ${theme.fg("text", percentLabel)}`,
    width,
  );

  const legendParts: string[] = [];
  for (const key of CATEGORY_ORDER) {
    if (analysis.categories[key] <= 0) continue;
    legendParts.push(`${theme.fg(CATEGORY_COLORS[key], "●")} ${CATEGORY_LABELS[key]}`);
  }
  if (analysis.categories.autocompactBuffer > 0) {
    legendParts.push(`${theme.fg("warning", "▒")} Autocompact buffer`);
  }
  if (analysis.categories.freeSpace > 0) {
    legendParts.push(`${theme.fg("dim", "░")} Free space`);
  }

  return [barLine, ...wrapReportText(legendParts.join(theme.fg("dim", "  •  ")), width)];
}

export function renderCategoryBreakdown(
  analysis: ContextAnalysis,
  theme: Theme,
  width: number,
): string[] {
  const lines: string[] = [];
  lines.push(formatSectionHeader("Usage by category", null, theme, width));

  const rows: Array<{
    label: string;
    color: Parameters<Theme["fg"]>[0];
    tokens: number;
  }> = [
    ...CATEGORY_ORDER.map((key) => ({
      label: CATEGORY_LABELS[key],
      color: CATEGORY_COLORS[key],
      tokens: analysis.categories[key],
    })),
    {
      label: "Autocompact buffer",
      color: "warning",
      tokens: analysis.categories.autocompactBuffer,
    },
    {
      label: "Free space",
      color: "dim",
      tokens: analysis.categories.freeSpace,
    },
  ];

  const labelWidth = Math.max(18, Math.min(22, width - 22));
  for (const row of rows) {
    if (row.tokens <= 0 && row.label !== "Free space") continue;
    const bullet = theme.fg(row.color, "●");
    const label = padRight(row.label, labelWidth);
    const tokens = padLeft(formatTokens(row.tokens), 8);
    const percentage = padLeft(pct(row.tokens, analysis.contextWindow), 7);
    lines.push(truncateToWidth(`  ${bullet} ${label} ${tokens} ${percentage}`, width));
  }

  return lines;
}

function renderCompositionGuidelineSubRows(
  sources: Array<{ source: string; tokens: number }>,
  opts: { subLabelWidth: number; total: number; theme: Theme; width: number },
): string[] {
  const lines: string[] = [];

  for (const item of sources) {
    const label =
      item.source === "default" ? "default" : item.source === "other" ? "extensions" : item.source;
    lines.push(
      truncateToWidth(
        `    ${opts.theme.fg("dim", padRight(label, opts.subLabelWidth))} ${padLeft(formatTokens(item.tokens), 8)} ${padLeft(pct(item.tokens, opts.total), 7)}`,
        opts.width,
      ),
    );
  }
  return lines;
}

function renderCompositionSnippetSubRows(
  details: Array<{ name: string; tokens: number }>,
  subLabelWidth: number,
  theme: Theme,
  width: number,
): string[] {
  const lines: string[] = [];
  for (const item of details) {
    lines.push(
      truncateToWidth(
        `    ${theme.fg("dim", padRight(item.name, subLabelWidth))} ${padLeft(formatTokens(item.tokens), 8)}`,
        width,
      ),
    );
  }
  return lines;
}

export function renderSystemPromptComposition(
  analysis: ContextAnalysis,
  theme: Theme,
  width: number,
): string[] {
  const breakdown = analysis.systemPromptBreakdown;
  const instructionFileTokens = sum(breakdown.instructionFiles.map((f) => f.tokens));
  const contextFileTokens = sum(breakdown.contextFiles.map((f) => f.tokens));
  const skillTokens = sum(breakdown.skills.map((s) => s.tokens));

  // Use sum of all breakdown components as the denominator so percentages
  // stay internally consistent even when the system prompt token count has
  // been scaled to actual model usage.
  const total =
    breakdown.base +
    instructionFileTokens +
    contextFileTokens +
    skillTokens +
    breakdown.guidelines +
    breakdown.toolSnippets +
    breakdown.appendText;

  const lines: string[] = [];
  lines.push(
    formatSectionHeader(
      "System prompt composition",
      total > 0 ? `${formatTokens(total)} tokens` : null,
      theme,
      width,
    ),
  );

  const labelWidth = Math.max(18, Math.min(22, width - 22));
  const subLabelWidth = labelWidth;

  const rows = [
    { label: "Base", color: "accent" as const, tokens: breakdown.base },
    { label: "Instruction files", color: "text" as const, tokens: instructionFileTokens },
    { label: "Context files", color: "text" as const, tokens: contextFileTokens },
    { label: "Skills", color: "text" as const, tokens: skillTokens },
    { label: "Guidelines", color: "text" as const, tokens: breakdown.guidelines },
    { label: "Tool snippets", color: "text" as const, tokens: breakdown.toolSnippets },
    { label: "Append text", color: "text" as const, tokens: breakdown.appendText },
  ];

  for (const row of rows) {
    if (row.tokens <= 0) continue;
    const bullet = theme.fg(row.color, "●");
    const label = padRight(row.label, labelWidth);
    const tokens = padLeft(formatTokens(row.tokens), 8);
    const percentage = padLeft(pct(row.tokens, total), 7);
    lines.push(truncateToWidth(`  ${bullet} ${label} ${tokens} ${percentage}`, width));

    if (row.label === "Guidelines" && breakdown.guidelineSources.length > 0) {
      lines.push(
        ...renderCompositionGuidelineSubRows(breakdown.guidelineSources, {
          subLabelWidth,
          total,
          theme,
          width,
        }),
      );
    }

    if (row.label === "Tool snippets" && breakdown.toolSnippetDetails.length > 0) {
      lines.push(
        ...renderCompositionSnippetSubRows(
          breakdown.toolSnippetDetails,
          subLabelWidth,
          theme,
          width,
        ),
      );
    }
  }

  return lines;
}
