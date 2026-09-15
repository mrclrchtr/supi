import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { EvidenceListMetadata } from "../../analysis/evidence.ts";
import type { CodeIntelResult, ToolDisplaySection } from "../../types/index.ts";
import { assembledNextQueries, assembleToolResult } from "./assembly.ts";

/** Full failure or candidate-selection result for search-family tools. */
export function searchErrorResult(
  content: string,
  opts?: {
    /** Candidate selection is not invalid usage. Defaults to invalid-input. */
    status?: "invalid-input" | "disambiguation";
    scope?: string | null;
    nextQueries?: string[];
    message?: string;
    displaySections?: readonly ToolDisplaySection[];
    /** Evidence retained when a target still needs selection. */
    evidenceLists?: readonly EvidenceListMetadata[];
    confidence?: ConfidenceMode;
  },
): CodeIntelResult {
  const assembled = assembleToolResult({
    data: null,
    confidence: opts?.confidence ?? "unavailable",
    evidenceLists: opts?.evidenceLists,
    nextQueries: opts?.nextQueries,
  });
  return {
    content,
    details: {
      type: "search" as const,
      data: {
        confidence: assembled.confidence,
        scope: opts?.scope ?? null,
        candidateCount: assembled.totals.candidateCount,
        omittedCount: assembled.totals.omittedCount,
        ...(opts?.evidenceLists ? { evidenceLists: [...assembled.evidenceLists] } : {}),
        nextQueries: assembledNextQueries(assembled),
      },
      status: opts?.status ?? "invalid-input",
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
        serverRouteStatusCounts: { recovering: 0, error: 0, unavailable: 0 },
      },
      status: "invalid-input",
      message: reason ?? content,
    },
  };
}
