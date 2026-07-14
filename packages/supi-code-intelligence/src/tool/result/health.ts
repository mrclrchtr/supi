import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { EvidenceListMetadata } from "../../analysis/evidence.ts";
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
  HealthCoverageData,
  HealthData,
  HealthDiagnosticEntry,
  HealthSection,
  HealthServerInfo,
  HealthUnusedData,
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
  coverage: "Coverage",
  unused: "Unused",
};

/** Assemble public code_health evidence and details before presentation adapters render it. */
export function assembleHealthResult(
  data: HealthData,
  evidenceLists: EvidenceListMetadata[],
): HealthResultAssembly {
  const projections = data.includedSections.map((section) => projectSection(section, data));
  const sections = projections.map((projection) => projection.section);
  const sectionDetails = projections.map((projection) => projection.details);
  const filteredEvidenceLists = filterEvidenceLists(data, evidenceLists);
  const capabilityProvenance = collectCapabilityProvenance(data);
  const provenance = uniqueProvenance([
    ...capabilityProvenance,
    ...sections.flatMap((section) => section.provenance),
    { source: "runtime", capability: "workspace-health" },
  ]);
  const confidence = healthConfidence(data, sectionDetails);
  const assembled = assembleToolResult({
    data,
    sections,
    evidenceLists: filteredEvidenceLists,
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
      lspAvailable: data.lspAvailable,
      lspStatus: data.lspStatus,
      recovered: data.recovered,
      structuralAvailable: structuralCapabilityReady(data),
      structuralStatus: data.structuralStatus,
      diagnosticFileCount: data.diagnostics.length,
      serverCount: data.servers.length,
      dirtyFileCount: data.gitContext?.dirtyFiles.length ?? null,
      coverage: data.coverage
        ? {
            available: data.coverage.available,
            entryCount: data.coverage.entries.length,
            reportPath: data.coverage.reportPath,
          }
        : null,
      unused: data.unused
        ? {
            available: data.unused.available,
            fileCount: data.unused.files.length,
            exportCount: data.unused.exports.length,
            reportPath: data.unused.reportPath,
          }
        : null,
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
  locator?: string;
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
      ...(facts.locator ? { locator: facts.locator } : {}),
    },
  };
}

function collectSectionFacts(key: HealthSection, data: HealthData): HealthSectionFacts {
  switch (key) {
    case "diagnostics":
      return {
        available: data.lspAvailable,
        items: data.diagnostics,
        confidence: "semantic",
        provenance: data.lspAvailable ? [{ source: "semantic", capability: "LSP" }] : [],
      };
    case "servers":
      return {
        available: data.lspAvailable,
        items: data.servers,
        confidence: "semantic",
        provenance: data.lspAvailable ? [{ source: "semantic", capability: "LSP" }] : [],
      };
    case "dirty":
      return {
        available: data.gitContext !== null,
        items: data.gitContext?.dirtyFiles ?? [],
        confidence: "heuristic",
        provenance: data.gitContext ? [{ source: "git" }] : [],
      };
    case "coverage":
      return {
        available: data.coverage?.available === true,
        items: data.coverage?.entries ?? [],
        confidence: "heuristic",
        provenance: data.coverage
          ? [
              {
                source: "filesystem",
                capability: "coverage-report",
                detail: data.coverage.reportPath,
              },
            ]
          : [],
        locator: data.coverage?.reportPath,
      };
    case "unused":
      return {
        available: data.unused?.available === true,
        items: data.unused ? [...data.unused.files, ...data.unused.exports] : [],
        confidence: "heuristic",
        provenance: data.unused
          ? [
              {
                source: "filesystem",
                capability: "unused-report",
                detail: data.unused.reportPath,
              },
            ]
          : [],
        locator: data.unused?.reportPath,
      };
  }
}

/** Accept only the explicit ready state; arbitrary status text is not provenance. */
function structuralCapabilityReady(data: HealthData): boolean {
  return data.structuralAvailable === true || data.structuralStatus === "ready";
}

function collectCapabilityProvenance(data: HealthData): ResultProvenance[] {
  const semanticRequested = data.includedSections.some(
    (section) => section === "diagnostics" || section === "servers",
  );
  return [
    ...(semanticRequested && data.lspAvailable
      ? [{ source: "semantic" as const, capability: "LSP" }]
      : []),
    ...(semanticRequested && structuralCapabilityReady(data)
      ? [{ source: "structural" as const, capability: "tree-sitter" }]
      : []),
  ];
}

function healthConfidence(
  data: HealthData,
  sections: readonly HealthSectionDetails[],
): ConfidenceMode {
  if (
    sections.some((section) => section.status === "complete" && section.confidence === "semantic")
  ) {
    return "semantic";
  }
  if (
    data.includedSections.some((section) => section === "diagnostics" || section === "servers") &&
    structuralCapabilityReady(data)
  ) {
    return "structural";
  }
  if (
    sections.some((section) => section.status === "complete" && section.confidence === "heuristic")
  ) {
    return "heuristic";
  }
  return "unavailable";
}

function filterEvidenceLists(
  data: HealthData,
  evidenceLists: readonly EvidenceListMetadata[],
): EvidenceListMetadata[] {
  return evidenceLists.filter((list) => {
    if (list.key === "health.dirtyFiles") {
      return data.includedSections.includes("dirty") && data.gitContext !== null;
    }
    if (list.key === "health.codeActions") {
      return (
        data.includedSections.includes("diagnostics") &&
        data.level === "detailed" &&
        data.codeActions !== null
      );
    }
    return true;
  });
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
