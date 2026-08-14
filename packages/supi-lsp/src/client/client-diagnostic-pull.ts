import { CodeRequestDeadlineError } from "@mrclrchtr/supi-code-runtime/api";
import type { DocumentDiagnosticReport } from "../config/types.ts";
import { applyPullReport, type DiagnosticCacheEntry } from "./client-diagnostic-evidence.ts";
import type { DiagnosticPullRequest } from "./client-diagnostic-request.ts";

interface PullDiagnosticEvidenceOptions {
  store: Map<string, DiagnosticCacheEntry>;
  uri: string;
  timeoutMs: number;
  synchronizationId?: number;
  evidenceRevision: number;
  currentRevision(): number;
  isCurrentSynchronization(): boolean;
  isRelatedUriTracked(uri: string): boolean;
  signal?: AbortSignal;
  deadline?: number;
  operationId?: string;
  pull(request: DiagnosticPullRequest): Promise<DocumentDiagnosticReport | null>;
}

/** Collect one pull report only if its document and workspace generations remain current. */
export async function pullDiagnosticEvidence(
  options: PullDiagnosticEvidenceOptions,
): Promise<boolean> {
  const previous = options.store.get(options.uri);
  const previousResultId = previous?.resultId;
  const report = await options.pull({
    uri: options.uri,
    previousResultId,
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    deadline: options.deadline,
    operationId: options.operationId,
  });
  // Final gate: a report that lands after cancellation or deadline expiry
  // must not be applied as evidence.
  if (options.signal?.aborted) throw options.signal.reason;
  if (options.deadline !== undefined && Date.now() >= options.deadline) {
    throw new CodeRequestDeadlineError();
  }
  if (report === null || report === undefined) {
    throw new Error("Invalid LSP diagnostic report.");
  }
  if (
    options.evidenceRevision !== options.currentRevision() ||
    (options.synchronizationId !== undefined && !options.isCurrentSynchronization())
  ) {
    return false;
  }
  const applied = applyPullReport({
    store: options.store,
    uri: options.uri,
    report,
    previous,
    previousResultId,
    synchronizationId: options.synchronizationId,
    evidenceRevision: options.evidenceRevision,
    isRelatedUriTracked: options.isRelatedUriTracked,
  });
  if (!applied) throw new Error("Invalid LSP diagnostic report.");
  return true;
}
