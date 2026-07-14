// Diagnostic store — owns diagnostic queries and synchronized collection.

import type { Diagnostic } from "../config/types.ts";
import type { LspManager } from "./manager.ts";

/** Workspace diagnostic reads and synchronized collection. */
export interface DiagnosticStore {
  getDiagnosticSummary(): Array<{ file: string; errors: number; warnings: number }>;
  getOutstandingDiagnostics(
    maxSeverity?: number,
  ): Array<{ file: string; diagnostics: Diagnostic[] }>;
  getOutstandingDiagnosticSummary(maxSeverity?: number): Array<{
    file: string;
    total: number;
    errors: number;
    warnings: number;
    information: number;
    hints: number;
  }>;
  syncFile(filePath: string, maxSeverity?: number): Promise<Diagnostic[] | null>;
  syncFileWithCascade(
    filePath: string,
    maxSeverity?: number,
  ): Promise<Array<{ file: string; diagnostics: Diagnostic[] }>>;
}

/** Create the diagnostics interface around the package-internal manager. */
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
    async syncFile(filePath, maxSeverity = 4) {
      return manager.syncFileAndGetDiagnostics(filePath, maxSeverity);
    },
    async syncFileWithCascade(filePath, maxSeverity = 4) {
      return manager.syncFileAndGetCascadingDiagnostics(filePath, maxSeverity);
    },
  };
}
