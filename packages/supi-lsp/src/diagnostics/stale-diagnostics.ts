import type { Diagnostic } from "../types.ts";

export interface StaleDiagnosticAssessment {
  suspected: boolean;
  matchedFiles: Array<{ file: string; diagnostics: Diagnostic[] }>;
  warning: string | null;
}

const MODULE_RESOLUTION_MESSAGE =
  /cannot find module|cannot find package|cannot resolve module|module not found/i;
const MODULE_RESOLUTION_CODES = new Set([2307, 2792]);

/** Assess whether a diagnostic cluster looks stale after a workspace change. */
export function assessStaleDiagnostics(
  entries: Array<{ file: string; diagnostics: Diagnostic[] }>,
): StaleDiagnosticAssessment {
  const matchedFiles = entries
    .map((entry) => ({
      file: entry.file,
      diagnostics: entry.diagnostics.filter(isLikelyStaleDiagnostic),
    }))
    .filter((entry) => entry.diagnostics.length > 0);

  const suspected = matchedFiles.length >= 3;
  return {
    suspected,
    matchedFiles,
    warning: suspected
      ? `⚠️ LSP diagnostics may be stale — ${matchedFiles.length} files report missing-module errors after a workspace change.`
      : null,
  };
}

function isLikelyStaleDiagnostic(diagnostic: Diagnostic): boolean {
  if (diagnostic.severity === undefined) return false;
  if (diagnostic.code !== undefined) {
    if (typeof diagnostic.code === "number" && MODULE_RESOLUTION_CODES.has(diagnostic.code)) {
      return true;
    }
    if (typeof diagnostic.code === "string") {
      const parsed = Number.parseInt(diagnostic.code, 10);
      if (MODULE_RESOLUTION_CODES.has(parsed)) return true;
    }
  }

  return MODULE_RESOLUTION_MESSAGE.test(diagnostic.message);
}
