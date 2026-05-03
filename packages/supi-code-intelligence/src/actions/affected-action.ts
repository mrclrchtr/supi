// Affected action — blast-radius analysis for a symbol change.

import * as path from "node:path";
import { getSessionLspService } from "@mrclrchtr/supi-lsp";
import { buildArchitectureModel, findModuleForPath, getDependents } from "../architecture.ts";
import { resolveTarget } from "../resolve-target.ts";
import { escapeRegex, normalizePath, runRipgrep } from "../search-helpers.ts";
import type { ActionParams } from "../tool-actions.ts";
import type { ConfidenceMode } from "../types.ts";

export async function executeAffectedAction(params: ActionParams, cwd: string): Promise<string> {
  const target = await resolveTarget(params, cwd);
  if (typeof target === "string") return target;

  const relPath = path.relative(cwd, target.file);
  const symbolName = target.name ?? `symbol at ${relPath}:${target.displayLine}`;

  const refs = await gatherReferences(target, params, cwd);
  const model = await buildArchitectureModel(cwd);
  const analysis = analyzeImpact(refs, model, target.name, cwd);

  return formatAffectedOutput(symbolName, refs, analysis, params);
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
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multi-source reference gathering with fallback logic
async function gatherReferences(
  target: { file: string; position: { line: number; character: number }; name: string | null },
  params: ActionParams,
  cwd: string,
): Promise<{ refs: GatheredRef[]; confidence: ConfidenceMode }> {
  const lspState = getSessionLspService(cwd);
  const refs: GatheredRef[] = [];

  if (lspState.kind === "ready") {
    const lspRefs = await lspState.service.references(target.file, target.position);
    if (lspRefs && lspRefs.length > 0) {
      // Filter out the declaration itself — LSP includes it with includeDeclaration.
      // The declaration is the symbol being changed, not something affected by the change.
      const filtered = filterOutDeclaration(lspRefs, target.file, target.position);
      for (const ref of filtered) {
        const filePath = ref.uri.startsWith("file://")
          ? decodeURIComponent(ref.uri.slice(7))
          : ref.uri;
        refs.push({ file: path.relative(cwd, filePath), line: ref.range.start.line + 1 });
      }
      return { refs, confidence: "semantic" };
    }
  }

  if (target.name) {
    const scopePath = params.path ? normalizePath(params.path, cwd) : cwd;
    const pattern = `\\b${escapeRegex(target.name)}\\b`;
    const matches = runRipgrep(pattern, scopePath, cwd, { maxMatches: 30 });
    for (const m of matches) {
      refs.push({ file: m.file, line: m.line });
    }
    return { refs, confidence: "heuristic" };
  }

  return { refs, confidence: "unavailable" };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: impact analysis with downstream module traversal
function analyzeImpact(
  result: { refs: GatheredRef[]; confidence: ConfidenceMode },
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

    // Transitive downstream: BFS to find all modules reachable through dependents
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
  const riskLevel = assessRisk(result.refs.length, affectedModules.size, downstreamCount);

  return {
    confidence: result.confidence,
    affectedFiles,
    affectedModules,
    downstreamCount,
    checkNext,
    likelyTests,
    riskLevel,
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

function formatAffectedOutput(
  symbolName: string,
  result: { refs: GatheredRef[]; confidence: ConfidenceMode },
  analysis: ImpactAnalysis,
  params: ActionParams,
): string {
  const _maxResults = params.maxResults ?? 8;
  const lines: string[] = [];

  lines.push(`# Affected: \`${symbolName}\``);
  lines.push("");
  lines.push(
    `**Risk: ${analysis.riskLevel.toUpperCase()}** | ${result.refs.length} direct ref${result.refs.length !== 1 ? "s" : ""} | ${analysis.affectedFiles.size} file${analysis.affectedFiles.size !== 1 ? "s" : ""} | ${analysis.affectedModules.size} module${analysis.affectedModules.size !== 1 ? "s" : ""} | ${analysis.downstreamCount} downstream (${analysis.confidence})`,
  );
  lines.push("");

  addRiskSection(lines, analysis, result.refs.length);
  addReferencesSection(lines, result.refs, params.maxResults ?? 8);
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

type LspRef = { uri: string; range: { start: { line: number; character: number } } };

/**
 * Filter out the declaration/definition location from LSP references.
 * LSP's `textDocument/references` includes the declaration by default;
 * for affected analysis, the declaration is the change site, not an affected reference.
 */
function filterOutDeclaration(
  refs: LspRef[],
  targetFile: string,
  targetPos: { line: number; character: number },
): LspRef[] {
  return refs.filter((ref) => {
    const filePath = ref.uri.startsWith("file://") ? decodeURIComponent(ref.uri.slice(7)) : ref.uri;
    if (filePath !== targetFile) return true;
    const start = ref.range.start;
    return start.line !== targetPos.line || start.character !== targetPos.character;
  });
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
