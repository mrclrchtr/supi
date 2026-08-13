import { existsSync } from "node:fs";
import type { PublishDiagnosticsParams } from "../config/types.ts";
import { uriToFile } from "../utils.ts";
import type { DiagnosticCacheEntry } from "./client-diagnostic-evidence.ts";
import type { ClientDiagnosticSnapshot, OpenDocumentState } from "./client-document-state.ts";
import { hasCurrentDiagnosticEvidence } from "./client-document-state.ts";

interface ApplyPushOptions {
  store: Map<string, DiagnosticCacheEntry>;
  openDocuments: ReadonlyMap<string, OpenDocumentState>;
  params: PublishDiagnosticsParams;
  evidenceRevision: number;
  unversionedBlocked: boolean;
}

/** Apply one valid push publication and return whether it can release current waiters. */
export function applyPushDiagnostics(options: ApplyPushOptions): boolean {
  const openDocument = options.openDocuments.get(options.params.uri);
  if (options.params.version !== undefined) {
    if (!Number.isInteger(options.params.version)) return false;
    if (openDocument && options.params.version !== openDocument.version) return false;
  }
  if (!Array.isArray(options.params.diagnostics)) return false;
  if (options.params.version === undefined && options.unversionedBlocked) return false;

  const currentRevision = openDocument?.evidenceRevision === options.evidenceRevision;
  options.store.set(options.params.uri, {
    diagnostics: options.params.diagnostics,
    receivedAt: Date.now(),
    source: "push",
    synchronizationId: currentRevision ? openDocument.synchronizationId : undefined,
    evidenceRevision: openDocument?.evidenceRevision,
    version: options.params.version,
  });
  return true;
}

/** Build one client snapshot without dropping empty-cache freshness. */
export function buildClientDiagnosticSnapshot(options: {
  store: ReadonlyMap<string, DiagnosticCacheEntry>;
  openDocuments: ReadonlyMap<string, OpenDocumentState>;
  evidenceRevision: number;
}): ClientDiagnosticSnapshot {
  const entries: ClientDiagnosticSnapshot["entries"] = [];
  let current = true;
  for (const [uri, entry] of options.store) {
    if (!existsSync(uriToFile(uri))) continue;
    const entryCurrent = hasCurrentDiagnosticEvidence(
      options.openDocuments.get(uri),
      entry,
      options.evidenceRevision,
    );
    current &&= entryCurrent;
    if (entry.diagnostics.length === 0) continue;
    entries.push({ uri, diagnostics: entry.diagnostics, current: entryCurrent });
  }
  return { entries, current };
}
