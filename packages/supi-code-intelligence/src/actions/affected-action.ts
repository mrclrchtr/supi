// Affected action — blast-radius analysis for a symbol change.
// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: file-level and single-target affected flows share helpers to keep the blast-radius logic in one place

import * as path from "node:path";
import { getSessionLspService } from "@mrclrchtr/supi-lsp";
import { buildArchitectureModel, findModuleForPath, getDependents } from "../architecture.ts";
import {
  appendPrioritySignalsSection,
  summarizePrioritySignalsForFiles,
} from "../prioritization-signals.ts";
import { resolveTarget } from "../resolve-target.ts";
import {
  escapeRegex,
  filterOutDeclaration,
  isInProjectPath,
  normalizePath,
  runRipgrep,
  uriToFile,
} from "../search-helpers.ts";
import {
  dedupeFileLineRefs,
  highestConfidence,
  isResolvedTargetGroup,
} from "../semantic-action-helpers.ts";
import type { ResolvedTarget, ResolvedTargetGroup } from "../target-resolution.ts";
import type { ActionParams } from "../tool-actions.ts";
import type { AffectedDetails, CodeIntelResult, ConfidenceMode } from "../types.ts";

export async function executeAffectedAction(
  params: ActionParams,
  cwd: string,
): Promise<CodeIntelResult> {
  const target = await resolveTarget(params, cwd);
  if (typeof target === "string") {
    return {
      content: target,
      details: {
        type: "affected" as const,
        data: {
          confidence: "unavailable",
          directCount: 0,
          downstreamCount: 0,
          riskLevel: "low",
          checkNext: [],
          likelyTests: [],
          omittedCount: 0,
          nextQueries: ["Provide `file`, `line`, `character` or a `symbol` to resolve the target"],
        },
      },
    };
  }

  if (isResolvedTargetGroup(target)) {
    return executeFileLevelAffected(target, params, cwd);
  }

  const symbolName =
    target.name ?? `symbol at ${path.relative(cwd, target.file)}:${target.displayLine}`;
  return executeSingleAffected(target, symbolName, params, cwd);
}

interface GatheredRef {
  file: string;
  line: number;
}

interface ImpactAnalysis {
  confidence: ConfidenceMode;
  affectedFiles: Set<string>;
  affectedModules: Set<string>;
  downstreamCount: number;
  checkNext: string[];
  likelyTests: string[];
  riskLevel: "low" | "medium" | "high";
  externalRefs: number;
}

async function executeSingleAffected(
  target: ResolvedTarget,
  symbolName: string,
  params: ActionParams,
  cwd: string,
): Promise<CodeIntelResult> {
  const refs = await gatherReferences(target, params, cwd);
  const model = await buildArchitectureModel(cwd);
  const analysis = analyzeImpact(refs, model, target.name, cwd);

  const prioritySignals = summarizePrioritySignalsForFiles(
    cwd,
    analysis.affectedFiles.size > 0 ? [...analysis.affectedFiles] : [target.file],
  );
  const content = formatAffectedOutput(symbolName, refs, analysis, params, prioritySignals);
  const details: AffectedDetails = {
    confidence: analysis.confidence,
    directCount: refs.refs.length,
    downstreamCount: analysis.downstreamCount,
    riskLevel: analysis.riskLevel,
    checkNext: analysis.checkNext,
    likelyTests: analysis.likelyTests,
    omittedCount: computeOmittedCount(analysis.externalRefs, analysis.affectedFiles.size, params),
    nextQueries: [
      "`code_intel brief` on the most-affected module for deeper context",
      `\`code_intel callers\` with \`symbol: "${symbolName}"\` for grouped call-site detail`,
    ],
    prioritySignals,
  };
  return { content, details: { type: "affected" as const, data: details } };
}

