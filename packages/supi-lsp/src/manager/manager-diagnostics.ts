import { readFileSync } from "node:fs";
import type { LspClient } from "../client/client.ts";
import { relativeFilePathFromUri } from "../diagnostics/diagnostic-summary.ts";
import { shouldIgnoreLspPath } from "../summary.ts";
import type { Diagnostic } from "../types.ts";
import { fileToUri, uriToFile } from "../utils.ts";
import { isExcludedByPattern } from "./manager-helpers.ts";

export interface DiagnosticSnapshotEntry {
  receivedAt: number;
  diagnostics: Diagnostic[];
}

export interface CascadeDiagnosticEntry {
  uri: string;
  diagnostics: Diagnostic[];
}

export interface CascadingDiagnosticsResult {
  primary: Diagnostic[];
  cascade: CascadeDiagnosticEntry[];
}

/**
 * Find diagnostics for open files updated during a sync of another file.
 *
 * Files are considered cascade-affected when their diagnostic cache entry is
 * new or has a newer `receivedAt` timestamp than the pre-sync snapshot.
 */
export function findCascadeDiagnosticEntries(
  preSnapshot: Map<string, DiagnosticSnapshotEntry>,
  postEntries: Map<string, DiagnosticSnapshotEntry>,
  editedUri: string,
  maxSeverity: number,
): CascadeDiagnosticEntry[] {
  const result: CascadeDiagnosticEntry[] = [];

  for (const [uri, entry] of postEntries) {
    if (uri === editedUri) continue;

    const previous = preSnapshot.get(uri);
    if (previous && entry.receivedAt <= previous.receivedAt) continue;

    const diagnostics = filterDiagnosticsBySeverity(entry.diagnostics, maxSeverity);
    if (diagnostics.length === 0) continue;

    result.push({ uri, diagnostics });
  }

  return result.sort((a, b) => a.uri.localeCompare(b.uri));
}

/** Snapshot current diagnostic cache entries for the client's open URIs. */
export function snapshotOpenClientDiagnostics(
  client: Pick<LspClient, "openUris" | "getDiagnosticCacheEntry">,
): Map<string, DiagnosticSnapshotEntry> {
  const snapshot = new Map<string, DiagnosticSnapshotEntry>();

  for (const uri of client.openUris) {
    const entry = client.getDiagnosticCacheEntry(uri);
    if (!entry) continue;
    snapshot.set(uri, {
      receivedAt: entry.receivedAt,
      diagnostics: entry.diagnostics,
    });
  }

  return snapshot;
}

/** Build post-sync entries map for the client's open URIs. */
export function collectOpenClientDiagnosticEntries(
  client: Pick<LspClient, "openUris" | "getDiagnosticCacheEntry">,
): Map<string, DiagnosticSnapshotEntry> {
  return snapshotOpenClientDiagnostics(client);
}

/** Sync a file and return its diagnostics plus cascade-affected open files. */
export async function syncClientFileAndGetCascadingDiagnostics(
  client: Pick<
    LspClient,
    "openUris" | "getDiagnosticCacheEntry" | "syncAndWaitForDiagnostics" | "clearPullResultIds"
  >,
  filePath: string,
  maxSeverity: number,
): Promise<CascadingDiagnosticsResult> {
  const preSnapshot = snapshotOpenClientDiagnostics(client);
  const primary = filterDiagnosticsBySeverity(
    await client.syncAndWaitForDiagnostics(filePath, readFileSync(filePath, "utf-8")),
    maxSeverity,
  );
  client.clearPullResultIds();

  const cascade = findCascadeDiagnosticEntries(
    preSnapshot,
    collectOpenClientDiagnosticEntries(client),
    fileToUri(filePath),
    maxSeverity,
  );

  return { primary, cascade };
}

export function mapCascadeDiagnosticsToFiles(
  entries: CascadeDiagnosticEntry[],
): Array<{ file: string; diagnostics: Diagnostic[] }> {
  return entries.map((entry) => ({ file: uriToFile(entry.uri), diagnostics: entry.diagnostics }));
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
