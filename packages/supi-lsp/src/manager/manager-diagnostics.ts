import { readFileSync } from "node:fs";
import {
  type CodeQueryResult,
  type CodeRequestControl,
  mapCodeQueryResult,
} from "@mrclrchtr/supi-code-runtime/api";
import type { LspClient } from "../client/client.ts";
import type { Diagnostic } from "../config/types.ts";
import { relativeFilePathFromUri } from "../diagnostics/diagnostic-summary.ts";
import { shouldIgnoreLspPath } from "../summary.ts";
import { isExcludedByPattern } from "./manager-helpers.ts";

/** Sync one file and return diagnostics up to the supplied severity threshold. */
export async function syncClientFileAndGetDiagnostics(
  client: Pick<LspClient, "syncAndWaitForDiagnostics">,
  filePath: string,
  maxSeverity: number,
  control?: CodeRequestControl,
): Promise<CodeQueryResult<Diagnostic[]>> {
  const content = readFileSync(filePath, "utf-8");
  const result = control
    ? await client.syncAndWaitForDiagnostics(filePath, content, control)
    : await client.syncAndWaitForDiagnostics(filePath, content);
  return mapCodeQueryResult(result, (diagnostics) =>
    filterDiagnosticsBySeverity(diagnostics, maxSeverity),
  );
}

export function collectOutstandingDiagnosticsDetailed(
  clients: Iterable<Pick<LspClient, "getAllDiagnostics">>,
  cwd: string,
  excludePatterns: string[],
  maxSeverity: number,
): Array<{ file: string; diagnostics: Diagnostic[] }> {
  const fileDiags = new Map<string, Diagnostic[]>();

  for (const client of clients) {
    for (const entry of client.getAllDiagnostics()) {
      const file = relativeFilePathFromUri(entry.uri, cwd);
      if (shouldIgnoreLspPath(file, cwd)) continue;
      if (isExcludedByPattern(file, excludePatterns)) continue;
      const filtered = filterDiagnosticsBySeverity(entry.diagnostics, maxSeverity);
      if (filtered.length === 0) continue;
      const existing = fileDiags.get(file) ?? [];
      fileDiags.set(file, [...existing, ...filtered]);
    }
  }

  return Array.from(fileDiags.entries())
    .map(([file, diagnostics]) => ({ file, diagnostics }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

function filterDiagnosticsBySeverity(diagnostics: Diagnostic[], maxSeverity: number): Diagnostic[] {
  return diagnostics.filter(
    (diagnostic) => diagnostic.severity !== undefined && diagnostic.severity <= maxSeverity,
  );
}
