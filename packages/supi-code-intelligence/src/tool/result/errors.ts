import type { CodeIntelResult, ToolDisplaySection } from "../../types/index.ts";

/** Full error result for search-family tools. */
export function searchErrorResult(
  content: string,
  opts?: {
    scope?: string | null;
    nextQueries?: string[];
    message?: string;
    displaySections?: readonly ToolDisplaySection[];
  },
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
      status: "invalid-input",
      ...(opts?.message ? { message: opts.message } : {}),
      ...(opts?.displaySections ? { displaySections: opts.displaySections } : {}),
    },
  };
}

/** Full error result for code_orientation. */
export function contextErrorResult(
  content: string,
  opts?: { nextQueries?: string[]; message?: string },
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
      status: "invalid-input",
      ...(opts?.message ? { message: opts.message } : {}),
    },
  };
}

/** Full error result for code_inspect. */
export function inspectErrorResult(
  content: string,
  opts?: { focusTarget?: string; nextQueries?: string[]; message?: string },
): CodeIntelResult {
  return {
    content,
    details: {
      type: "inspect" as const,
      data: {
        confidence: "unavailable" as const,
        focusTarget: opts?.focusTarget ?? "",
        diagnosticWindow: null,
        sections: [],
        nextQueries: opts?.nextQueries ?? [],
      },
      status: "invalid-input",
      ...(opts?.message ? { message: opts.message } : {}),
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
        semanticState: { kind: "unavailable", reason: reason ?? content },
        serverInventoryAvailable: false,
        serverInventoryScope: "workspace",
        diagnosticObservation: { kind: "not-requested", entries: [] },
        refresh: {
          kind: "not-attempted",
          reason: reason ?? content,
          lastAttempt: null,
        },
        structuralAvailable: false,
        capabilityWarnings: null,
        diagnosticFileCount: 0,
        serverCount: 0,
      },
      status: "invalid-input",
      message: reason ?? content,
    },
  };
}
