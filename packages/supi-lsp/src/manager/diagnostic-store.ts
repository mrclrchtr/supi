// Diagnostic store — stores, aggregates, and queries diagnostics.

import type { Diagnostic } from "../config/types.ts";
import type { LspManager } from "./manager.ts";

/**
 * Stores and queries diagnostics per file.
 * Currently delegates to LspManager methods.
 */
export interface DiagnosticStore {
  /** Get workspace diagnostic summary grouped by file. */
  getDiagnosticSummary(): Array<{ file: string; errors: number; warnings: number }>;

  /** Get outstanding diagnostics at or above severity. */
  getOutstandingDiagnostics(
    maxSeverity?: number,
  ): Array<{ file: string; diagnostics: Diagnostic[] }>;

  /** Get outstanding diagnostic summary grouped by file. */
  getOutstandingDiagnosticSummary(maxSeverity?: number): Array<{
    file: string;
    total: number;
    errors: number;
    warnings: number;
    information: number;
    hints: number;
  }>;

  /** Sync a file and return its diagnostics. */
  syncAndGetDiagnostics(filePath: string, maxSeverity?: number): Promise<Diagnostic[] | null>;
}

/**
 * Create a DiagnosticStore backed by LspManager.
 */
export function createDiagnosticStore(manager: LspManager): DiagnosticStore {
  return {
    getDiagnosticSummary() {
      return manager.getDiagnosticSummary();
    },
    getOutstandingDiagnostics(maxSeverity = 1) {
      return manager.getOutstandingDiagnostics(maxSeverity);
    },
    getOutstandingDiagnosticSummary(maxSeverity = 1) {
      return manager.getOutstandingDiagnosticSummary(maxSeverity);
    },
    async syncAndGetDiagnostics(filePath: string, maxSeverity = 4) {
      return manager.syncFileAndGetDiagnostics(filePath, maxSeverity);
    },
  };
}
