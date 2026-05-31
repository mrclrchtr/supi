// Affected markdown renderer — consumes analysis data and produces markdown content.

import type { PrioritySignalsSummary } from "../../prioritization-signals.ts";
import { appendPrioritySignalsSection } from "../../prioritization-signals.ts";
import type { ResolvedTarget, ResolvedTargetGroup } from "../../target-resolution.ts";
import type { ReferenceCollection } from "../../use-case/support/semantic-references.ts";
import { formatReferenceList } from "../../use-case/support/semantic-references.ts";

// ── Types ────────────────────────────────────────────────────────────

export interface ImpactAnalysis {
  confidence: "semantic" | "structural" | "heuristic" | "unavailable";
  affectedFiles: Set<string>;
  affectedModules: Set<string>;
  downstreamCount: number;
  checkNext: string[];
  likelyTests: string[];
  riskLevel: "low" | "medium" | "high";
  externalRefs: number;
}

export const AFFECTED_COMPATIBILITY_NOTE =
  "Compatibility alias — prefer `code_impact` for new workflow-oriented impact analysis.";

interface RenderSingleParams {
  symbolName: string;
  refs: ReferenceCollection;
  analysis: ImpactAnalysis;
  maxResults: number;
  prioritySignals: PrioritySignalsSummary | null;
  target: ResolvedTarget;
  cwd: string;
}

// ── Single target renderer ───────────────────────────────────────────

export function renderAffectedSingle(params: RenderSingleParams): string {
  const { symbolName, refs, analysis, maxResults, prioritySignals, target, cwd } = params;
  const totalRefs = refs.refs.length + analysis.externalRefs;
  const lines: string[] = [];

  lines.push(`# Affected: \`${symbolName}\``);
  lines.push("");
  lines.push(`_${AFFECTED_COMPATIBILITY_NOTE}_`);
  lines.push("");

  const refSummary =
    analysis.externalRefs > 0
      ? `${totalRefs} refs (${refs.refs.length} direct + ${analysis.externalRefs} external)`
      : `${totalRefs} ref${totalRefs !== 1 ? "s" : ""}`;
  lines.push(
    `**Risk: ${analysis.riskLevel.toUpperCase()}** | ${refSummary} | ${analysis.affectedFiles.size} file${analysis.affectedFiles.size !== 1 ? "s" : ""} | ${analysis.affectedModules.size} module${analysis.affectedModules.size !== 1 ? "s" : ""} | ${analysis.downstreamCount} downstream (${analysis.confidence})`,
  );
  if (analysis.externalRefs > 0) {
    lines.push(
      "_External references are not listed individually (node_modules, .pnpm, or out-of-tree)_",
    );
  }
  lines.push("");

  addRiskSection(lines, analysis, totalRefs);
  formatReferenceList(lines, refs.refs, maxResults, cwd);
  appendPrioritySignalsSection(lines, prioritySignals);
  addCheckNextSection(lines, analysis.checkNext);
  addTestsSection(lines, analysis.likelyTests);

  const relPath = target.file ? pathRelative(cwd, target.file) : "";
  lines.push("## Next");
  lines.push(
    `- \`code_inspect\` with \`file: "${relPath}"\`, \`line: ${target.displayLine}\`, and \`character: ${target.displayCharacter}\` for point facts around ${symbolName}`,
  );
  lines.push(
    `- \`code_graph\`, \`file: "${relPath}"\`, \`line: ${target.displayLine}\`, and \`character: ${target.displayCharacter}\` for reference sites`,
  );
  lines.push("");

  return lines.join("\n");
}

// ── File-level target group renderer ─────────────────────────────────

interface RenderFileLevelParams {
  targetGroup: ResolvedTargetGroup;
  perTarget: Array<{ target: ResolvedTarget; refs: ReferenceCollection }>;
  aggregated: ReferenceCollection;
  analysis: ImpactAnalysis;
  maxResults: number;
  prioritySignals: PrioritySignalsSummary | null;
}

