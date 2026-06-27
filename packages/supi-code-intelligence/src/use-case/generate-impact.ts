// biome-ignore-all lint/style/noExcessiveLinesPerFile: shared impact orchestration stays together in one cohesive use-case file.
// Impact orchestration use-case — workflow-oriented blast-radius analysis.

import { existsSync } from "node:fs";
import * as path from "node:path";
import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { CodeProvider } from "../analysis/context/request-context.ts";
import { isResolvedTargetGroup } from "../analysis/helpers.ts";
import {
  buildTestSurfaceDetails,
  isTestFilePath,
  type TestSurfaceDetails,
} from "../analysis/relations/tests.ts";
import { buildArchitectureModel, findModuleForPath, getDependents } from "../architecture/model.ts";
import { createEvidenceList, type EvidenceListMetadata } from "../presentation/evidence-list.ts";
import {
  renderChangeSetImpact,
  renderImpactFileLevel,
  renderImpactSingle,
} from "../presentation/markdown/impact.ts";
import { summarizePrioritySignalsForFiles } from "../project/prioritization-signals.ts";
import { resolveFileTargetGroup } from "../targeting/resolve-file.ts";
import { resolveTarget } from "../targeting/resolve-target.ts";
import type { ResolvedTargetData, ResolvedTargetGroupData } from "../targeting/types.ts";
import type { AffectedDetails, CodeIntelResult, ImpactDetails } from "../types.ts";
import {
  buildLikelyTestCommands,
  buildTestAnchorMap,
  type ChangeSetFileEntry,
  collectLikelyTests,
  normalizeChangeSet,
  type TestAnchorMap,
} from "./support/likely-tests.ts";
import {
  aggregatePerTarget,
  collectReferences,
  type ReferenceCollection,
} from "./support/semantic-references.ts";

export interface ImpactInput {
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  exportedOnly?: boolean;
  maxResults?: number;
  change?: string;
  changeSetFiles?: string[];
  includeTests?: boolean;
}

export interface ImpactDeps {
  cwd: string;
  provider: CodeProvider | null;
  lspService: import("@mrclrchtr/supi-lsp/api").SessionLspServiceState;
}

export type ImpactResultType = "impact";