async function executeFileLevelAffected(
  targetGroup: ResolvedTargetGroup,
  params: ActionParams,
  cwd: string,
): Promise<CodeIntelResult> {
  const perTarget = await Promise.all(
    targetGroup.targets.map(async (target) => ({
      target,
      refs: await gatherReferences(target, params, cwd),
    })),
  );

  const combinedRefs = dedupeFileLineRefs(perTarget.flatMap((entry) => entry.refs.refs));
  const combinedExternal = perTarget.reduce((sum, entry) => sum + entry.refs.externalCount, 0);
  const combinedConfidence = highestConfidence(perTarget.map((entry) => entry.refs.confidence));
  const model = await buildArchitectureModel(cwd);
  const analysis = analyzeImpact(
    { refs: combinedRefs, confidence: combinedConfidence, externalCount: combinedExternal },
    model,
    null,
    cwd,
  );

  const prioritySignals = summarizePrioritySignalsForFiles(
    cwd,
    analysis.affectedFiles.size > 0 ? [...analysis.affectedFiles] : [targetGroup.file],
  );

  const lines: string[] = [];
  lines.push(`# Affected: \`${targetGroup.displayName}\``);
  lines.push("");
  const totalRefs = combinedRefs.length + combinedExternal;
  const refSummary =
    combinedExternal > 0
      ? `${totalRefs} refs (${combinedRefs.length} direct + ${combinedExternal} external)`
      : `${totalRefs} ref${totalRefs !== 1 ? "s" : ""}`;
  lines.push(formatFileLevelAffectedHeader(targetGroup.targets.length, refSummary, analysis));
  lines.push("");

  lines.push("## Exported Targets");
  for (const entry of perTarget) {
    lines.push(
      `- \`${entry.target.name ?? "symbol"}\` — ${entry.refs.refs.length} ref${entry.refs.refs.length !== 1 ? "s" : ""}`,
    );
  }
  lines.push("");

  addRiskSection(lines, analysis, totalRefs);
  addReferencesSection(lines, combinedRefs, params.maxResults ?? 8);
  appendPrioritySignalsSection(lines, prioritySignals);
  addCheckNextSection(lines, analysis.checkNext);
  addTestsSection(lines, analysis.likelyTests);
  lines.push("## Next");
  lines.push("- `code_intel brief` on the most-affected module for deeper context");
  lines.push("- Use `file` + coordinates to inspect one exported target precisely");
  lines.push("");

  const details: AffectedDetails = {
    confidence: analysis.confidence,
    directCount: combinedRefs.length,
    downstreamCount: analysis.downstreamCount,
    riskLevel: analysis.riskLevel,
    checkNext: analysis.checkNext,
    likelyTests: analysis.likelyTests,
    omittedCount: computeOmittedCount(analysis.externalRefs, analysis.affectedFiles.size, params),
    nextQueries: [
      "`code_intel brief` on the most-affected module for deeper context",
      "Use `file` + coordinates to inspect one exported target precisely",
    ],
    prioritySignals,
  };

  return { content: lines.join("\n"), details: { type: "affected" as const, data: details } };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multi-source reference gathering with fallback logic
async function gatherReferences(
  target: ResolvedTarget,
  params: ActionParams,
  cwd: string,
): Promise<{ refs: GatheredRef[]; confidence: ConfidenceMode; externalCount: number }> {
  const lspState = getSessionLspService(cwd);
  const refs: GatheredRef[] = [];
  let externalCount = 0;

  if (lspState.kind === "ready") {
    const lspRefs = await lspState.service.references(target.file, target.position);
    if (lspRefs && lspRefs.length > 0) {
      const filtered = filterOutDeclaration(lspRefs, target.file, target.position);
      for (const ref of filtered) {
        const filePath = uriToFile(ref.uri);
        if (isInProjectPath(filePath, cwd)) {
          refs.push({ file: path.relative(cwd, filePath), line: ref.range.start.line + 1 });
        } else {
          externalCount++;
        }
      }
      return { refs, confidence: "semantic", externalCount };
    }
  }

  if (target.name) {
    const scopePath = params.path ? normalizePath(params.path, cwd) : cwd;
    const pattern = `\\b${escapeRegex(target.name)}\\b`;
    const matches = runRipgrep(pattern, scopePath, cwd, { maxMatches: 30 });
    for (const m of matches) {
      if (!isDeclarationMatch(m.file, m.line, target, cwd)) {
        refs.push({ file: path.relative(cwd, path.resolve(cwd, m.file)), line: m.line });
      }
    }
    return { refs, confidence: "heuristic", externalCount: 0 };
  }

  return { refs, confidence: "unavailable", externalCount: 0 };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: impact analysis with downstream module traversal
function analyzeImpact(
  result: { refs: GatheredRef[]; confidence: ConfidenceMode; externalCount: number },
  model: Awaited<ReturnType<typeof buildArchitectureModel>>,
  symbolName: string | null,
  cwd: string,
): ImpactAnalysis {
  const affectedFiles = new Set(result.refs.map((r) => r.file));
  const affectedModules = new Set<string>();
  const checkNext: string[] = [];
  let downstreamCount = 0;

  if (model) {
    for (const file of affectedFiles) {
      const mod = findModuleForPath(model, path.resolve(cwd, file));
      if (mod) affectedModules.add(mod.name);
    }

    const downstreamModules = new Set<string>();
    const queue = [...affectedModules];
    while (queue.length > 0) {
      const modName = queue.shift() as string;
      for (const dep of getDependents(model, modName)) {
        if (!affectedModules.has(dep.name) && !downstreamModules.has(dep.name)) {
          downstreamModules.add(dep.name);
          queue.push(dep.name);
        }
      }
    }
    downstreamCount = downstreamModules.size;

    for (const modName of [...affectedModules, ...downstreamModules].slice(0, 3)) {
      const mod = model.modules.find((m) => m.name === modName);
      if (mod) checkNext.push(`${mod.name.replace(/^@[^/]+\//, "")} (\`${mod.relativePath}\`)`);
    }
  }

  const likelyTests = findLikelyTests(affectedFiles, symbolName);
  const totalRefs = result.refs.length + result.externalCount;
  const riskLevel = assessRisk(totalRefs, affectedModules.size, downstreamCount);

  return {
    confidence: result.confidence,
    affectedFiles,
    affectedModules,
    downstreamCount,
    checkNext,
    likelyTests,
    riskLevel,
    externalRefs: result.externalCount,
  };
}

function findLikelyTests(affectedFiles: Set<string>, _symbolName: string | null): string[] {
  const tests: string[] = [];
  for (const file of affectedFiles) {
    if (file.includes("test") || file.includes("spec") || file.includes("__tests__")) {
      tests.push(file);
    }
  }
  return tests.slice(0, 3);
}

function assessRisk(
  directCount: number,
  moduleCount: number,
  downstreamCount: number,
): "low" | "medium" | "high" {
  if (directCount > 10 || moduleCount > 3 || downstreamCount > 1) return "high";
  if (directCount > 3 || moduleCount > 1 || downstreamCount >= 1) return "medium";
  return "low";
}

// biome-ignore lint/complexity/useMaxParams: affected formatting keeps related inputs explicit for readability
function formatAffectedOutput(
  symbolName: string,
  result: { refs: GatheredRef[]; confidence: ConfidenceMode; externalCount: number },
  analysis: ImpactAnalysis,
  params: ActionParams,
  prioritySignals: import("../prioritization-signals.ts").PrioritySignalsSummary | null,
): string {
  const totalRefs = result.refs.length + analysis.externalRefs;
  const lines: string[] = [];

  lines.push(`# Affected: \`${symbolName}\``);
  lines.push("");
  const refSummary =
    analysis.externalRefs > 0
      ? `${totalRefs} refs (${result.refs.length} direct + ${analysis.externalRefs} external)`
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
  addReferencesSection(lines, result.refs, params.maxResults ?? 8);
  appendPrioritySignalsSection(lines, prioritySignals);
  addCheckNextSection(lines, analysis.checkNext);
  addTestsSection(lines, analysis.likelyTests);
  addAffectedNextQueries(lines, symbolName, analysis);

  return lines.join("\n");
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: risk level formatting with conditional branching
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

function addReferencesSection(lines: string[], refs: GatheredRef[], maxFiles: number): void {
  if (refs.length === 0) return;
  lines.push("## Direct References");
  const byFile = new Map<string, number[]>();
  for (const ref of refs) {
    const fileLines = byFile.get(ref.file) ?? [];
    fileLines.push(ref.line);
    byFile.set(ref.file, fileLines);
  }

  let shown = 0;
  for (const [file, fileLines] of byFile) {
    if (shown >= maxFiles) break;
    const lineStr = fileLines
      .slice(0, 5)
      .map((l) => `L${l}`)
      .join(", ");
    const extra = fileLines.length > 5 ? ` +${fileLines.length - 5} more` : "";
    lines.push(`- \`${file}\` ${lineStr}${extra}`);
    shown++;
  }
  if (byFile.size > maxFiles) {
    lines.push(`- _+${byFile.size - maxFiles} more files omitted_`);
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

function computeOmittedCount(
  externalRefs: number,
  affectedFileCount: number,
  params: ActionParams,
): number {
  return externalRefs + Math.max(0, affectedFileCount - (params.maxResults ?? 8));
}

function formatFileLevelAffectedHeader(
  targetCount: number,
  refSummary: string,
  analysis: ImpactAnalysis,
): string {
  return `**Risk: ${analysis.riskLevel.toUpperCase()}** | ${targetCount} exported target${targetCount !== 1 ? "s" : ""} | ${refSummary} | ${analysis.affectedFiles.size} file${analysis.affectedFiles.size !== 1 ? "s" : ""} | ${analysis.affectedModules.size} module${analysis.affectedModules.size !== 1 ? "s" : ""} | ${analysis.downstreamCount} downstream (${analysis.confidence})`;
}

function addAffectedNextQueries(
  lines: string[],
  symbolName: string,
  analysis: ImpactAnalysis,
): void {
  lines.push("## Next");
  if (analysis.checkNext.length > 0) {
    lines.push("- `code_intel brief` on the most-affected module for deeper context");
  }
  lines.push(
    `- \`code_intel callers\` with \`symbol: "${symbolName}"\` for grouped call-site detail`,
  );
  lines.push("");
}

function isDeclarationMatch(
  file: string,
  line: number,
  target: ResolvedTarget,
  cwd: string,
): boolean {
  return path.resolve(cwd, file) === target.file && line === target.displayLine;
}
