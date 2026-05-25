// Affected orchestration use-case — blast-radius analysis for a symbol change.
// Coordinates target resolution, reference collection, architecture analysis, and
// returns fully rendered content + details metadata.

import * as path from "node:path";
import {
  buildArchitectureModel,
  findModuleForPath,
  getDependents,
} from "@mrclrchtr/supi-code-runtime/api";
import {
  renderAffectedFileLevel,
  renderAffectedSingle,
} from "../presentation/markdown/affected.ts";
import { summarizePrioritySignalsForFiles } from "../prioritization-signals.ts";
import { resolveTarget } from "../resolve-target.ts";
import { isResolvedTargetGroup } from "../semantic-action-helpers.ts";
import type { SemanticSubstrate } from "../substrates/types.ts";
import type { ResolvedTarget, ResolvedTargetGroup } from "../target-resolution.ts";
import type { AffectedDetails, CodeIntelResult, ConfidenceMode } from "../types.ts";
import {
  aggregatePerTarget,
  collectReferences,
  type ReferenceCollection,
} from "./support/semantic-references.ts";

export interface AffectedInput {
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  exportedOnly?: boolean;
  maxResults?: number;
}

export interface AffectedDeps {
  cwd: string;
}

/** Execute the affected use-case — target resolution, reference collection, analysis, and rendering. */
export async function executeAffected(
  input: AffectedInput,
  deps: AffectedDeps,
): Promise<CodeIntelResult> {
  const semantic: SemanticSubstrate = await import("../substrates/lsp-adapter.ts").then((m) =>
    m.createSemanticSubstrate(deps.cwd),
  );
  const target = await resolveTarget(input, deps.cwd, semantic);

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
    return executeFileLevelAffected(target, input, deps.cwd, semantic);
  }

  const symbolName =
    target.name ?? `symbol at ${path.relative(deps.cwd, target.file)}:${target.displayLine}`;
  return executeSingleAffected(target, symbolName, input, deps.cwd, semantic);
}

// ── Single target ────────────────────────────────────────────────────

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

// biome-ignore lint/complexity/useMaxParams: substrate injection and analysis inputs keep related parameters explicit
async function executeSingleAffected(
  target: ResolvedTarget,
  symbolName: string,
  input: AffectedInput,
  cwd: string,
  semantic: SemanticSubstrate,
): Promise<CodeIntelResult> {
  const refs = await collectReferences(target, cwd, semantic);
  const model = await buildArchitectureModel(cwd);
  const analysis = analyzeImpact(refs, model, target.name, cwd);

  const prioritySignals = summarizePrioritySignalsForFiles(
    cwd,
    analysis.affectedFiles.size > 0 ? [...analysis.affectedFiles] : [target.file],
  );

  const content = renderAffectedSingle({
    symbolName,
    refs,
    analysis,
    maxResults: input.maxResults ?? 8,
    prioritySignals,
    target,
    cwd,
  });

  const details: AffectedDetails = {
    confidence: analysis.confidence,
    directCount: refs.refs.length,
    downstreamCount: analysis.downstreamCount,
    riskLevel: analysis.riskLevel,
    checkNext: analysis.checkNext,
    likelyTests: analysis.likelyTests,
    omittedCount: computeOmittedCount(analysis.externalRefs, analysis.affectedFiles.size, input),
    nextQueries: buildAffectedNextQueries(target, symbolName, cwd),
    prioritySignals,
  };

  return { content, details: { type: "affected" as const, data: details } };
}

// ── File-level target group ──────────────────────────────────────────

async function executeFileLevelAffected(
  targetGroup: ResolvedTargetGroup,
  input: AffectedInput,
  cwd: string,
  semantic: SemanticSubstrate,
): Promise<CodeIntelResult> {
  const perTarget = await Promise.all(
    targetGroup.targets.map(async (t) => ({
      target: t,
      refs: await collectReferences(t, cwd, semantic),
    })),
  );

  const aggregated = await aggregatePerTarget(targetGroup.targets, (t) =>
    collectReferences(t, cwd, semantic),
  );

  const model = await buildArchitectureModel(cwd);
  const analysis = analyzeImpact(aggregated, model, null, cwd);

  const prioritySignals = summarizePrioritySignalsForFiles(
    cwd,
    analysis.affectedFiles.size > 0 ? [...analysis.affectedFiles] : [targetGroup.file],
  );

  const content = renderAffectedFileLevel({
    targetGroup,
    perTarget,
    aggregated,
    analysis,
    maxResults: input.maxResults ?? 8,
    prioritySignals,
  });

  const details: AffectedDetails = {
    confidence: analysis.confidence,
    directCount: aggregated.refs.length,
    downstreamCount: analysis.downstreamCount,
    riskLevel: analysis.riskLevel,
    checkNext: analysis.checkNext,
    likelyTests: analysis.likelyTests,
    omittedCount: computeOmittedCount(analysis.externalRefs, analysis.affectedFiles.size, input),
    nextQueries: [
      "`code_brief` on the most-affected module for deeper context",
      "Use `file` + coordinates to inspect one exported target precisely",
    ],
    prioritySignals,
  };

  return { content, details: { type: "affected" as const, data: details } };
}

// ── Impact analysis ──────────────────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: impact analysis with downstream module traversal and multiple risk dimensions is clearer as one function
function analyzeImpact(
  result: ReferenceCollection,
  model: Awaited<ReturnType<typeof buildArchitectureModel>>,
  _symbolName: string | null,
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

  const likelyTests = findLikelyTests(affectedFiles);
  const riskLevel = assessRisk(
    result.refs.length + result.externalCount,
    affectedModules.size,
    downstreamCount,
  );

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

function findLikelyTests(affectedFiles: Set<string>): string[] {
  const tests: string[] = [];
  for (const file of affectedFiles) {
    if (file.includes("test") || file.includes("spec") || file.includes("__tests__")) {
      tests.push(file);
    }
  }
  return tests.slice(0, 3);
}

function assessRisk(
  totalRefs: number,
  moduleCount: number,
  downstreamCount: number,
): "low" | "medium" | "high" {
  if (totalRefs > 10 || moduleCount > 3 || downstreamCount > 1) return "high";
  if (totalRefs > 3 || moduleCount > 1 || downstreamCount >= 1) return "medium";
  return "low";
}

function computeOmittedCount(
  externalRefs: number,
  affectedFileCount: number,
  input: AffectedInput,
): number {
  return externalRefs + Math.max(0, affectedFileCount - (input.maxResults ?? 8));
}

function buildAffectedNextQueries(
  target: ResolvedTarget,
  symbolName: string,
  cwd: string,
): string[] {
  const relPath = path.relative(cwd, target.file);
  return [
    `\`code_brief\` with \`file: "${relPath}"\`, \`line: ${target.displayLine}\`, and \`character: ${target.displayCharacter}\` for deeper context around ${symbolName}`,
    `\`code_relations\` with \`kind: "callers"\`, \`file: "${relPath}"\`, \`line: ${target.displayLine}\`, and \`character: ${target.displayCharacter}\` for call sites`,
  ];
}
