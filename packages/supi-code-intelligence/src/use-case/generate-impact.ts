// biome-ignore-all lint/style/noExcessiveLinesPerFile: shared impact orchestration stays together while the preferred and compatibility surfaces reuse one engine.
// Impact orchestration use-case — workflow-oriented blast-radius analysis.
// Shared engine for both `code_impact` (preferred) and `code_affected`
// (compatibility alias).

import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { CodeProvider } from "../analysis/context/request-context.ts";
import { discoverTestFilesForSource, isTestFilePath } from "../analysis/relations/tests.ts";
import { resolveTarget } from "../analysis/targeting/resolve-target.ts";
import { buildArchitectureModel, findModuleForPath, getDependents } from "../model.ts";
import {
  AFFECTED_COMPATIBILITY_NOTE,
  renderAffectedFileLevel,
  renderAffectedSingle,
} from "../presentation/markdown/affected.ts";
import {
  renderChangedFilesImpact,
  renderImpactFileLevel,
  renderImpactSingle,
} from "../presentation/markdown/impact.ts";
import { summarizePrioritySignalsForFiles } from "../prioritization-signals.ts";
import { isResolvedTargetGroup } from "../semantic-action-helpers.ts";
import type { ResolvedTarget, ResolvedTargetGroup } from "../target-resolution.ts";
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
  changedFiles?: string[];
  includeTests?: boolean;
}

export interface ImpactDeps {
  cwd: string;
  provider: CodeProvider | null;
  lspService: import("@mrclrchtr/supi-lsp/api").SessionLspServiceState;
}

export type ImpactSurface = "impact" | "affected";

type ImpactResultType = "impact" | "affected";

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
  /** Evidence provenance for test discovery, set when includeTests was requested. */
  testProvenance?: "semantic+conventions" | "conventions-only";
}

