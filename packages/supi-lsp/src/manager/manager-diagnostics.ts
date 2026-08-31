import { readFileSync } from "node:fs";
import {
  type CodeQueryResult,
  type CodeRequestControl,
  mapCodeQueryResult,
} from "@mrclrchtr/supi-code-runtime/api";
import type { LspClient } from "../client/client.ts";
import type { DiagnosticEntry } from "../client/client-document-state.ts";
import type { Diagnostic } from "../config/types.ts";
import { relativeFilePathFromUri } from "../diagnostics/diagnostic-summary.ts";

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
  clientEntries: Iterable<ReadonlyArray<DiagnosticEntry>>,
  cwd: string,
  includeFile: (file: string) => boolean,
  maxSeverity: number,
): Array<{ file: string; diagnostics: Diagnostic[] }> {
  const fileDiags = new Map<string, Diagnostic[]>();

  for (const entries of clientEntries) {
    for (const entry of entries) {
      const file = relativeFilePathFromUri(entry.uri, cwd);
      if (!includeFile(file)) continue;
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
