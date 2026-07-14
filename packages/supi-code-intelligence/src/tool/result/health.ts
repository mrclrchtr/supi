import type { EvidenceListMetadata } from "../../analysis/evidence.ts";
import type { HealthData } from "../../session/health-types.ts";
import { assembleToolResult, type ResultProvenance, type ToolResultAssembly } from "./assembly.ts";
import type { HealthDetails } from "./types.ts";

export type {
  CodeActionSuggestion,
  HealthCodeActions,
  HealthCoverageData,
  HealthData,
  HealthDiagnosticEntry,
  HealthSection,
  HealthServerInfo,
  HealthUnusedData,
} from "../../session/health-types.ts";

export interface HealthResultAssembly {
  data: HealthData;
  assembled: ToolResultAssembly<HealthData>;
  details: HealthDetails;
}

/** Assemble public code_health evidence and details before presentation adapters render it. */
export function assembleHealthResult(
  data: HealthData,
  evidenceLists: EvidenceListMetadata[],
): HealthResultAssembly {
  const provenance: ResultProvenance[] = [
    ...(data.lspAvailable ? [{ source: "semantic" as const, capability: "LSP" }] : []),
    ...(data.structuralStatus
      ? [{ source: "structural" as const, capability: "tree-sitter" }]
      : []),
    { source: "runtime", capability: "workspace-health" },
  ];
  const sections = [
    { key: "health.servers", title: "Servers", items: data.servers },
    { key: "health.diagnostics", title: "Diagnostics", items: data.diagnostics },
  ].map((section) => ({
    ...section,
    status: "complete" as const,
    confidence: data.lspAvailable ? ("semantic" as const) : ("unavailable" as const),
    provenance,
  }));
  const assembled = assembleToolResult({
    data,
    sections,
    evidenceLists,
    candidateCount: data.diagnostics.length + data.servers.length,
    confidence: data.lspAvailable
      ? "semantic"
      : data.structuralStatus
        ? "structural"
        : "unavailable",
    provenance,
  });

  return {
    data,
    assembled,
    details: {
      lspAvailable: data.lspAvailable,
      lspStatus: data.lspStatus,
      recovered: data.recovered,
      structuralStatus: data.structuralStatus,
      diagnosticFileCount: data.diagnostics.length,
      serverCount: data.servers.length,
      evidenceLists: [...assembled.evidenceLists],
    },
  };
}
