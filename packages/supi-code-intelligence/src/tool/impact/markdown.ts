// Impact markdown renderer — consumes analysis data and produces markdown content.

import * as path from "node:path";
import { readNextAround, renderReadNextSection } from "../../analysis/read-next.ts";
import type { ReferenceCollection } from "../../analysis/references/semantic-refs.ts";
import { formatReferenceList } from "../../analysis/references/semantic-refs.ts";
import type { PrioritySignalsSummary } from "../../analysis/signals/project.ts";
import { appendPrioritySignalsSection } from "../../analysis/signals/project.ts";
import type { ResolvedTargetData, ResolvedTargetGroupData } from "../../analysis/target/types.ts";
import type { TestSurfaceDetails } from "../../analysis/tests/test-discovery.ts";

// ── Types ────────────────────────────────────────────────────────────

export interface ImpactAnalysis {
  confidence: "semantic" | "structural" | "heuristic" | "unavailable";
  affectedFiles: Set<string>;
  affectedModules: Set<string>;
  downstreamCount: number;
  checkNext: string[];
  likelyTests: string[];
  likelyTestCommands: string[];
  riskLevel: "low" | "medium" | "high";
  externalRefs: number;
  semanticRefFiles?: string[];
  tests?: TestSurfaceDetails;
}

interface RenderSingleParams {
  symbolName: string;
  refs: ReferenceCollection;
  analysis: ImpactAnalysis;
  maxResults: number;
  prioritySignals: PrioritySignalsSummary | null;
  target: ResolvedTargetData;
  cwd: string;
}

// ── Single target renderer ───────────────────────────────────────────

export function renderImpactSingle(params: RenderSingleParams): string {
  const { symbolName, refs, analysis, maxResults, prioritySignals } = params;
  const totalRefs = refs.refs.length + analysis.externalRefs;
  const lines: string[] = [];

  lines.push(`# Impact: \`${symbolName}\``);
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
  formatReferenceList(lines, refs.refs, maxResults);
  lines.push(
    ...renderReadNextSection([
      readNextAround(
        path.relative(params.cwd, params.target.file) || params.target.file,
        params.target.displayLine,
        "inspect the target before editing",
      ),
      ...refs.refs
        .slice(0, Math.min(2, maxResults))
        .map((ref) => readNextAround(ref.file, ref.line, "inspect a reference site")),
    ]),
  );
  appendPrioritySignalsSection(lines, prioritySignals);
  addCheckNextSection(lines, analysis.checkNext);
  addTestsSection(lines, analysis.likelyTests, analysis.tests);
  addLikelyTestCommandsSection(lines, analysis.likelyTestCommands);

  return lines.join("\n");
}

// ── File-level target group renderer ─────────────────────────────────

interface RenderFileLevelParams {
  targetGroup: ResolvedTargetGroupData;
  perTarget: Array<{ target: ResolvedTargetData; refs: ReferenceCollection }>;
  aggregated: ReferenceCollection;
  analysis: ImpactAnalysis;
  maxResults: number;
  prioritySignals: PrioritySignalsSummary | null;
  cwd: string;
}

export function renderImpactFileLevel(params: RenderFileLevelParams): string {
  const { targetGroup, perTarget, aggregated, analysis, maxResults, prioritySignals, cwd } = params;
  const totalRefs = aggregated.refs.length + aggregated.externalCount;
  const refSummary =
    aggregated.externalCount > 0
      ? `${totalRefs} refs (${aggregated.refs.length} direct + ${aggregated.externalCount} external)`
      : `${totalRefs} ref${totalRefs !== 1 ? "s" : ""}`;

  const lines: string[] = [];
  lines.push(`# Impact: \`${targetGroup.displayName}\``);
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
  formatReferenceList(lines, aggregated.refs, maxResults);
  lines.push(
    ...renderReadNextSection([
      readNextAround(
        path.relative(cwd, targetGroup.file) || targetGroup.file,
        1,
        "inspect the target file exports before editing",
      ),
      ...aggregated.refs
        .slice(0, Math.min(2, maxResults))
        .map((ref) => readNextAround(ref.file, ref.line, "inspect a reference site")),
    ]),
  );
  appendPrioritySignalsSection(lines, prioritySignals);
  addCheckNextSection(lines, analysis.checkNext);
  addTestsSection(lines, analysis.likelyTests, analysis.tests);
  addLikelyTestCommandsSection(lines, analysis.likelyTestCommands);

  return lines.join("\n");
}

