// biome-ignore-all lint/style/noExcessiveLinesPerFile: shared impact orchestration stays together in one cohesive use-case file.
// Impact orchestration use-case — workflow-oriented blast-radius analysis.

import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import type { CodePosition, ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { CodeProvider } from "../analysis/context/request-context.ts";
import {
  buildTestSurfaceDetails,
  type DiscoveredTestFile,
  describeTestFile,
  discoverTestFilesForSource,
  isTestFilePath,
  type TestSurfaceDetails,
} from "../analysis/relations/tests.ts";
import { resolveTarget } from "../analysis/targeting/resolve-target.ts";
import { createEvidenceList, type EvidenceListMetadata } from "../evidence-list.ts";
import { buildArchitectureModel, findModuleForPath, getDependents } from "../model.ts";
import {
  renderChangeSetImpact,
  renderImpactFileLevel,
  renderImpactSingle,
} from "../presentation/markdown/impact.ts";
import { summarizePrioritySignalsForFiles } from "../prioritization-signals.ts";
import { isResolvedTargetGroup } from "../semantic-action-helpers.ts";
import type { ResolvedTarget, ResolvedTargetGroup } from "../target-resolution.ts";
import { resolveFileTargetGroup } from "../targeting/resolve-file.ts";
import type { AffectedDetails, CodeIntelResult, ImpactDetails } from "../types.ts";
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

interface ChangeSetFileEntry {
  absPath: string;
  relPath: string;
}

interface ChangeSetSemanticImpact {
  targets: ResolvedTarget[];
  refs: ReferenceCollection;
  references: CodeProvider["references"];
  outline?: CodeProvider["outline"];
}

type TestAnchorMap = Map<string, CodePosition[]>;

interface LikelyTestsResult {
  paths: string[];
  files: Array<Pick<DiscoveredTestFile, "absPath" | "testNames" | "labelStatus">>;
  provenance?: "semantic+conventions" | "conventions-only";
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
  target: ResolvedTarget,
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
  targetGroup: ResolvedTargetGroup,
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

  const targets: ResolvedTarget[] = [];
  for (const entry of changeSetFiles) {
    try {
      const outcome = await resolveFileTargetGroup(entry.relPath, cwd, {
        semantic: provider,
        structural: provider,
      });
      if (outcome.kind === "resolved") {
        targets.push(...(outcome.group.targets as ResolvedTarget[]));
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

function normalizeChangeSet(files: string[], cwd: string): ChangeSetFileEntry[] {
  const seen = new Set<string>();
  const result: ChangeSetFileEntry[] = [];

  for (const file of files) {
    const absPath = path.resolve(cwd, file);
    const relPath = path.relative(cwd, absPath) || file;
    if (seen.has(absPath)) continue;
    seen.add(absPath);
    result.push({ absPath, relPath });
  }

  return result;
}

function buildTestAnchorMap(
  entries: Array<{ file: string; position: CodePosition }>,
): TestAnchorMap {
  const map: TestAnchorMap = new Map();
  for (const entry of entries) {
    const key = path.resolve(entry.file);
    const positions = map.get(key) ?? [];
    positions.push(entry.position);
    map.set(key, positions);
  }
  return map;
}

function dedupeDiscoveredTestFiles(
  files: Array<Pick<DiscoveredTestFile, "absPath" | "testNames" | "labelStatus">>,
): Array<Pick<DiscoveredTestFile, "absPath" | "testNames" | "labelStatus">> {
  const byPath = new Map<
    string,
    Pick<DiscoveredTestFile, "absPath" | "testNames" | "labelStatus">
  >();

  for (const file of files) {
    const existing = byPath.get(file.absPath);
    if (!existing) {
      byPath.set(file.absPath, file);
      continue;
    }

    if (existing.labelStatus !== "recognized" && file.labelStatus === "recognized") {
      byPath.set(file.absPath, file);
    }
  }

  return [...byPath.values()].sort((left, right) => left.absPath.localeCompare(right.absPath));
}

// biome-ignore lint/complexity/useMaxParams: shared likely-test collection keeps evidence inputs explicit
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: discovery aggregation across direct tests, semantic references, and conventions is clearest in one helper
async function collectLikelyTests(
  affectedFiles: Set<string>,
  cwd: string,
  references: CodeProvider["references"] | undefined,
  testAnchors?: TestAnchorMap,
  fallbackProvenance?: "semantic+conventions" | "conventions-only",
  outline?: CodeProvider["outline"],
): Promise<LikelyTestsResult> {
  const seen = new Set<string>();
  const likelyTests: string[] = [];
  const discoveredFiles: Array<Pick<DiscoveredTestFile, "absPath" | "testNames" | "labelStatus">> =
    [];
  let provenance = fallbackProvenance;

  for (const affFile of affectedFiles) {
    if (isTestFilePath(affFile)) {
      addLikelyTestPath(cwd, affFile, seen, likelyTests);
      const described = await describeTestFile(affFile, { outline, cwd });
      discoveredFiles.push(described);
      continue;
    }

    const positions = testAnchors?.get(path.resolve(affFile)) ?? [];
    const discoveries =
      positions.length > 0
        ? await Promise.all(
            positions.map((position) =>
              discoverTestFilesForSource(affFile, {
                cwd,
                cap: 3,
                references,
                outline,
                position,
              }),
            ),
          )
        : [
            await discoverTestFilesForSource(affFile, {
              cwd,
              cap: 3,
              references,
              outline,
            }),
          ];

    for (const discovery of discoveries) {
      if (discovery.kind !== "found") continue;
      if (discovery.provenance === "semantic+conventions") {
        provenance = "semantic+conventions";
      } else if (!provenance) {
        provenance = discovery.provenance;
      }
    }

    const discovered = dedupeDiscoveredTestFiles(discoveries.flatMap((entry) => entry.files));
    for (const testFile of discovered) {
      addLikelyTestPath(cwd, testFile.absPath, seen, likelyTests);
      discoveredFiles.push(testFile);
    }
  }

  const files = dedupeDiscoveredTestFiles(discoveredFiles).slice(0, 3);
  likelyTests.sort((a, b) => a.localeCompare(b));
  return { paths: likelyTests.slice(0, 3), files, provenance };
}

function addLikelyTestPath(
  cwd: string,
  absPath: string,
  seen: Set<string>,
  likelyTests: string[],
): void {
  const relPath = path.relative(cwd, absPath) || absPath;
  if (seen.has(relPath)) return;
  seen.add(relPath);
  likelyTests.push(relPath);
}

function buildLikelyTestCommands(cwd: string, likelyTests: string[]): string[] {
  if (likelyTests.length === 0 || !detectVitestWorkspace(cwd)) {
    return [];
  }

  return likelyTests
    .filter((testPath) => VITEST_RUNNABLE_EXTENSIONS.has(path.extname(testPath)))
    .slice(0, 3)
    .map((relTest) => `pnpm vitest run ${relTest} --reporter=verbose`);
}

const VITEST_RUNNABLE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);

const VITEST_CONFIG_FILES = [
  "vitest.config.ts",
  "vitest.config.mts",
  "vitest.config.cts",
  "vitest.config.js",
  "vitest.config.mjs",
  "vitest.config.cjs",
  "vitest.workspace.ts",
  "vitest.workspace.mts",
  "vitest.workspace.cts",
  "vitest.workspace.js",
  "vitest.workspace.mjs",
  "vitest.workspace.cjs",
];

function detectVitestWorkspace(cwd: string): boolean {
  let current = path.resolve(cwd);

  for (;;) {
    if (packageJsonUsesVitest(current) || hasVitestConfig(current)) {
      return true;
    }
    if (existsSync(path.join(current, ".git"))) {
      return false;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return false;
    }
    current = parent;
  }
}

function packageJsonUsesVitest(dir: string): boolean {
  const packageJsonPath = path.join(dir, "package.json");
  if (!existsSync(packageJsonPath)) {
    return false;
  }

  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };

    if (Object.values(parsed.scripts ?? {}).some((script) => script.includes("vitest"))) {
      return true;
    }

    return [
      parsed.dependencies,
      parsed.devDependencies,
      parsed.peerDependencies,
      parsed.optionalDependencies,
    ].some((deps) => Boolean(deps?.vitest));
  } catch {
    return false;
  }
}

function hasVitestConfig(dir: string): boolean {
  return VITEST_CONFIG_FILES.some((file) => existsSync(path.join(dir, file)));
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

function buildTargetNextQueries(target: ResolvedTarget, symbolName: string, cwd: string): string[] {
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
