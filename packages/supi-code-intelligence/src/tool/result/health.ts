import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { HealthData, HealthSection } from "../../session/health-types.ts";
import {
  assembleToolResult,
  type ResultProvenance,
  type ResultSection,
  type ToolResultAssembly,
} from "./assembly.ts";
import type { HealthDetails, HealthSectionDetails } from "./types.ts";

export type {
  HealthData,
  HealthDiagnosticEntry,
  HealthDiagnosticObservation,
  HealthDiagnosticScope,
  HealthRefreshAttempt,
  HealthRefreshState,
  HealthSection,
  HealthServerInfo,
  HealthStaleAssessment,
  SemanticHealthState,
} from "../../session/health-types.ts";
export type { HealthSectionDetails } from "./types.ts";

export interface HealthResultAssembly {
  data: HealthData;
  assembled: ToolResultAssembly<HealthData>;
  details: HealthDetails;
}

const SECTION_TITLES: Record<HealthSection, string> = {
  diagnostics: "Diagnostics",
  servers: "Servers",
};

/** Assemble public code_health evidence and details before presentation adapters render it. */
export function assembleHealthResult(data: HealthData): HealthResultAssembly {
  const projections = data.includedSections.map((section) => projectSection(section, data));
  const sections = projections.map((projection) => projection.section);
  const sectionDetails = projections.map((projection) => projection.details);
  const evidenceLists: never[] = [];
  const provenance = uniqueProvenance([
    ...sections.flatMap((section) => section.provenance),
    { source: "runtime", capability: "workspace-health" },
  ]);
  const confidence = healthConfidence(sectionDetails);
  const assembled = assembleToolResult({
    data,
    sections,
    evidenceLists,
    candidateCount: sections.reduce((sum, section) => sum + section.items.length, 0),
    confidence,
    provenance,
  });

  return {
    data,
    assembled,
    details: {
      includedSections: [...data.includedSections],
      sections: sectionDetails,
      confidence,
      provenance: [...assembled.provenance],
      candidateCount: assembled.totals.candidateCount,
      omittedCount: assembled.totals.omittedCount,
      semanticState: data.semanticState,
      serverInventoryAvailable: data.serverInventoryAvailable,
      serverInventoryScope: "workspace",
      diagnosticObservation: data.diagnostics,
      refresh: data.refresh,
      structuralAvailable: structuralCapabilityReady(data),
      structuralStatus: data.structuralStatus,
      capabilityWarnings: data.capabilityWarnings ?? null,
      diagnosticFileCount: data.diagnostics.entries.length,
      serverCount: data.servers.length,
      evidenceLists: [...assembled.evidenceLists],
    },
  };
}

interface HealthSectionFacts {
  status: "complete" | "partial" | "unavailable";
  available: boolean;
  items: readonly unknown[];
  confidence: ConfidenceMode;
  provenance: ResultProvenance[];
}

function projectSection(
  key: HealthSection,
  data: HealthData,
): { section: ResultSection; details: HealthSectionDetails } {
  const facts = collectSectionFacts(key, data);
  const confidence = facts.status === "unavailable" ? "unavailable" : facts.confidence;
  return {
    section: {
      key: `health.${key}`,
      title: SECTION_TITLES[key],
      status: facts.status,
      items: facts.items,
      confidence,
      provenance: facts.provenance,
    },
    details: {
      key,
      title: SECTION_TITLES[key],
      status: facts.status,
      confidence,
      provenance: [...facts.provenance],
      itemCount: facts.items.length,
      available: facts.available,
    },
  };
}

function collectSectionFacts(key: HealthSection, data: HealthData): HealthSectionFacts {
  if (key === "servers") return serverFacts(data);

  switch (data.diagnostics.kind) {
    case "completed":
      return semanticDiagnosticFacts("complete", data.diagnostics.entries);
    case "partial":
      return semanticDiagnosticFacts("partial", data.diagnostics.entries);
    case "unavailable":
    case "not-requested":
      return {
        status: "unavailable",
        available: false,
        items: [],
        confidence: "unavailable",
        provenance: [],
      };
  }
}

function semanticDiagnosticFacts(
  status: "complete" | "partial",
  entries: HealthData["diagnostics"]["entries"],
): HealthSectionFacts {
  return {
    status,
    available: true,
    items: entries,
    confidence: "semantic",
    provenance: [{ source: "semantic", capability: "LSP" }],
  };
}

function serverFacts(data: HealthData): HealthSectionFacts {
  const available = data.serverInventoryAvailable;
  return {
    status: available ? "complete" : "unavailable",
    available,
    items: data.servers,
    confidence: "heuristic",
    provenance: available ? [{ source: "runtime", capability: "language-server-status" }] : [],
  };
}

/** Accept only the explicit ready state; arbitrary status text is not provenance. */
function structuralCapabilityReady(data: HealthData): boolean {
  return data.structuralAvailable === true;
}

function healthConfidence(sections: readonly HealthSectionDetails[]): ConfidenceMode {
  if (
    sections.some(
      (section) => section.status !== "unavailable" && section.confidence === "semantic",
    )
  ) {
    return "semantic";
  }
  if (
    sections.some(
      (section) => section.status !== "unavailable" && section.confidence === "heuristic",
    )
  ) {
    return "heuristic";
  }
  return "unavailable";
}

function uniqueProvenance(provenance: readonly ResultProvenance[]): ResultProvenance[] {
  const seen = new Set<string>();
  return provenance.filter((entry) => {
    const key = `${entry.source}|${entry.capability ?? ""}|${entry.detail ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
