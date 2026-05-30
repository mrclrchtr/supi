import type { PrioritySignalsSummary } from "../../prioritization-signals.ts";
import { appendPrioritySignalsSection } from "../../prioritization-signals.ts";
import {
  AFFECTED_COMPATIBILITY_NOTE,
  type ImpactAnalysis,
  renderAffectedFileLevel,
  renderAffectedSingle,
} from "./affected.ts";

export type { ImpactAnalysis } from "./affected.ts";

export function renderImpactSingle(params: Parameters<typeof renderAffectedSingle>[0]): string {
  return rewriteAffectedHeading(renderAffectedSingle(params));
}

export function renderImpactFileLevel(
  params: Parameters<typeof renderAffectedFileLevel>[0],
): string {
  return rewriteAffectedHeading(renderAffectedFileLevel(params));
}

export function renderChangedFilesImpact(params: {
  changedFiles: string[];
  baseRef: string | null;
  analysis: ImpactAnalysis;
  nextQueries: string[];
  prioritySignals: PrioritySignalsSummary | null;
  heading?: "Impact" | "Affected";
  compatibilityNote?: string;
}): string {
  const heading = params.heading ?? "Impact";
  const lines: string[] = [];

  lines.push(`# ${heading}: changed files`);
  lines.push("");
  if (params.baseRef) {
    lines.push(`_Base ref: \`${params.baseRef}\`_`);
    lines.push("");
  }
  if (params.compatibilityNote) {
    lines.push(`_${params.compatibilityNote}_`);
    lines.push("");
  }

  lines.push(
    `**Risk: ${params.analysis.riskLevel.toUpperCase()}** | ${params.changedFiles.length} changed file${params.changedFiles.length !== 1 ? "s" : ""} | ${params.analysis.affectedModules.size} module${params.analysis.affectedModules.size !== 1 ? "s" : ""} | ${params.analysis.downstreamCount} downstream (${params.analysis.confidence})`,
  );
  lines.push("");

  lines.push("## Changed Files");
  for (const file of params.changedFiles) {
    lines.push(`- \`${file}\``);
  }
  lines.push("");

  if (params.analysis.checkNext.length > 0) {
    lines.push("## Check Next");
    for (const item of params.analysis.checkNext.slice(0, 3)) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (params.analysis.likelyTests.length > 0) {
    lines.push("## Likely Tests");
    for (const file of params.analysis.likelyTests) {
      lines.push(`- \`${file}\``);
    }
    lines.push("");
  }

  appendPrioritySignalsSection(lines, params.prioritySignals);

  lines.push("## Next");
  for (const query of params.nextQueries) {
    lines.push(`- ${query}`);
  }
  lines.push("");

  return lines.join("\n");
}

function rewriteAffectedHeading(content: string): string {
  return content
    .replace(/^# Affected:/m, "# Impact:")
    .replace(new RegExp(`\\n_${escapeForRegex(AFFECTED_COMPATIBILITY_NOTE)}_\\n\\n`, "m"), "\n");
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
