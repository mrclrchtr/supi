import type { Theme } from "@earendil-works/pi-coding-agent";
import { clampReportWidth, formatReportTitle } from "@mrclrchtr/supi-core/report";
import type { ContextAnalysis } from "./analysis.ts";
import {
  renderCompactionNote,
  renderContextFilesSection,
  renderGuidelinesSection,
  renderInjectedFilesSection,
  renderInstructionFilesSection,
  renderProviderSections,
  renderSkillsSection,
  renderToolDefinitionsSection,
} from "./format-sections.ts";
import {
  renderCategoryBreakdown,
  renderSummary,
  renderSystemPromptComposition,
  renderUsageBar,
} from "./format-summary.ts";

export function formatContextReport(
  analysis: ContextAnalysis,
  theme: Theme,
  width = 200,
): string[] {
  const safeWidth = clampReportWidth(width);
  const lines: string[] = [];

  lines.push(formatReportTitle("◆ Context Usage", theme, safeWidth));
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
