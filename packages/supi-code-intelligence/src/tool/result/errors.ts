/**
 * Tool-result error assembly factories for code-intelligence tool executors.
 *
 * Every factory returns a complete {@link CodeIntelResult} (content + typed
 * details) so executors never need to inline the `{ content, details }`
 * wrapper. Returned tool errors are result assembly concerns; whole-tool
 * capability failures may still throw so PI marks the tool call as failed.
 */

import type {
  CodeIntelResult,
  ContextDetails,
  HealthDetails,
  InspectDetails,
  ResolveDetails,
  SearchDetails,
} from "../../types/index.ts";

// ── Combined error-result factories (preferred) ──────────────────────

/** Full error result for search-family tools (code_find, code_graph, code_refactor_plan). */
export function searchErrorResult(
  content: string,
  opts?: { scope?: string | null; nextQueries?: string[] },
): CodeIntelResult {
  return {
    content,
    details: {
      type: "search" as const,
      data: {
        confidence: "unavailable" as const,
        scope: opts?.scope ?? null,
        candidateCount: 0,
        omittedCount: 0,
        nextQueries: opts?.nextQueries ?? [],
      },
    },
  };
}

/** Full error result for code_orientation (context-type details). */
export function contextErrorResult(
  content: string,
  opts?: { nextQueries?: string[] },
): CodeIntelResult {
  return {
    content,
    details: {
      type: "context" as const,
      data: {
        confidence: "unavailable" as const,
        task: null,
        focusTarget: null,
        requestedSections: [],
        renderedSections: [],
        omittedCount: 0,
        nextQueries: opts?.nextQueries ?? [],
      },
    },
  };
}

/** Full error result for code_resolve. */
export function resolveErrorResult(
  content: string,
  opts?: { nextQueries?: string[] },
): CodeIntelResult {
  return {
    content,
    details: {
      type: "resolve" as const,
      data: {
        resultKind: "unavailable" as const,
        confidence: "unavailable" as const,
        targetCount: 0,
        omittedCount: 0,
        targets: [],
        nextQueries: opts?.nextQueries ?? [],
      },
    },
  };
}

/** Full error result for code_inspect. */
export function inspectErrorResult(
  content: string,
  opts?: { focusTarget?: string; nextQueries?: string[] },
): CodeIntelResult {
  return {
    content,
    details: {
      type: "inspect" as const,
      data: {
        confidence: "unavailable" as const,
        focusTarget: opts?.focusTarget ?? "",
        unavailableSections: [],
        nextQueries: opts?.nextQueries ?? [],
      },
    },
  };
}

/** Full error result for code_health. */
export function healthErrorResult(content: string, reason?: string): CodeIntelResult {
  return {
    content,
    details: {
      type: "health" as const,
      data: {
        includedSections: [],
        sections: [],
        confidence: "unavailable",
        provenance: [],
        candidateCount: 0,
        omittedCount: 0,
        semanticAvailable: false,
        serverInventoryAvailable: false,
        lspStatus: reason ?? content,
        recovered: false,
        structuralAvailable: false,
        diagnosticFileCount: 0,
        serverCount: 0,
        dirtyFileCount: null,
        coverage: null,
        unused: null,
        codeActionCount: null,
      },
    },
  };
}

// ── Details-only helpers (thin wrappers — prefer combined factories above) ─

export function unavailableSearchDetails(
  scope: string | null,
  nextQueries: string[],
): { type: "search"; data: SearchDetails } {
  return searchErrorResult("", { scope, nextQueries }).details as {
    type: "search";
    data: SearchDetails;
  };
}

export function unavailableContextDetails(nextQueries: string[]): {
  type: "context";
  data: ContextDetails;
} {
  return contextErrorResult("", { nextQueries }).details as {
    type: "context";
    data: ContextDetails;
  };
}

export function unavailableResolveDetails(nextQueries: string[]): {
  type: "resolve";
  data: ResolveDetails;
} {
  return resolveErrorResult("", { nextQueries }).details as {
    type: "resolve";
    data: ResolveDetails;
  };
}

export function unavailableInspectDetails(
  focusTarget: string,
  nextQueries: string[],
): { type: "inspect"; data: InspectDetails } {
  return inspectErrorResult("", { focusTarget, nextQueries }).details as {
    type: "inspect";
    data: InspectDetails;
  };
}

export function unavailableHealthDetails(reason: string): {
  type: "health";
  data: HealthDetails;
} {
  return healthErrorResult("", reason).details as {
    type: "health";
    data: HealthDetails;
  };
}
