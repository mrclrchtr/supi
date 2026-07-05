import type { EvidenceListMetadata } from "../../analysis/evidence.ts";
import type { PrioritySignalsSummary } from "../../analysis/signals/project.ts";
import type { CodeIntelResult } from "../../types/index.ts";
import type { ImpactAnalysis } from "../impact/types.ts";
import type { AffectedDetails, ImpactDetails } from "./types.ts";

// biome-ignore lint/complexity/useMaxParams: detail assembly keeps shared counts, queries, and signals explicit for both surfaces
export function assembleImpactDetails(
  analysis: ImpactAnalysis,
  directCount: number,
  omittedCount: number,
  nextQueries: string[],
  prioritySignals: PrioritySignalsSummary | null,
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

export function unavailableImpactResult(content: string, nextQueries: string[]): CodeIntelResult {
  return {
    content,
    details: {
      type: "impact",
      data: {
        confidence: "unavailable",
        directCount: 0,
        downstreamCount: 0,
        riskLevel: "low" as const,
        checkNext: [],
        likelyTests: [],
        likelyTestCommands: [],
        omittedCount: 0,
        nextQueries,
      },
    },
  };
}
