/**
 * Structured `details` builders for tool error paths.
 *
 * Keeps the contract honest: callers can check `details.data.confidence`
 * instead of parsing error strings.
 */

import type {
  ContextDetails,
  HealthDetails,
  ImpactDetails,
  InspectDetails,
  ResolveDetails,
  SearchDetails,
} from "../types.ts";

export function unavailableSearchDetails(
  scope: string | null,
  nextQueries: string[],
): { type: "search"; data: SearchDetails } {
  return {
    type: "search" as const,
    data: {
      confidence: "unavailable",
      scope,
      candidateCount: 0,
      omittedCount: 0,
      nextQueries,
    },
  };
}

export function unavailableContextDetails(nextQueries: string[]): {
  type: "context";
  data: ContextDetails;
} {
  return {
    type: "context" as const,
    data: {
      confidence: "unavailable",
      task: null,
      focusTarget: null,
      requestedSections: [],
      renderedSections: [],
      omittedCount: 0,
      nextQueries,
    },
  };
}

export function unavailableResolveDetails(nextQueries: string[]): {
  type: "resolve";
  data: ResolveDetails;
} {
  return {
    type: "resolve" as const,
    data: {
      confidence: "unavailable",
      targetCount: 0,
      omittedCount: 0,
      targets: [],
      nextQueries,
    },
  };
}

export function unavailableInspectDetails(
  focusTarget: string,
  nextQueries: string[],
): { type: "inspect"; data: InspectDetails } {
  return {
    type: "inspect" as const,
    data: {
      confidence: "unavailable",
      focusTarget,
      unavailableSections: [],
      nextQueries,
    },
  };
}

export function unavailableImpactDetails(nextQueries: string[]): {
  type: "impact";
  data: ImpactDetails;
} {
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
  return { type: "impact", data };
}

export function unavailableHealthDetails(reason: string): {
  type: "health";
  data: HealthDetails;
} {
  return {
    type: "health" as const,
    data: {
      lspAvailable: false,
      lspStatus: reason,
      recovered: false,
      diagnosticFileCount: 0,
      serverCount: 0,
    },
  };
}
