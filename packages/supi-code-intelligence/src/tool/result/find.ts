import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { EvidenceListMetadata } from "../../analysis/evidence.ts";
import type { TestSurfaceDetails } from "../../analysis/tests/test-discovery.ts";
import type { SearchDetails } from "./types.ts";

export interface FindResultAssemblyInput {
  confidence: ConfidenceMode;
  scope: string | null;
  candidateCount: number;
  omittedCount?: number;
  evidenceLists?: EvidenceListMetadata[];
  nextQueries: string[];
  tests?: TestSurfaceDetails;
}

/** Assemble code_find/search-family details before presentation adapters render content. */
export function assembleFindResult(input: FindResultAssemblyInput): SearchDetails {
  return {
    confidence: input.confidence,
    scope: input.scope,
    candidateCount: input.candidateCount,
    omittedCount:
      input.omittedCount ??
      (input.evidenceLists ?? []).reduce((sum, list) => sum + (list.omittedCount ?? 0), 0),
    evidenceLists: input.evidenceLists,
    nextQueries: input.nextQueries,
    tests: input.tests,
  };
}