interface ImpactAnalysis {
  confidence: ConfidenceMode;
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

interface ChangeSetSemanticImpact {
  targets: ResolvedTargetData[];
  refs: ReferenceCollection;
  references: CodeProvider["references"];
  outline?: CodeProvider["outline"];
}

/** Exported for backward-compatible unit-test access. Prefer `discoverTestFilesForSource` from tests.ts. */
export function findLikelyTests(
  affectedFiles: Set<string>,
  _cwd: string,
): Array<{ path: string; provenance: string }> {
  const seen = new Set<string>();
  const results: Array<{ path: string; provenance: string }> = [];

  // Pass 1: boundary-aware path heuristic on affected file paths
  for (const file of affectedFiles) {
    if (isTestFilePath(file)) {
      seen.add(file);
      results.push({ path: file, provenance: "name heuristic" });
    }
  }

  // Pass 2: companion-file discovery for affected files without test-like names
  const remaining = [...affectedFiles].filter((f) => !seen.has(f));
  for (const sourceFile of remaining) {
    const ext = path.extname(sourceFile);
    const stem = sourceFile.slice(0, ext.length > 0 ? -ext.length : undefined);
    for (const suffix of [".test", ".spec"]) {
      const candidate = `${stem}${suffix}${ext}`;
      if (!seen.has(candidate) && existsSync(candidate)) {
        seen.add(candidate);
        results.push({ path: candidate, provenance: "companion file" });
      }
    }
  }

  results.sort((a, b) => a.path.localeCompare(b.path));
  return results.slice(0, 3);
}

/** Execute the shared impact use-case. */
export async function executeImpact(
  input: ImpactInput,
  deps: ImpactDeps,
): Promise<CodeIntelResult> {
  if (input.changeSetFiles && input.changeSetFiles.length > 0) {
    return executeChangeSetImpact(input, deps.cwd, deps.provider, deps.lspService);
  }

  if (input.change && !input.file && !input.symbol) {
    return unavailableImpactResult(
      "**Unavailable:** `code_impact` has insufficient evidence for a change-only request. Provide `changeSetFiles` or resolve a target with `code_resolve` first.",
      [
        "Use `code_resolve` to resolve a precise target first",
        "Provide `changeSetFiles` with the workspace-relative files in the change set",
      ],
    );
  }

  const semantic = deps.provider;

  if (!semantic) {
    return unavailableImpactResult(
      "**Error:** Impact analysis requires an active code provider (LSP). Enable LSP and retry.",
      ["Use `code_resolve` to resolve a target first"],
    );
  }

  const target = await resolveTarget(input, deps.cwd, semantic);

  if (typeof target === "string") {
    return unavailableImpactResult(target, ["Use `code_resolve` to resolve a target first"]);
  }

  if (isResolvedTargetGroup(target)) {
    return executeFileLevelImpact(target, input, deps.cwd, semantic, deps.lspService);
  }

  const symbolName =
    target.name ?? `symbol at ${path.relative(deps.cwd, target.file)}:${target.displayLine}`;
  return executeSingleImpact(target, symbolName, input, deps.cwd, semantic, deps.lspService);
}

// biome-ignore lint/complexity/useMaxParams: shared impact orchestration keeps substrate inputs explicit
async function executeSingleImpact(
  target: ResolvedTargetData,
  symbolName: string,
  input: ImpactInput,
  cwd: string,
  semantic: CodeProvider,
  lspService: import("@mrclrchtr/supi-lsp/api").SessionLspServiceState,
): Promise<CodeIntelResult> {
  const refs = await collectReferences(target, cwd, semantic);
  const model = await buildArchitectureModel(cwd);
  const analysis = await analyzeReferenceImpact(
    refs,
    model,
    cwd,
    input.includeTests === true,
    semantic.references,
    [target.file], // seed the target file itself as affected
    buildTestAnchorMap([{ file: target.file, position: target.position }]),
    semantic.outline,
  );

  const prioritySignals = summarizePrioritySignalsForFiles(
    cwd,
    analysis.affectedFiles.size > 0 ? [...analysis.affectedFiles] : [target.file],
    lspService,
  );

  const maxResults = input.maxResults ?? 8;
  const content = renderImpactSingle({
    symbolName,
    refs,
    analysis,
    maxResults,
    prioritySignals,
    target,
    cwd,
  });

  const referenceEvidence = createEvidenceList({
    key: "references.locations",
    items: refs.refs,
    maxResults,
  }).metadata;
  const detailsData = buildDetailsData(
    analysis,
    refs.refs.length,
    computeOmittedCount(analysis.externalRefs, analysis.affectedFiles.size, input),
    buildTargetNextQueries(target, symbolName, cwd),
    prioritySignals,
    [referenceEvidence],
  );

  return {
    content,
    details: {
      type: "impact",
      data: detailsData,
    },
  };
}

// biome-ignore lint/complexity/useMaxParams: shared impact orchestration keeps related substrate inputs explicit
async function executeFileLevelImpact(
  targetGroup: ResolvedTargetGroupData,
  input: ImpactInput,
  cwd: string,
  semantic: CodeProvider,
  lspService: import("@mrclrchtr/supi-lsp/api").SessionLspServiceState,
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
  const analysis = await analyzeReferenceImpact(
    aggregated,
    model,
    cwd,
    input.includeTests === true,
    semantic.references,
    targetGroup.targets.map((t) => t.file), // seed all target files
    buildTestAnchorMap(targetGroup.targets.map((t) => ({ file: t.file, position: t.position }))),
    semantic.outline,
  );

  const prioritySignals = summarizePrioritySignalsForFiles(
    cwd,
    analysis.affectedFiles.size > 0 ? [...analysis.affectedFiles] : [targetGroup.file],
    lspService,
  );

  const maxResults = input.maxResults ?? 8;
  const content = renderImpactFileLevel({
    targetGroup,
    perTarget,
    aggregated,
    analysis,
    maxResults,
    prioritySignals,
    cwd,
  });

  const detailsData = buildDetailsData(
    analysis,
    aggregated.refs.length,
    computeOmittedCount(analysis.externalRefs, analysis.affectedFiles.size, input),
    [
      "`code_orientation` on the most-affected module for deeper orientation",
      "Use `code_inspect` with file + line + character to inspect one exported target precisely",
    ],
    prioritySignals,
  );

  return {
    content,
    details: {
      type: "impact",
      data: detailsData,
    },
  };
}

async function executeChangeSetImpact(
  input: ImpactInput,
  cwd: string,
  provider: CodeProvider | null,
  lspService: import("@mrclrchtr/supi-lsp/api").SessionLspServiceState,
): Promise<CodeIntelResult> {
  const changeSetFiles = normalizeChangeSet(input.changeSetFiles ?? [], cwd);
  if (changeSetFiles.length === 0) {
    return unavailableImpactResult(
      "**Unavailable:** No readable change-set files were provided for impact analysis.",
      [
        "Provide `changeSetFiles` with workspace-relative file paths",
        "Use `code_resolve` when you want symbol-level impact instead",
      ],
    );
  }

  const model = await buildArchitectureModel(cwd);
  const semanticImpact = await collectChangeSetSemanticImpact(changeSetFiles, cwd, provider);
  const analysis = await analyzeChangeSet({
    changeSetFiles,
    model,
    cwd,
    includeTests: input.includeTests === true,
    semanticImpact,
  });
  const prioritySignals = summarizePrioritySignalsForFiles(
    cwd,
    changeSetFiles.map((entry) => entry.absPath),
    lspService,
  );
  const nextQueries = buildChangeSetNextQueries(changeSetFiles, analysis, semanticImpact);
  const upgradeSuggestion = buildSemanticUpgradeSuggestion(changeSetFiles, semanticImpact);
  const evidenceNote =
    analysis.confidence === "semantic"
      ? "\n**Evidence: semantic+structural** — semantic references for symbols defined in change-set files were merged with file-level module analysis and bounded test discovery.\n"
      : `\n**Evidence: structural** — impact limited to file-level module analysis and path-based test discovery.\n${upgradeSuggestion}\n`;
  const content =
    renderChangeSetImpact({
      changeSetFiles: changeSetFiles.map((entry) => entry.relPath),
      analysis,
      prioritySignals,
    }) + evidenceNote;

  const detailsData = buildDetailsData(
    analysis,
    changeSetFiles.length,
    0,
    nextQueries,
    prioritySignals,
  );

  return {
    content,
    details: {
      type: "impact",
      data: detailsData,
    },
  };
}

async function collectChangeSetSemanticImpact(
  changeSetFiles: ChangeSetFileEntry[],
  cwd: string,
  provider: CodeProvider | null,
): Promise<ChangeSetSemanticImpact | null> {
  if (!provider?.references) return null;

  const targets: ResolvedTargetData[] = [];
  for (const entry of changeSetFiles) {
    try {
      const outcome = await resolveFileTargetGroup(entry.relPath, cwd, {
        semantic: provider,
        structural: provider,
      });
      if (outcome.kind === "resolved") {
        targets.push(...outcome.group.targets);
      }
    } catch {
      // Keep change-set analysis best-effort: structural impact still applies.
    }
  }

  const cappedTargets = targets.slice(0, 25);
  if (cappedTargets.length === 0) return null;

  const refs = await aggregatePerTarget(cappedTargets, (target) =>
    collectReferences(target, cwd, provider),
  );
  if (refs.confidence !== "semantic" || (refs.refs.length === 0 && refs.externalCount === 0)) {
    return null;
  }

  return {
    targets: cappedTargets,
    refs,
    references: provider.references,
    outline: provider.outline,
  };
}

function collectUniqueRefFiles(refs: ReferenceCollection): string[] {
  return [...new Set(refs.refs.map((ref) => ref.file))].sort((a, b) => a.localeCompare(b));
}

// biome-ignore lint/complexity/useMaxParams: seed-files parameter is explicit for testability
async function analyzeReferenceImpact(
  result: ReferenceCollection,
  model: Awaited<ReturnType<typeof buildArchitectureModel>>,
  cwd: string,
  includeTests: boolean,
  references: CodeProvider["references"] | undefined,
  seedFiles?: string[],
  testAnchors?: TestAnchorMap,
  outline?: CodeProvider["outline"],
): Promise<ImpactAnalysis> {
  const affectedFiles = new Set(result.refs.map((r) => path.resolve(cwd, r.file)));

  // Seed the target file(s) so zero-reference targets still have affected evidence
  if (seedFiles) {
    for (const f of seedFiles) {
      affectedFiles.add(path.resolve(cwd, f));
    }
  }

  const { affectedModules, checkNext, downstreamCount } = analyzeModelImpact(
    affectedFiles,
    model,
    cwd,
  );

  const likelyTestsResult = includeTests
    ? await collectLikelyTests(affectedFiles, cwd, references, testAnchors, undefined, outline)
    : null;
  const likelyTests = likelyTestsResult?.paths ?? [];
  const likelyTestCommands = buildLikelyTestCommands(cwd, likelyTests);
  const tests =
    likelyTestsResult === null
      ? undefined
      : buildTestSurfaceDetails(
          {
            status: likelyTestsResult.files.length > 0 ? "found" : "empty",
            provenance: likelyTestsResult.provenance,
            files: likelyTestsResult.files,
          },
          cwd,
        );

  return {
    confidence: result.confidence,
    affectedFiles,
    affectedModules,
    downstreamCount,
    checkNext,
    likelyTests,
    likelyTestCommands,
    tests,
    riskLevel: assessRisk(
      result.refs.length + result.externalCount,
      affectedModules.size,
      downstreamCount,
    ),
    externalRefs: result.externalCount,
  };
}

interface AnalyzeChangeSetOptions {
  changeSetFiles: ChangeSetFileEntry[];
  model: Awaited<ReturnType<typeof buildArchitectureModel>>;
  cwd: string;
  includeTests: boolean;
  semanticImpact: ChangeSetSemanticImpact | null;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: change-set impact merges structural, semantic, test, and risk evidence in one staged result.
async function analyzeChangeSet(options: AnalyzeChangeSetOptions): Promise<ImpactAnalysis> {
  const { changeSetFiles, model, cwd, includeTests, semanticImpact } = options;
  const affectedFiles = new Set(changeSetFiles.map((entry) => entry.absPath));
  if (semanticImpact) {
    for (const ref of semanticImpact.refs.refs) {
      affectedFiles.add(path.resolve(cwd, ref.file));
    }
  }

  const { affectedModules, checkNext, downstreamCount } = analyzeModelImpact(
    affectedFiles,
    model,
    cwd,
  );

  const likelyTestsResult = includeTests
    ? await collectLikelyTests(
        affectedFiles,
        cwd,
        semanticImpact?.references,
        semanticImpact ? buildTestAnchorMap(semanticImpact.targets) : undefined,
        semanticImpact ? undefined : "conventions-only",
        semanticImpact?.outline,
      )
    : null;
  const likelyTests = likelyTestsResult?.paths ?? [];
  const likelyTestCommands = buildLikelyTestCommands(cwd, likelyTests);
  const tests =
    likelyTestsResult === null
      ? undefined
      : buildTestSurfaceDetails(
          {
            status: likelyTestsResult.files.length > 0 ? "found" : "empty",
            provenance: likelyTestsResult.provenance,
            files: likelyTestsResult.files,
          },
          cwd,
        );

  const semanticRefCount = semanticImpact ? semanticImpact.refs.refs.length : 0;
  const externalRefs = semanticImpact ? semanticImpact.refs.externalCount : 0;
  const semanticRefFiles = semanticImpact ? collectUniqueRefFiles(semanticImpact.refs) : undefined;

  return {
    confidence: semanticImpact ? "semantic" : "structural",
    affectedFiles,
    affectedModules,
    downstreamCount,
    checkNext,
    likelyTests,
    likelyTestCommands,
    tests,
    riskLevel: assessRisk(
      changeSetFiles.length + semanticRefCount,
      affectedModules.size,
      downstreamCount,
    ),
    externalRefs,
    semanticRefFiles,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: module-impact traversal keeps affected/downstream/check-next logic together for predictable evidence collection
function analyzeModelImpact(
  affectedFiles: Set<string>,
  model: Awaited<ReturnType<typeof buildArchitectureModel>>,
  cwd: string,
): Pick<ImpactAnalysis, "affectedModules" | "checkNext" | "downstreamCount"> {
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

  return { affectedModules, checkNext, downstreamCount };
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
  input: ImpactInput,
): number {
  return externalRefs + Math.max(0, affectedFileCount - (input.maxResults ?? 8));
}

function buildTargetNextQueries(
  target: ResolvedTargetData,
  symbolName: string,
  cwd: string,
): string[] {
  const relPath = path.relative(cwd, target.file);
  return [
    `\`code_inspect\` with \`file: "${relPath}"\`, \`line: ${target.displayLine}\`, and \`character: ${target.displayCharacter}\` for point facts around ${symbolName}`,
    `\`code_graph\`, \`file: "${relPath}"\`, \`line: ${target.displayLine}\`, and \`character: ${target.displayCharacter}\` for reference sites`,
  ];
}

function buildChangeSetNextQueries(
  changeSetFiles: ChangeSetFileEntry[],
  analysis: ImpactAnalysis,
  semanticImpact: ChangeSetSemanticImpact | null,
): string[] {
  const firstFile = changeSetFiles[0]?.relPath;
  const next: string[] = [];
  if (firstFile) {
    next.push(
      `\`code_orientation\` with \`focus: "${firstFile}"\` for focused orientation on the change-set file`,
    );
  }
  if (analysis.checkNext.length > 0) {
    next.push("`code_orientation` on the most-affected module for broader orientation");
  }
  if (analysis.confidence !== "semantic" && firstFile) {
    const symbolHint = semanticImpact?.targets[0]?.name ?? "<primary exported symbol>";
    next.push(
      `For semantic impact, run \`code_resolve(query="${symbolHint}", scope="${firstFile}")\` then \`code_impact(targetId="<result>", change="<your change>")\``,
    );
  }
  return next;
}

function buildSemanticUpgradeSuggestion(
  changeSetFiles: ChangeSetFileEntry[],
  semanticImpact: ChangeSetSemanticImpact | null,
): string {
  const firstFile = changeSetFiles[0]?.relPath;
  if (!firstFile) return "";
  const symbolHint = semanticImpact?.targets[0]?.name ?? "<primary exported symbol>";
  return `For semantic impact, run \`code_resolve(query="${symbolHint}", scope="${firstFile}")\` then \`code_impact(targetId="<result>", change="<your change>")\`.`;
}

// biome-ignore lint/complexity/useMaxParams: detail assembly keeps shared counts, queries, and signals explicit for both surfaces
function buildDetailsData(
  analysis: ImpactAnalysis,
  directCount: number,
  omittedCount: number,
  nextQueries: string[],
  prioritySignals: AffectedDetails["prioritySignals"],
  evidenceLists: EvidenceListMetadata[] = [],
): AffectedDetails | ImpactDetails {
  return {
    confidence: analysis.confidence,
    directCount,
    downstreamCount: analysis.downstreamCount,
    riskLevel: analysis.riskLevel,
    checkNext: analysis.checkNext,
    likelyTests: analysis.likelyTests,
    likelyTestCommands: analysis.likelyTestCommands,
    omittedCount,
    evidenceLists,
    nextQueries,
    prioritySignals,
    tests: analysis.tests,
  };
}

function unavailableImpactResult(content: string, nextQueries: string[]): CodeIntelResult {
  const data: ImpactDetails = {
    confidence: "unavailable",
    directCount: 0,
    downstreamCount: 0,
    riskLevel: "low",
    checkNext: [],
    likelyTests: [],
    likelyTestCommands: [],
    omittedCount: 0,
    nextQueries,
  };

  return {
    content,
    details: {
      type: "impact",
      data,
    },
  };
}