interface ChangedFileEntry {
  absPath: string;
  relPath: string;
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

/** Execute the shared impact use-case for the preferred or compatibility surface. */
export async function executeImpact(
  input: ImpactInput,
  deps: ImpactDeps,
  surface: ImpactSurface = "impact",
): Promise<CodeIntelResult> {
  const resultType = surfaceResultType(surface);

  if (input.changedFiles && input.changedFiles.length > 0) {
    return executeChangedFilesImpact(input, deps.cwd, deps.provider, surface, deps.lspService);
  }

  if (input.change && !input.file && !input.symbol) {
    return unavailableImpactResult(
      resultType,
      "**Unavailable:** `code_impact` has insufficient evidence for a change-only request. Provide `changedFiles` or resolve a target with `code_resolve` first.",
      [
        "Use `code_resolve` to resolve a precise target first",
        "Provide `changedFiles` from the workspace or diff you want to analyze",
      ],
    );
  }

  const semantic = deps.provider;
  const surfaceName = surfaceDisplayName(surface);

  if (!semantic) {
    return unavailableImpactResult(
      resultType,
      `**Error:** ${surfaceName} analysis requires an active code provider (LSP). Enable LSP and retry.`,
      ["Use `code_resolve` to resolve a target first"],
    );
  }

  const target = await resolveTarget(input, deps.cwd, semantic);

  if (typeof target === "string") {
    return unavailableImpactResult(resultType, target, [
      "Use `code_resolve` to resolve a target first",
    ]);
  }

  if (isResolvedTargetGroup(target)) {
    return executeFileLevelImpact(target, input, deps.cwd, semantic, surface, deps.lspService);
  }

  const symbolName =
    target.name ?? `symbol at ${path.relative(deps.cwd, target.file)}:${target.displayLine}`;
  return executeSingleImpact(
    target,
    symbolName,
    input,
    deps.cwd,
    semantic,
    surface,
    deps.lspService,
  );
}

// biome-ignore lint/complexity/useMaxParams: shared impact orchestration keeps substrate inputs explicit
async function executeSingleImpact(
  target: ResolvedTarget,
  symbolName: string,
  input: ImpactInput,
  cwd: string,
  semantic: CodeProvider,
  surface: ImpactSurface,
  lspService: import("@mrclrchtr/supi-lsp/api").SessionLspServiceState,
): Promise<CodeIntelResult> {
  const refs = await collectReferences(target, cwd, semantic);
  const model = await buildArchitectureModel(cwd);
  const analysis = await analyzeReferenceImpact(
    refs,
    model,
    cwd,
    shouldIncludeTests(surface, input.includeTests),
    semantic.references,
    [target.file], // seed the target file itself as affected
  );

  const prioritySignals = summarizePrioritySignalsForFiles(
    cwd,
    analysis.affectedFiles.size > 0 ? [...analysis.affectedFiles] : [target.file],
    lspService,
  );

  const maxResults = input.maxResults ?? 8;
  const content =
    surface === "impact"
      ? renderImpactSingle({
          symbolName,
          refs,
          analysis,
          maxResults,
          prioritySignals,
          target,
          cwd,
        })
      : renderAffectedSingle({
          symbolName,
          refs,
          analysis,
          maxResults,
          prioritySignals,
          target,
          cwd,
        });

  const detailsData = buildDetailsData(
    analysis,
    refs.refs.length,
    computeOmittedCount(analysis.externalRefs, analysis.affectedFiles.size, input),
    buildTargetNextQueries(target, symbolName, cwd),
    prioritySignals,
  );

  return {
    content,
    details: {
      type: surfaceResultType(surface),
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
  surface: ImpactSurface,
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
    shouldIncludeTests(surface, input.includeTests),
    semantic.references,
    targetGroup.targets.map((t) => t.file), // seed all target files
  );

  const prioritySignals = summarizePrioritySignalsForFiles(
    cwd,
    analysis.affectedFiles.size > 0 ? [...analysis.affectedFiles] : [targetGroup.file],
    lspService,
  );

  const maxResults = input.maxResults ?? 8;
  const content =
    surface === "impact"
      ? renderImpactFileLevel({
          targetGroup,
          perTarget,
          aggregated,
          analysis,
          maxResults,
          prioritySignals,
        })
      : renderAffectedFileLevel({
          targetGroup,
          perTarget,
          aggregated,
          analysis,
          maxResults,
          prioritySignals,
        });

  const detailsData = buildDetailsData(
    analysis,
    aggregated.refs.length,
    computeOmittedCount(analysis.externalRefs, analysis.affectedFiles.size, input),
    [
      "`code_context` on the most-affected module for deeper context",
      "Use `code_inspect` with file + line + character to inspect one exported target precisely",
    ],
    prioritySignals,
  );

  return {
    content,
    details: {
      type: surfaceResultType(surface),
      data: detailsData,
    },
  };
}

// biome-ignore lint/complexity/useMaxParams: shared changed-files orchestration keeps provider and LSP inputs explicit
async function executeChangedFilesImpact(
  input: ImpactInput,
  cwd: string,
  provider: CodeProvider | null,
  surface: ImpactSurface,
  lspService: import("@mrclrchtr/supi-lsp/api").SessionLspServiceState,
): Promise<CodeIntelResult> {
  const changedFiles = normalizeChangedFiles(input.changedFiles ?? [], cwd);
  if (changedFiles.length === 0) {
    return unavailableImpactResult(
      surfaceResultType(surface),
      "**Unavailable:** No readable changed files were provided for impact analysis.",
      [
        "Provide `changedFiles` with workspace-relative file paths",
        "Use `code_resolve` when you want symbol-level impact instead",
      ],
    );
  }

  const model = await buildArchitectureModel(cwd);
  const analysis = await analyzeChangedFiles(
    changedFiles,
    model,
    cwd,
    shouldIncludeTests(surface, input.includeTests),
  );
  const prioritySignals = summarizePrioritySignalsForFiles(
    cwd,
    changedFiles.map((entry) => entry.absPath),
    lspService,
  );
  const nextQueries = buildChangedFilesNextQueries(changedFiles, analysis);
  const evidenceNote =
    "\n**Evidence: structural** — impact limited to file-level module analysis and path-based test discovery. Use `code_resolve` for semantic impact.\n";
  const content =
    (surface === "impact"
      ? renderChangedFilesImpact({
          changedFiles: changedFiles.map((entry) => entry.relPath),
          analysis,
          prioritySignals,
        })
      : renderChangedFilesImpact({
          changedFiles: changedFiles.map((entry) => entry.relPath),
          analysis,
          prioritySignals,
          heading: "Affected",
          compatibilityNote: AFFECTED_COMPATIBILITY_NOTE,
        })) + evidenceNote;

  const detailsData = buildDetailsData(
    analysis,
    changedFiles.length,
    0,
    nextQueries,
    prioritySignals,
  );

  return {
    content,
    details: {
      type: surfaceResultType(surface),
      data: detailsData,
    },
  };
}

// biome-ignore lint/complexity/useMaxParams: seed-files parameter is explicit for testability
async function analyzeReferenceImpact(
  result: ReferenceCollection,
  model: Awaited<ReturnType<typeof buildArchitectureModel>>,
  cwd: string,
  includeTests: boolean,
  references: CodeProvider["references"] | undefined,
  seedFiles?: string[],
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

  const likelyTests = includeTests ? await collectLikelyTests(affectedFiles, cwd, references) : [];
  const likelyTestCommands = buildLikelyTestCommands(cwd, likelyTests);

  return {
    confidence: result.confidence,
    affectedFiles,
    affectedModules,
    downstreamCount,
    checkNext,
    likelyTests,
    likelyTestCommands,
    riskLevel: assessRisk(
      result.refs.length + result.externalCount,
      affectedModules.size,
      downstreamCount,
    ),
    externalRefs: result.externalCount,
  };
}

// biome-ignore lint/complexity/useMaxParams: shared changed-files analysis keeps file/module impact explicit
async function analyzeChangedFiles(
  changedFiles: ChangedFileEntry[],
  model: Awaited<ReturnType<typeof buildArchitectureModel>>,
  cwd: string,
  includeTests: boolean,
): Promise<ImpactAnalysis> {
  const affectedFiles = new Set(changedFiles.map((entry) => entry.absPath));
  const { affectedModules, checkNext, downstreamCount } = analyzeModelImpact(
    affectedFiles,
    model,
    cwd,
  );

  const likelyTests = includeTests ? await collectLikelyTests(affectedFiles, cwd, undefined) : [];
  const likelyTestCommands = buildLikelyTestCommands(cwd, likelyTests);

  return {
    confidence: "structural",
    affectedFiles,
    affectedModules,
    downstreamCount,
    checkNext,
    likelyTests,
    likelyTestCommands,
    testProvenance: includeTests ? ("conventions-only" as const) : undefined,
    riskLevel: assessRisk(changedFiles.length, affectedModules.size, downstreamCount),
    externalRefs: 0,
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

function normalizeChangedFiles(files: string[], cwd: string): ChangedFileEntry[] {
  const seen = new Set<string>();
  const result: ChangedFileEntry[] = [];

  for (const file of files) {
    const absPath = path.resolve(cwd, file);
    const relPath = path.relative(cwd, absPath) || file;
    if (seen.has(absPath)) continue;
    seen.add(absPath);
    result.push({ absPath, relPath });
  }

  return result;
}

async function collectLikelyTests(
  affectedFiles: Set<string>,
  cwd: string,
  references: CodeProvider["references"] | undefined,
): Promise<string[]> {
  const seen = new Set<string>();
  const likelyTests: string[] = [];

  for (const affFile of affectedFiles) {
    if (isTestFilePath(affFile)) {
      addLikelyTestPath(cwd, affFile, seen, likelyTests);
      continue;
    }

    const { files: discovered } = await discoverTestFilesForSource(affFile, {
      cwd,
      cap: 3,
      references,
    });
    for (const testFile of discovered) {
      addLikelyTestPath(cwd, testFile.absPath, seen, likelyTests);
    }
  }

  likelyTests.sort((a, b) => a.localeCompare(b));
  return likelyTests.slice(0, 3);
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

  while (true) {
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

function buildChangedFilesNextQueries(
  changedFiles: ChangedFileEntry[],
  analysis: ImpactAnalysis,
): string[] {
  const firstFile = changedFiles[0]?.relPath;
  const next: string[] = [];
  if (firstFile) {
    next.push(
      `\`code_context\` with \`file: "${firstFile}"\` for focused context on the changed file`,
    );
  }
  if (analysis.checkNext.length > 0) {
    next.push("`code_context` on the most-affected module for broader context");
  }
  return next;
}

// biome-ignore lint/complexity/useMaxParams: detail assembly keeps shared counts, queries, and signals explicit for both surfaces
function buildDetailsData(
  analysis: ImpactAnalysis,
  directCount: number,
  omittedCount: number,
  nextQueries: string[],
  prioritySignals: AffectedDetails["prioritySignals"],
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
    nextQueries,
    prioritySignals,
  };
}

function shouldIncludeTests(surface: ImpactSurface, includeTests: boolean | undefined): boolean {
  return surface === "affected" || includeTests === true;
}

function surfaceResultType(surface: ImpactSurface): ImpactResultType {
  return surface === "impact" ? "impact" : "affected";
}

function surfaceDisplayName(surface: ImpactSurface): string {
  return surface === "impact" ? "Impact" : "Affected";
}

function unavailableImpactResult(
  type: ImpactResultType,
  content: string,
  nextQueries: string[],
): CodeIntelResult {
  const data: AffectedDetails | ImpactDetails = {
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
      type,
      data,
    },
  };
}