export function renderAffectedFileLevel(params: RenderFileLevelParams): string {
  const { targetGroup, perTarget, aggregated, analysis, maxResults, prioritySignals } = params;
  const totalRefs = aggregated.refs.length + aggregated.externalCount;
  const refSummary =
    aggregated.externalCount > 0
      ? `${totalRefs} refs (${aggregated.refs.length} direct + ${aggregated.externalCount} external)`
      : `${totalRefs} ref${totalRefs !== 1 ? "s" : ""}`;

  const lines: string[] = [];
  lines.push(`# Affected: \`${targetGroup.displayName}\``);
  lines.push("");
  lines.push(`_${AFFECTED_COMPATIBILITY_NOTE}_`);
  lines.push("");
  lines.push(
    `**Risk: ${analysis.riskLevel.toUpperCase()}** | ${targetGroup.targets.length} exported target${targetGroup.targets.length !== 1 ? "s" : ""} | ${refSummary} | ${analysis.affectedFiles.size} file${analysis.affectedFiles.size !== 1 ? "s" : ""} | ${analysis.affectedModules.size} module${analysis.affectedModules.size !== 1 ? "s" : ""} | ${analysis.downstreamCount} downstream (${analysis.confidence})`,
  );
  lines.push("");

  lines.push("## Exported Targets");
  for (const entry of perTarget) {
    lines.push(
      `- \`${entry.target.name ?? "symbol"}\` — ${entry.refs.refs.length} ref${entry.refs.refs.length !== 1 ? "s" : ""}`,
    );
  }
  lines.push("");

  addRiskSection(lines, analysis, totalRefs);
  formatReferenceList(lines, aggregated.refs, maxResults, "");
  appendPrioritySignalsSection(lines, prioritySignals);
  addCheckNextSection(lines, analysis.checkNext);
  addTestsSection(lines, analysis.likelyTests);
  lines.push("## Next");
  lines.push("- `code_brief` on the most-affected module for deeper context");
  lines.push(
    "- Use `code_inspect` with file + line + character to inspect one exported target precisely",
  );
  lines.push("");

  return lines.join("\n");
}

// ── Shared formatting helpers ────────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: risk-level formatting with branching per level is clearer as one function
function addRiskSection(lines: string[], analysis: ImpactAnalysis, directCount: number): void {
  lines.push("## Risk Assessment");
  const { riskLevel, affectedFiles, affectedModules, downstreamCount } = analysis;
  if (riskLevel === "low") {
    lines.push(
      `\`low\` — ${directCount} ref${directCount !== 1 ? "s" : ""}, local, no downstream dependents.`,
    );
  } else if (riskLevel === "medium") {
    lines.push(
      `\`medium\` — ${directCount} ref${directCount !== 1 ? "s" : ""} across ${affectedFiles.size} file${affectedFiles.size !== 1 ? "s" : ""}${downstreamCount > 0 ? `, ${downstreamCount} downstream` : ""}.`,
    );
  } else {
    lines.push(
      `\`high\` — ${directCount} ref${directCount !== 1 ? "s" : ""} across ${affectedFiles.size} file${affectedFiles.size !== 1 ? "s" : ""} in ${affectedModules.size} module${affectedModules.size !== 1 ? "s" : ""}${downstreamCount > 0 ? `, ${downstreamCount} downstream` : ""}.`,
    );
  }
  lines.push("");
}

function addCheckNextSection(lines: string[], checkNext: string[]): void {
  if (checkNext.length === 0) return;
  lines.push("## Check Next");
  for (const item of checkNext.slice(0, 3)) {
    lines.push(`- ${item}`);
  }
  lines.push("");
}

function addTestsSection(lines: string[], tests: string[]): void {
  if (tests.length === 0) return;
  lines.push("## Likely Tests");
  for (const t of tests.slice(0, 3)) {
    lines.push(`- \`${t}\``);
  }
  lines.push("");
}

function pathRelative(cwd: string, file: string): string {
  // Simple relative path computation
  if (file.startsWith(cwd)) {
    const rel = file.slice(cwd.length).replace(/^[/\\]/, "");
    return rel || ".";
  }
  return file;
}
