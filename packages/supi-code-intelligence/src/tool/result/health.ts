import type { CoverageWarningReport } from "../../analysis/coverage/coverage-warnings.ts";
import type { EvidenceListMetadata } from "../../analysis/evidence.ts";
import type { GitContext } from "../../analysis/signals/git.ts";
import type { HealthDetails } from "./types.ts";

export type HealthSection = "diagnostics" | "servers" | "dirty" | "coverage" | "unused";

export interface HealthServerInfo {
  name: string;
  root: string;
  fileTypes: string[];
  status: string;
}

export interface HealthDiagnosticEntry {
  file: string;
  errors: number;
  warnings: number;
}

export interface HealthCoverageEntry {
  file: string;
  pct: number;
}

export interface HealthCoverageData {
  available: boolean;
  entries: HealthCoverageEntry[];
}

export interface HealthUnusedExportEntry {
  file: string;
  name: string;
}

export interface HealthUnusedData {
  available: boolean;
  files: string[];
  exports: HealthUnusedExportEntry[];
}

/** A suggested code action at a specific diagnostic location. */
export interface CodeActionSuggestion {
  file: string;
  line: number;
  title: string;
  kind?: string;
}

export interface HealthData {
  includedSections: HealthSection[];
  lspAvailable: boolean;
  lspStatus: string;
  recovered: boolean;
  /** Structural (tree-sitter) substrate readiness. Undefined when not evaluated. */
  structuralStatus?: string;
  diagnostics: HealthDiagnosticEntry[];
  servers: HealthServerInfo[];
  gitContext: GitContext | null;
  scopeFilter: string | null;
  level: "summary" | "detailed";
  /** Code action suggestions collected from LSP (only populated in detailed mode). */
  codeActions: CodeActionSuggestion[] | null;
  coverage: HealthCoverageData | null;
  unused: HealthUnusedData | null;
  /** Coverage warnings for degraded semantic/structural substrate. Undefined when fully healthy. */
  degradedCoverage?: CoverageWarningReport;
  /** Seconds since diagnostics were last refreshed, or undefined if never refreshed. */
  diagnosticAgeSeconds?: number;
}

export interface HealthResultAssembly {
  data: HealthData;
  details: HealthDetails;
}

/** Assemble public code_health evidence and details before presentation adapters render it. */
export function assembleHealthResult(
  data: HealthData,
  evidenceLists: EvidenceListMetadata[],
): HealthResultAssembly {
  return {
    data,
    details: {
      lspAvailable: data.lspAvailable,
      lspStatus: data.lspStatus,
      recovered: data.recovered,
      structuralStatus: data.structuralStatus,
      diagnosticFileCount: data.diagnostics.length,
      serverCount: data.servers.length,
      evidenceLists,
    },
  };
}
