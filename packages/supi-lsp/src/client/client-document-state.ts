import { createHash } from "node:crypto";
import type { Diagnostic } from "../config/types.ts";
import { type DiagnosticCacheEntry, isTentativePushEntry } from "./client-diagnostic-evidence.ts";

/** One file's stored diagnostics as consumed by manager-level collection. */
export interface DiagnosticEntry {
  uri: string;
  diagnostics: Diagnostic[];
  current: boolean;
}

/** One tracked document's current diagnostic freshness. */
export interface ClientDiagnosticDocument {
  uri: string;
  current: boolean;
  status: "confirmed" | "unconfirmed" | "failed" | "removed";
}

/** One client's diagnostic snapshot, including empty cache freshness. */
export interface ClientDiagnosticSnapshot {
  entries: DiagnosticEntry[];
  documents: ClientDiagnosticDocument[];
  current: boolean;
}

/** One open document's current protocol and content state. */
export interface OpenDocumentState {
  version: number;
  synchronizationId: number;
  evidenceRevision: number;
  /** Last text sent to the server. Used to form incremental changes. */
  content: string;
  contentFingerprint: string;
}

/** Compute a path-free content identity for unchanged-document checks. */
export function fingerprintDocumentContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Test whether cached diagnostics still prove the current document state. */
export function hasCurrentDiagnosticEvidence(
  document: OpenDocumentState | undefined,
  entry: DiagnosticCacheEntry | undefined,
  evidenceRevision: number,
): boolean {
  return Boolean(
    document &&
      entry &&
      document.evidenceRevision === evidenceRevision &&
      entry.synchronizationId === document.synchronizationId &&
      entry.evidenceRevision === evidenceRevision,
  );
}

/**
 * Test whether cached diagnostics confirm the current document state.
 *
 * A current tentative push matches the document state but cannot support a
 * clean-result or cache-reuse claim until a republish confirms it (ADR 0021).
 */
export function hasConfirmedDiagnosticEvidence(
  document: OpenDocumentState | undefined,
  entry: DiagnosticCacheEntry | undefined,
  evidenceRevision: number,
): boolean {
  return (
    hasCurrentDiagnosticEvidence(document, entry, evidenceRevision) && !isTentativePushEntry(entry)
  );
}
