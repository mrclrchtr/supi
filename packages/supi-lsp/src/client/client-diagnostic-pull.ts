import { applyPullReport, type DiagnosticCacheEntry } from "./client-diagnostic-evidence.ts";
import type {
  DiagnosticPullRequest,
  DiagnosticRequestAdapter,
  DiagnosticRequestExecution,
} from "./client-diagnostic-request.ts";

/** Start one adapter request and apply it only while its evidence is current. */
export function startDiagnosticEvidenceFromAdapter(options: {
  readonly adapter: DiagnosticRequestAdapter;
  readonly request: DiagnosticPullRequest;
  readonly store: Map<string, DiagnosticCacheEntry>;
  readonly synchronizationId?: number;
  readonly evidenceRevision: number;
  readonly currentRevision: () => number;
  readonly isCurrentSynchronization: () => boolean;
  readonly markEvidenceCurrent?: (uri: string, synchronizationId: number | undefined) => void;
  readonly isRelatedUriTracked: (uri: string) => boolean;
}): DiagnosticRequestExecution<boolean> {
  const previous = options.store.get(options.request.uri);
  const execution = options.adapter.collect(options.request);
  const result = execution.result.then((requestResult) => {
    if (options.request.signal?.aborted) {
      throw options.request.signal.reason ?? new Error("Diagnostic request cancelled.");
    }
    if (
      options.evidenceRevision !== options.currentRevision() ||
      (options.synchronizationId !== undefined && !options.isCurrentSynchronization())
    ) {
      return false;
    }
    const applied = applyPullReport({
      store: options.store,
      uri: options.request.uri,
      report: requestResult.report,
      previous,
      previousResultId: options.request.previousResultId,
      synchronizationId: options.synchronizationId,
      evidenceRevision: options.evidenceRevision,
      isRelatedUriTracked: options.isRelatedUriTracked,
      source: requestResult.source,
    });
    if (!applied) throw new Error("Invalid diagnostic request report.");
    options.markEvidenceCurrent?.(options.request.uri, options.synchronizationId);
    return true;
  });
  result.catch(() => {});
  return { result, settled: execution.settled };
}
