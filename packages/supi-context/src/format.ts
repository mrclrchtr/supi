// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: format file is inherently large

import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { ContextAnalysis } from "./analysis.ts";
import { formatTokens, pluralize } from "./utils.ts";

type CategoryKey =
  | "systemPrompt"
  | "userMessages"
  | "assistantMessages"
  | "toolCalls"
  | "toolResults"
  | "other";

const CATEGORY_ORDER: CategoryKey[] = [
  "systemPrompt",
  "userMessages",
  "assistantMessages",
  "toolCalls",
  "toolResults",
  "other",
];

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  systemPrompt: "System prompt",
  userMessages: "User messages",
  assistantMessages: "Assistant messages",
  toolCalls: "Tool calls",
  toolResults: "Tool results",
  other: "Other",
};

const CATEGORY_COLORS: Record<CategoryKey, Parameters<Theme["fg"]>["0"]> = {
  systemPrompt: "accent",
  userMessages: "success",
  assistantMessages: "warning",
  toolCalls: "error",
  toolResults: "dim",
  other: "muted",
};

function pct(value: number, total: number): string {
  if (total <= 0) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

function padLeft(text: string, width: number): string {
  return text.padStart(width, " ");
}

function padRight(text: string, width: number): string {
  return text.padEnd(width, " ");
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function allocateBlocks(values: number[], totalBlocks: number): number[] {
  const total = sum(values);
  if (total <= 0 || totalBlocks <= 0) {
    return values.map(() => 0);
  }

  const exact = values.map((value) => (value / total) * totalBlocks);
  const counts = exact.map((value) => Math.floor(value));
  const remaining = totalBlocks - sum(counts);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - counts[index] }))
    .sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < remaining; i += 1) {
    counts[byRemainder[i]?.index ?? 0] += 1;
  }

  return counts;
}

function healthColor(analysis: ContextAnalysis): Parameters<Theme["fg"]>["0"] {
  if (analysis.contextWindow <= 0) return "dim";
  const reserved = analysis.totalTokens ?? 0;
  const pressure =
    ((reserved + analysis.categories.autocompactBuffer) / analysis.contextWindow) * 100;
  if (pressure >= 90) return "error";
  if (pressure >= 70) return "warning";
  return "success";
}

function sectionHeader(title: string, meta: string | null, theme: Theme, width: number): string {
  const left = theme.fg("text", title);
  const content = meta ? `${left}${theme.fg("dim", `  ${meta}`)}` : left;
  return truncateToWidth(content, width);
}

function renderSummary(analysis: ContextAnalysis, theme: Theme, width: number): string[] {
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
    lines.push(...wrapTextWithAnsi(theme.fg("warning", analysis.approximationNote), width));
  }

  return lines;
}

function renderUsageBar(analysis: ContextAnalysis, theme: Theme, width: number): string[] {
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
      color: "warning" as Parameters<Theme["fg"]>["0"],
      block: "▒",
      count: counts[CATEGORY_ORDER.length] ?? 0,
    },
    {
      color: "dim" as Parameters<Theme["fg"]>["0"],
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

  return [barLine, ...wrapTextWithAnsi(legendParts.join(theme.fg("dim", "  •  ")), width)];
}

