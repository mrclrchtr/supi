// LSP manager types — shared summaries and status shapes used by UI/guidance.

export interface ServerStatus {
  name: string;
  status: "running" | "error" | "unavailable";
  root: string;
  openFiles: string[];
}

export interface DiagnosticSummary {
  file: string;
  errors: number;
  warnings: number;
}

export interface CoverageSummaryEntry {
  name: string;
  fileTypes: string[];
  active: boolean;
  openFiles: number;
}

export interface ActiveCoverageSummaryEntry {
  name: string;
  openFiles: string[];
}

export interface OutstandingDiagnosticSummaryEntry {
  file: string;
  total: number;
  errors: number;
  warnings: number;
  information: number;
  hints: number;
}

export interface ManagerStatus {
  servers: ServerStatus[];
}
