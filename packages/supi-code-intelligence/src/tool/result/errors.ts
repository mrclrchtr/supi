/**
 * Tool-result error assembly factories for code-intelligence tool executors.
 *
 * Every factory returns a complete {@link CodeIntelResult} (content + typed
 * details) so executors never need to inline the `{ content, details }`
 * wrapper. Returned tool errors are result assembly concerns; whole-tool
 * capability failures may still throw so PI marks the tool call as failed.
 */

import type { CodeIntelResult } from "../../types/index.ts";

// ── Error-result factories ──────────────────────────────────────────

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
        diagnosticWindow: null,
        sections: [],
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
    },
  };
}