function renderCategoryBreakdown(analysis: ContextAnalysis, theme: Theme, width: number): string[] {
  const lines: string[] = [];
  lines.push(sectionHeader("Usage by category", null, theme, width));

  const rows: Array<{
    label: string;
    color: Parameters<Theme["fg"]>["0"];
    tokens: number;
  }> = [
    ...CATEGORY_ORDER.map((key) => ({
      label: CATEGORY_LABELS[key],
      color: CATEGORY_COLORS[key],
      tokens: analysis.categories[key],
    })),
    {
      label: "Autocompact buffer",
      color: "warning" as Parameters<Theme["fg"]>["0"],
      tokens: analysis.categories.autocompactBuffer,
    },
    {
      label: "Free space",
      color: "dim" as Parameters<Theme["fg"]>["0"],
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

function renderSystemPromptComposition(
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
    sectionHeader(
      "System prompt composition",
      total > 0 ? `${formatTokens(total)} tokens` : null,
      theme,
      width,
    ),
  );

  const labelWidth = Math.max(18, Math.min(22, width - 22));
  const subLabelWidth = labelWidth;

  const rows = [
    { label: "Base", color: "accent" as Parameters<Theme["fg"]>["0"], tokens: breakdown.base },
    {
      label: "Instruction files",
      color: "text" as Parameters<Theme["fg"]>["0"],
      tokens: instructionFileTokens,
    },
    {
      label: "Context files",
      color: "text" as Parameters<Theme["fg"]>["0"],
      tokens: contextFileTokens,
    },
    { label: "Skills", color: "text" as Parameters<Theme["fg"]>["0"], tokens: skillTokens },
    {
      label: "Guidelines",
      color: "text" as Parameters<Theme["fg"]>["0"],
      tokens: breakdown.guidelines,
    },
    {
      label: "Tool snippets",
      color: "text" as Parameters<Theme["fg"]>["0"],
      tokens: breakdown.toolSnippets,
    },
    {
      label: "Append text",
      color: "text" as Parameters<Theme["fg"]>["0"],
      tokens: breakdown.appendText,
    },
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

interface FileSectionOptions {
  title: string;
  subtitle: string;
  files: Array<{ path: string; tokens: number; lines: number; extra?: string }>;
  total: number;
  theme: Theme;
  width: number;
}

function renderFileSection(options: FileSectionOptions): string[] {
  const { title, subtitle, files, total, theme, width } = options;
  if (files.length === 0) return [];

  const sorted = [...files].sort((a, b) => b.tokens - a.tokens);
  const totalTokens = sum(sorted.map((file) => file.tokens));
  const header = sectionHeader(
    title,
    `${pluralize(sorted.length, "file", "files")}, ${formatTokens(totalTokens)} tokens${subtitle ? ` · ${subtitle}` : ""}`,
    theme,
    width,
  );

  const tokenWidth = 8;
  const lineWidth = 10;
  const pctWidth = 7;
  const extraWidth = sorted.some((file) => file.extra) ? 10 : 0;
  const reserved =
    2 + 2 + lineWidth + 2 + tokenWidth + 2 + pctWidth + (extraWidth ? 2 + extraWidth : 0);
  const pathWidth = Math.max(16, width - reserved);

  const lines = [header];
  for (const file of sorted) {
    const path = padRight(truncateToWidth(file.path, pathWidth), pathWidth);
    const lineCol = padLeft(`${file.lines} lines`, lineWidth);
    const tokenCol = padLeft(formatTokens(file.tokens), tokenWidth);
    const pctCol = padLeft(pct(file.tokens, total), pctWidth);
    const extra = extraWidth ? `  ${theme.fg("dim", padRight(file.extra ?? "", extraWidth))}` : "";
    lines.push(
      `  ${theme.fg("text", path)}  ${theme.fg("dim", lineCol)}  ${theme.fg("dim", tokenCol)}${extra}  ${theme.fg("dim", pctCol)}`,
    );
  }

  return lines;
}

function renderInstructionFilesSection(
  analysis: ContextAnalysis,
  theme: Theme,
  width: number,
): string[] {
  return renderFileSection({
    title: "Instruction Files (AGENTS.md / CLAUDE.md)",
    subtitle: "share of system prompt",
    files: analysis.systemPromptBreakdown.instructionFiles.map((file) => ({
      path: file.path,
      tokens: file.tokens,
      lines: file.lines,
      extra: file.origin,
    })),
    total: analysis.categories.systemPrompt,
    theme,
    width,
  });
}

function renderContextFilesSection(
  analysis: ContextAnalysis,
  theme: Theme,
  width: number,
): string[] {
  return renderFileSection({
    title: "Context Files (system prompt)",
    subtitle: "share of system prompt",
    files: analysis.systemPromptBreakdown.contextFiles.map((file) => ({
      path: file.path,
      tokens: file.tokens,
      lines: file.lines,
    })),
    total: analysis.categories.systemPrompt,
    theme,
    width,
  });
}

function renderInjectedFilesSection(
  analysis: ContextAnalysis,
  theme: Theme,
  width: number,
): string[] {
  return renderFileSection({
    title: "Context Files (injected · supi-claude-md)",
    subtitle: "share of full context",
    files: analysis.injectedFiles.map((file) => ({
      path: file.file,
      tokens: file.tokens,
      lines: file.lines,
      extra: `turn ${file.turn}`,
    })),
    total: analysis.totalTokens ?? 0,
    theme,
    width,
  });
}

function renderSkillsSection(analysis: ContextAnalysis, theme: Theme, width: number): string[] {
  const lines: string[] = [];
  const total = sum(analysis.skills.map((skill) => skill.tokens));
  lines.push(
    sectionHeader(
      `Skills (${analysis.skills.length})`,
      total > 0 ? `${formatTokens(total)} tokens` : null,
      theme,
      width,
    ),
  );

  if (analysis.skills.length === 0) {
    lines.push(truncateToWidth(theme.fg("dim", "  Send a message to see skill details"), width));
    return lines;
  }

  const skillNameWidth =
    analysis.skills.length > 0 ? Math.max(...analysis.skills.map((s) => s.name.length)) : 0;
  for (const skill of analysis.skills) {
    lines.push(
      truncateToWidth(
        `  ${theme.fg("text", padRight(skill.name, skillNameWidth))}  ${theme.fg("dim", padLeft(formatTokens(skill.tokens), 8))}`,
        width,
      ),
    );
  }

  return lines;
}

function renderSourceSummaryBar(
  gs: Array<{ source: string; bulletCount: number }>,
  _theme: Theme,
  _width: number,
): string | null {
  if (gs.length === 0) return null;
  const parts: string[] = [];
  for (const s of gs) {
    const label =
      s.source === "default" ? "default" : s.source === "other" ? "extensions" : s.source;
    parts.push(`${pluralize(s.bulletCount, "bullet", "bullets")} from ${label}`);
  }
  return parts.join(" · ");
}

function renderBulletLines(
  bullets: string[],
  full: boolean,
  theme: Theme,
  width: number,
): string[] {
  const previewLimit = full ? bullets.length : Math.min(6, bullets.length);
  const lines: string[] = [];
  for (let i = 0; i < previewLimit; i += 1) {
    const rawText = bullets[i] ?? "";
    const previewText = full || rawText.length <= 90 ? rawText : `${rawText.slice(0, 90)}…`;
    const bullet = `${theme.fg("dim", "•")} ${theme.fg("text", previewText)}`;
    if (full) {
      lines.push(...wrapTextWithAnsi(bullet, Math.max(1, width - 2)).map((line) => `  ${line}`));
    } else {
      lines.push(truncateToWidth(`  ${bullet}`, width));
    }
  }
  if (!full && bullets.length > previewLimit) {
    lines.push(
      truncateToWidth(
        `  ${theme.fg("dim", `… and ${bullets.length - previewLimit} more — run /supi-context full`)}`,
        width,
      ),
    );
  }
  return lines;
}

function renderGuidelinesSection(analysis: ContextAnalysis, theme: Theme, width: number): string[] {
  const sourceSummary = renderSourceSummaryBar(analysis.guidelineSources, theme, width);

  const lines = [
    sectionHeader(
      `Guidelines (${pluralize(analysis.guidelineBullets.length, "bullet", "bullets")})`,
      `${formatTokens(analysis.guidelines)} tokens`,
      theme,
      width,
    ),
  ];

  if (sourceSummary) {
    lines.push(truncateToWidth(`  ${theme.fg("dim", sourceSummary)}`, width));
  }

  const bullets = analysis.guidelineBullets;
  if (bullets.length === 0) {
    return lines;
  }

  lines.push(...renderBulletLines(bullets, analysis.full, theme, width));
  return lines;
}

function renderToolDefinitionsSection(
  analysis: ContextAnalysis,
  theme: Theme,
  width: number,
): string[] {
  const tools = [...analysis.toolDefinitions.tools].sort((a, b) => b.tokens - a.tokens);
  if (tools.length === 0) return [];

  const hasSnippetDetails = analysis.toolSnippetDetails.length > 0;

  const lines: string[] = [];
  lines.push(
    sectionHeader(
      `Tool Definitions (${tools.length} active)`,
      `${formatTokens(analysis.toolDefinitions.tokens)} def tokens${hasSnippetDetails ? ` + ${formatTokens(sum(analysis.toolSnippetDetails.map((s) => s.tokens)))} snippet` : ""}`,
      theme,
      width,
    ),
  );

  const previewLimit = analysis.full ? tools.length : Math.min(5, tools.length);
  const nameWidth = Math.max(12, Math.min(18, Math.max(...tools.map((tool) => tool.name.length))));
  const defTokenWidth = 8;
  const snippetTokenWidth = hasSnippetDetails ? 10 : 0;
  const reserved =
    2 + nameWidth + 2 + defTokenWidth + 2 + (snippetTokenWidth ? snippetTokenWidth + 2 : 0);
  const descWidth = Math.max(12, width - reserved);

  for (let i = 0; i < previewLimit; i += 1) {
    const tool = tools[i];
    const name = padRight(tool.name, nameWidth);
    const previewDescription =
      analysis.full || tool.description.length <= 50
        ? tool.description
        : `${tool.description.slice(0, 50)}…`;
    const description = truncateToWidth(previewDescription, descWidth);
    const defTokens = padLeft(formatTokens(tool.tokens), defTokenWidth);
    const snippet = analysis.toolSnippetDetails.find((s) => s.name === tool.name);
    const snippetCol = snippet
      ? ` ${theme.fg("dim", padLeft(`+${formatTokens(snippet.tokens)}snip`, snippetTokenWidth))}`
      : "";
    lines.push(
      truncateToWidth(
        `  ${theme.fg("text", name)}  ${theme.fg("dim", description)}  ${theme.fg("dim", defTokens)}${snippetCol}`,
        width,
      ),
    );
  }

  if (!analysis.full && tools.length > previewLimit) {
    lines.push(
      truncateToWidth(
        `  ${theme.fg("dim", `… and ${tools.length - previewLimit} more — run /supi-context full`)}`,
        width,
      ),
    );
  }

  // Add a legend row for snippet column if any tools had snippets
  if (hasSnippetDetails) {
    const snippetTotal = sum(analysis.toolSnippetDetails.map((s) => s.tokens));
    lines.push(
      truncateToWidth(
        `  ${theme.fg("dim", `→ total tool snippet tokens: ${formatTokens(snippetTotal)}`)}`,
        width,
      ),
    );
  }

  return lines;
}

function renderCompactionNote(analysis: ContextAnalysis, theme: Theme, width: number): string[] {
  if (!analysis.compaction) return [];
  return [
    truncateToWidth(
      theme.fg(
        "dim",
        `↳ ${pluralize(analysis.compaction.summarizedTurns, "older turn", "older turns")} summarized (compaction)`,
      ),
      width,
    ),
  ];
}

function renderProviderSections(analysis: ContextAnalysis, theme: Theme, width: number): string[] {
  if (analysis.providerSections.length === 0) return [];

  const lines: string[] = [];
  for (const section of analysis.providerSections) {
    lines.push(sectionHeader(section.label, null, theme, width));
    for (const [key, value] of Object.entries(section.data)) {
      const label = theme.fg("text", key);
      const content = theme.fg("dim", String(value));
      lines.push(truncateToWidth(`  ${label}: ${content}`, width));
    }
  }

  return lines;
}

export function formatContextReport(
  analysis: ContextAnalysis,
  theme: Theme,
  width = 200,
): string[] {
  const safeWidth = Math.max(24, width);
  const lines: string[] = [];

  lines.push(truncateToWidth(theme.fg("accent", "◆ Context Usage"), safeWidth));
  lines.push("");
  lines.push(...renderSummary(analysis, theme, safeWidth));
  lines.push("");
  lines.push(...renderUsageBar(analysis, theme, safeWidth));
  lines.push("");
  lines.push(...renderCategoryBreakdown(analysis, theme, safeWidth));
  lines.push("");
  lines.push(...renderSystemPromptComposition(analysis, theme, safeWidth));

  const sections = [
    renderInstructionFilesSection(analysis, theme, safeWidth),
    renderContextFilesSection(analysis, theme, safeWidth),
    renderInjectedFilesSection(analysis, theme, safeWidth),
    renderSkillsSection(analysis, theme, safeWidth),
    renderGuidelinesSection(analysis, theme, safeWidth),
    renderToolDefinitionsSection(analysis, theme, safeWidth),
    renderCompactionNote(analysis, theme, safeWidth),
    renderProviderSections(analysis, theme, safeWidth),
  ].filter((section) => section.length > 0);

  for (const section of sections) {
    lines.push("");
    lines.push(...section);
  }

  return lines;
}
