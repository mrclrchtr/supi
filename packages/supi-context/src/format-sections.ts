import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import {
  formatDimLine,
  formatKeyValueLine,
  formatOverflowHint,
  formatSectionHeader,
  wrapReportText,
} from "@mrclrchtr/supi-core/report";
import type { ContextAnalysis } from "./analysis.ts";
import { padLeft, padRight, pct, sum } from "./format-helpers.ts";
import { formatTokens, pluralize } from "./utils.ts";

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
  const header = formatSectionHeader(
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

export function renderInstructionFilesSection(
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

export function renderContextFilesSection(
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

export function renderInjectedFilesSection(
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

export function renderSkillsSection(
  analysis: ContextAnalysis,
  theme: Theme,
  width: number,
): string[] {
  const lines: string[] = [];
  const total = sum(analysis.skills.map((skill) => skill.tokens));
  lines.push(
    formatSectionHeader(
      `Skills (${analysis.skills.length})`,
      total > 0 ? `${formatTokens(total)} tokens` : null,
      theme,
      width,
    ),
  );

  if (analysis.skills.length === 0) {
    lines.push(formatDimLine("Send a message to see skill details", theme, width, 2));
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

function renderSourceSummaryBar(gs: Array<{ source: string; bulletCount: number }>): string | null {
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
      lines.push(...wrapReportText(bullet, width, { indent: "  " }));
    } else {
      lines.push(truncateToWidth(`  ${bullet}`, width));
    }
  }
  if (!full && bullets.length > previewLimit) {
    lines.push(
      formatOverflowHint(bullets.length - previewLimit, theme, width, {
        hint: "run /supi-context full",
      }),
    );
  }
  return lines;
}

export function renderGuidelinesSection(
  analysis: ContextAnalysis,
  theme: Theme,
  width: number,
): string[] {
  const sourceSummary = renderSourceSummaryBar(analysis.guidelineSources);

  const lines = [
    formatSectionHeader(
      `Guidelines (${pluralize(analysis.guidelineBullets.length, "bullet", "bullets")})`,
      `${formatTokens(analysis.guidelines)} tokens`,
      theme,
      width,
    ),
  ];

  if (sourceSummary) {
    lines.push(formatDimLine(sourceSummary, theme, width, 2));
  }

  const bullets = analysis.guidelineBullets;
  if (bullets.length === 0) {
    return lines;
  }

  lines.push(...renderBulletLines(bullets, analysis.full, theme, width));
  return lines;
}

export function renderToolDefinitionsSection(
  analysis: ContextAnalysis,
  theme: Theme,
  width: number,
): string[] {
  const tools = [...analysis.toolDefinitions.tools].sort((a, b) => b.tokens - a.tokens);
  if (tools.length === 0) return [];

  const hasSnippetDetails = analysis.toolSnippetDetails.length > 0;

  const lines: string[] = [];
  lines.push(
    formatSectionHeader(
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
      formatOverflowHint(tools.length - previewLimit, theme, width, {
        hint: "run /supi-context full",
      }),
    );
  }

  if (hasSnippetDetails) {
    const snippetTotal = sum(analysis.toolSnippetDetails.map((s) => s.tokens));
    lines.push(
      formatDimLine(`→ total tool snippet tokens: ${formatTokens(snippetTotal)}`, theme, width, 2),
    );
  }

  return lines;
}

export function renderCompactionNote(
  analysis: ContextAnalysis,
  theme: Theme,
  width: number,
): string[] {
  if (!analysis.compaction) return [];
  return [
    formatDimLine(
      `↳ ${pluralize(analysis.compaction.summarizedTurns, "older turn", "older turns")} summarized (compaction)`,
      theme,
      width,
    ),
  ];
}

export function renderProviderSections(
  analysis: ContextAnalysis,
  theme: Theme,
  width: number,
): string[] {
  if (analysis.providerSections.length === 0) return [];

  const lines: string[] = [];
  for (const section of analysis.providerSections) {
    lines.push(formatSectionHeader(section.label, null, theme, width));
    for (const [key, value] of Object.entries(section.data)) {
      lines.push(
        formatKeyValueLine({
          label: key,
          value: String(value),
          theme,
          width,
        }),
      );
    }
  }

  return lines;
}
