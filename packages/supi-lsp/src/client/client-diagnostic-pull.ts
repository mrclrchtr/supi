import type { DocumentDiagnosticReport } from "../config/types.ts";
import { applyPullReport, type DiagnosticCacheEntry } from "./client-diagnostic-evidence.ts";

interface PullDiagnosticEvidenceOptions {
  store: Map<string, DiagnosticCacheEntry>;
  uri: string;
  timeoutMs: number;
  synchronizationId?: number;
  evidenceRevision: number;
  currentRevision(): number;
  isCurrentSynchronization(): boolean;
  signal?: AbortSignal;
  pull(
    uri: string,
    previousResultId: string | undefined,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<DocumentDiagnosticReport | null>;
}

/** Collect one pull report only if its document and workspace generations remain current. */
export async function pullDiagnosticEvidence(
  options: PullDiagnosticEvidenceOptions,
): Promise<boolean> {
  const previous = options.store.get(options.uri);
  const previousResultId = previous?.resultId;
  const report = await options.pull(
    options.uri,
    previousResultId,
    options.timeoutMs,
    options.signal,
  );
  if (!report) return false;
  if (
    options.evidenceRevision !== options.currentRevision() ||
    (options.synchronizationId !== undefined && !options.isCurrentSynchronization())
  ) {
    return false;
  }
  return applyPullReport({
    store: options.store,
    uri: options.uri,
    report,
    previous,
    previousResultId,
    synchronizationId: options.synchronizationId,
    evidenceRevision: options.evidenceRevision,
  });
}
