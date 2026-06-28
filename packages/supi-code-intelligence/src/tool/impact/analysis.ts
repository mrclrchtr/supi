// Impact analysis — shared analysis functions for impact orchestration.
// Extracted from orchestrate.ts to keep per-mode files focused.

import * as path from "node:path";
import type { buildArchitectureModel } from "../../analysis/architecture/discovery.ts";
import { findModuleForPath, getDependents } from "../../analysis/architecture/model.ts";
import type { EvidenceListMetadata } from "../../analysis/evidence.ts";
import type { CodeProvider } from "../../analysis/provider.ts";
import type { ReferenceCollection } from "../../analysis/references/semantic-refs.ts";
import type { ResolvedTargetData } from "../../analysis/target/types.ts";
import {
  buildLikelyTestCommands,
  buildTestAnchorMap,
  type ChangeSetFileEntry,
  collectLikelyTests,
  type TestAnchorMap,
} from "../../analysis/tests/likely-tests.ts";
import { buildTestSurfaceDetails } from "../../analysis/tests/test-discovery.ts";
import type { AffectedDetails, ImpactDetails } from "../../types/index.ts";
import type { ImpactAnalysis } from "./types.ts";

// ── Shared analysis ────────────────────────────────────────────────────

/** Seed files parameter is explicit for testability. */
// biome-ignore lint/complexity/useMaxParams: explicit params for testability
export async function analyzeReferenceImpact(
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

export interface AnalyzeChangeSetOptions {
  changeSetFiles: ChangeSetFileEntry[];
  model: Awaited<ReturnType<typeof buildArchitectureModel>>;
  cwd: string;
  includeTests: boolean;
  semanticImpact: ChangeSetSemanticImpact | null;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: change-set impact merges structural, semantic, test, and risk evidence in one staged result.
export async function analyzeChangeSet(options: AnalyzeChangeSetOptions): Promise<ImpactAnalysis> {
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

export interface ChangeSetSemanticImpact {
  targets: ResolvedTargetData[];
  refs: ReferenceCollection;
  references: CodeProvider["references"];
  outline?: CodeProvider["outline"];
}

export function collectUniqueRefFiles(refs: ReferenceCollection): string[] {
  return [...new Set(refs.refs.map((ref) => ref.file))].sort((a, b) => a.localeCompare(b));
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: module-impact traversal keeps affected/downstream/check-next logic together
export function analyzeModelImpact(
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

export function assessRisk(
  totalRefs: number,
  moduleCount: number,
  downstreamCount: number,
): "low" | "medium" | "high" {
  if (totalRefs > 10 || moduleCount > 3 || downstreamCount > 1) return "high";
  if (totalRefs > 3 || moduleCount > 1 || downstreamCount >= 1) return "medium";
  return "low";
}

export function computeOmittedCount(
  externalRefs: number,
  affectedFileCount: number,
  maxResults?: number,
): number {
  return externalRefs + Math.max(0, affectedFileCount - (maxResults ?? 8));
}

// biome-ignore lint/complexity/useMaxParams: detail assembly keeps shared counts, queries, and signals explicit for both surfaces
export function buildDetailsData(
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