// ── Change-set renderer ──────────────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: shared change-set renderer combines risk, files, tests, and priority signals in one function
export function renderChangeSetImpact(params: {
  changeSetFiles: string[];
  analysis: ImpactAnalysis;
  prioritySignals: PrioritySignalsSummary | null;
}): string {
  const lines: string[] = [];

  lines.push("# Impact: change set");
  lines.push("");

  lines.push(
    `**Risk: ${params.analysis.riskLevel.toUpperCase()}** | ${params.changeSetFiles.length} change-set file${params.changeSetFiles.length !== 1 ? "s" : ""} | ${params.analysis.affectedModules.size} module${params.analysis.affectedModules.size !== 1 ? "s" : ""} | ${params.analysis.downstreamCount} downstream (${params.analysis.confidence})`,
  );
  lines.push("");

  lines.push("## Change Set Files");
  for (const file of params.changeSetFiles) {
    lines.push(`- \`${file}\``);
  }
  lines.push("");

  lines.push(
    ...renderReadNextSection(
      params.changeSetFiles
        .slice(0, 3)
        .map((file) => readNextAround(file, 1, "inspect the change-set file before editing")),
    ),
  );

  if (params.analysis.checkNext.length > 0) {
    lines.push("## Check Next");
    for (const item of params.analysis.checkNext.slice(0, 3)) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (params.analysis.semanticRefFiles && params.analysis.semanticRefFiles.length > 0) {
    lines.push("## Semantic Reference Files");
    for (const file of params.analysis.semanticRefFiles.slice(0, 5)) {
      lines.push(`- \`${file}\``);
    }
    if (params.analysis.semanticRefFiles.length > 5) {
      lines.push(`- _+${params.analysis.semanticRefFiles.length - 5} more_`);
    }
    lines.push("");
  }

  if (params.analysis.likelyTests.length > 0) {
    const testHeading = params.analysis.tests?.provenance
      ? `Likely Tests (${params.analysis.tests.provenance})`
      : "Likely Tests";
    lines.push(`## ${testHeading}`);
    for (const file of params.analysis.likelyTests) {
      lines.push(`- \`${file}\``);
    }
    lines.push("");
  } else if (params.analysis.tests) {
    // Test discovery was explicitly requested but found nothing.
    lines.push("## Likely Tests");
    lines.push("No likely tests found by bounded companion/package discovery.");
    lines.push("");
  }

  if (params.analysis.likelyTestCommands.length > 0) {
    lines.push("## Likely Test Commands");
    for (const cmd of params.analysis.likelyTestCommands.slice(0, 3)) {
      lines.push(`- \`${cmd}\``);
    }
    lines.push("");
  }

  appendPrioritySignalsSection(lines, params.prioritySignals);

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

function addTestsSection(lines: string[], tests: string[], details?: TestSurfaceDetails): void {
  if (tests.length > 0) {
    const heading = details?.provenance
      ? `## Likely Tests (${details.provenance})`
      : "## Likely Tests";
    lines.push(heading);
    for (const t of tests.slice(0, 3)) {
      lines.push(`- \`${t}\``);
    }
    lines.push("");
    return;
  }

  // When test discovery was explicitly requested but found nothing,
  // render an honest note instead of silently omitting test information.
  if (details) {
    lines.push("## Likely Tests");
    lines.push("No likely tests found by bounded companion/package discovery.");
    lines.push("");
  }
}

/** Render the Likely Test Commands section when commands are available. */
function addLikelyTestCommandsSection(lines: string[], commands: string[]): void {
  if (commands.length === 0) return;
  lines.push("## Likely Test Commands");
  for (const cmd of commands.slice(0, 3)) {
    lines.push(`- \`${cmd}\``);
  }
  lines.push("");
}
