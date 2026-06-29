import type { CodeIntelResult } from "../../types/index.ts";

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
