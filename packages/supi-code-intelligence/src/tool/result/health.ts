import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import { createEvidenceList, type EvidenceListMetadata } from "../../analysis/evidence.ts";
import type { HealthData, HealthSection } from "../../session/health-types.ts";
import {
  assembleToolResult,
  type ResultProvenance,
  type ResultSection,
  type ToolResultAssembly,
} from "./assembly.ts";
import type { HealthDetails, HealthSectionDetails } from "./types.ts";

export type {
  CodeActionSuggestion,
  HealthCodeActions,
  HealthData,
  HealthDiagnosticEntry,
  HealthSection,
  HealthServerInfo,
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
  dirty: "Dirty",
};

/** Assemble public code_health evidence and details before presentation adapters render it. */
export function assembleHealthResult(data: HealthData): HealthResultAssembly {
  const projections = data.includedSections.map((section) => projectSection(section, data));
  const sections = projections.map((projection) => projection.section);
  const sectionDetails = projections.map((projection) => projection.details);
  const evidenceLists = collectHealthEvidenceLists(data);
  const provenance = uniqueProvenance([
    ...sections.flatMap((section) => section.provenance),
    { source: "runtime", capability: "workspace-health" },
  ]);
  const confidence = healthConfidence(data, sectionDetails);
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
      recovered: data.recovered,
      structuralAvailable: structuralCapabilityReady(data),
      structuralStatus: data.structuralStatus,
      capabilityWarnings: data.capabilityWarnings ?? null,
      diagnosticFileCount: data.diagnostics.length,
      serverCount: data.servers.length,
      dirtyFileCount: data.gitContext?.dirtyFiles.length ?? null,
      codeActionCount: data.codeActions?.items.length ?? null,
      evidenceLists: [...assembled.evidenceLists],
    },
  };
}

interface HealthSectionFacts {
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
  const status = facts.available ? "complete" : "unavailable";
  const confidence = facts.available ? facts.confidence : "unavailable";
  return {
    section: {
      key: `health.${key}`,
      title: SECTION_TITLES[key],
      status,
      items: facts.items,
      confidence,
      provenance: facts.provenance,
    },
    details: {
      key,
      title: SECTION_TITLES[key],
      status,
      confidence,
      provenance: [...facts.provenance],
      itemCount: facts.items.length,
      available: facts.available,
    },
  };
}

function collectSectionFacts(key: HealthSection, data: HealthData): HealthSectionFacts {
  switch (key) {
    case "diagnostics": {
      const available = semanticHealthReady(data);
      return {
        available,
        items: data.diagnostics,
        confidence: "semantic",
        provenance: available ? [{ source: "semantic", capability: "LSP" }] : [],
      };
    }
    case "servers":
      return {
        available: data.serverInventoryAvailable,
        items: data.servers,
        confidence: "heuristic",
        provenance: data.serverInventoryAvailable
          ? [{ source: "runtime", capability: "language-server-status" }]
          : [],
      };
    case "dirty":
      return {
        available: data.gitContext !== null,
        items: data.gitContext?.dirtyFiles ?? [],
        confidence: "heuristic",
        provenance: data.gitContext ? [{ source: "git" }] : [],
      };
  }
}

/** Accept only the explicit ready state; arbitrary status text is not provenance. */
function semanticHealthReady(data: HealthData): boolean {
  return data.semanticState?.kind === "ready";
}

/** Accept only the explicit ready state; arbitrary status text is not provenance. */
function structuralCapabilityReady(data: HealthData): boolean {
  return data.structuralAvailable === true;
}

function healthConfidence(
  _data: HealthData,
  sections: readonly HealthSectionDetails[],
): ConfidenceMode {
  if (
    sections.some((section) => section.status === "complete" && section.confidence === "semantic")
  ) {
    return "semantic";
  }
  if (
    sections.some((section) => section.status === "complete" && section.confidence === "heuristic")
  ) {
    return "heuristic";
  }
  return "unavailable";
}

function collectHealthEvidenceLists(data: HealthData): EvidenceListMetadata[] {
  const dirtyFiles =
    data.includedSections.includes("dirty") && data.gitContext !== null
      ? [
          createEvidenceList({
            key: "health.dirtyFiles",
            items: [...data.gitContext.dirtyFiles],
            maxResults: 5,
          }).metadata,
        ]
      : [];
  const codeActions =
    data.includedSections.includes("diagnostics") &&
    data.level === "detailed" &&
    data.codeActions !== null &&
    (data.codeActions.items.length > 0 || data.codeActions.evidence.partialReason !== null)
      ? [data.codeActions.evidence]
      : [];

  return [...dirtyFiles, ...codeActions];
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
