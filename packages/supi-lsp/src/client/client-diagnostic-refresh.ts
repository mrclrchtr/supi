import {
  type CodeRequestControl,
  isCodeRequestInterruption,
  throwIfCodeRequestInterrupted,
} from "@mrclrchtr/supi-code-runtime/api";
import type { TextDocumentIdentifier } from "../config/types.ts";
import {
  type DiagnosticEvidenceSummary,
  summarizeDiagnosticEvidence,
} from "../diagnostics/evidence.ts";
import { fileToUri, uriToFile } from "../utils.ts";
import {
  type DiagnosticCacheEntry,
  type DiagnosticSynchronization,
  hasFreshEvidence,
  hasFreshPush,
  isCurrentSynchronization,
  latestFreshEvidenceReceivedAt,
  nextDocumentVersion,
  raceDiagnosticPull,
} from "./client-diagnostic-evidence.ts";
import type { ClientDiagnosticsHost } from "./client-diagnostic-host.ts";
import { pullDiagnosticEvidence } from "./client-diagnostic-pull.ts";
import type { DiagnosticPullRequest } from "./client-diagnostic-request.ts";
import {
  DiagnosticObserver,
  DiagnosticPullError,
  isDiagnosticTimeout,
} from "./client-diagnostic-timing.ts";
import type { DiagnosticStateWait, DiagnosticWaitRegistry } from "./client-diagnostic-waiters.ts";
import type { OpenDocumentState } from "./client-document-state.ts";
import {
  type ResynchronizeDocumentsResult,
  resynchronizeOpenDocuments,
} from "./client-document-sync.ts";
import { getDiagnosticFileState } from "./client-file-state.ts";

/** Send the protocol close notification for one removed document. */
export function sendDidCloseNotification(
  host: Pick<ClientDiagnosticsHost, "sendNotification">,
  uri: string,
): void {
  host.sendNotification("textDocument/didClose", {
    textDocument: { uri } satisfies TextDocumentIdentifier,
  });
}

/** Build final document coverage after one client refresh attempt. */
export function buildDiagnosticRefreshEvidence(options: {
  requestedFiles: readonly string[];
  resynchronization: ResynchronizeDocumentsResult;
  failedPullUris: ReadonlySet<string>;
  failedFiles: ReadonlySet<string>;
  failedResynchronizations: ReadonlySet<string>;
  currentEvidenceRevision: number;
  openDocuments: ReadonlyMap<string, unknown>;
  diagnosticStore: ReadonlyMap<string, DiagnosticCacheEntry>;
}): DiagnosticEvidenceSummary {
  const synchronizationByFile = new Map(
    options.resynchronization.synchronizations.map((item) => [uriToFile(item.uri), item]),
  );
  const removedFiles = new Set(options.resynchronization.removedFiles);
  const failedFiles = new Set(options.resynchronization.failedFiles);
  const documents = options.requestedFiles.map((file) => {
    const uri = fileToUri(file);
    const synchronization = synchronizationByFile.get(file);
    if (removedFiles.has(file) || getDiagnosticFileState(file) === "removed") {
      return { file, status: "removed" as const };
    }
    if (
      failedFiles.has(file) ||
      options.failedFiles.has(file) ||
      options.failedResynchronizations.has(file)
    ) {
      return { file, status: "failed" as const };
    }
    if (!options.openDocuments.has(uri)) {
      return { file, status: "unconfirmed" as const };
    }
    if (
      synchronization &&
      hasFreshEvidence(options.diagnosticStore, synchronization, options.currentEvidenceRevision)
    ) {
      return { file, status: "confirmed" as const };
    }
    return {
      file,
      status: options.failedPullUris.has(uri) ? ("failed" as const) : ("unconfirmed" as const),
    };
  });
  return summarizeDiagnosticEvidence(documents);
}

/** Pull one document and reject evidence from a stale client generation. */
export function pullClientDiagnosticEvidence(
  options: Omit<DiagnosticPullRequest, "previousResultId"> & {
    store: Map<string, DiagnosticCacheEntry>;
    synchronizationId?: number;
    evidenceRevision: number;
    currentRevision(): number;
    isCurrentSynchronization(): boolean;
    isRelatedUriTracked(uri: string): boolean;
    pull(
      request: DiagnosticPullRequest,
    ): Promise<import("../config/types.ts").DocumentDiagnosticReport | null>;
  },
): Promise<boolean> {
  return pullDiagnosticEvidence(options);
}

/** Pull one document through a client's host and preserve generation checks. */
export function pullClientDiagnosticEvidenceFromHost(options: {
  host: Pick<ClientDiagnosticsHost, "pullDocumentDiagnostics">;
  store: Map<string, DiagnosticCacheEntry>;
  openDocuments: ReadonlyMap<string, { synchronizationId: number; evidenceRevision?: number }>;
  currentEvidenceRevision(): number;
  isRelatedUriTracked(uri: string): boolean;
  onApplied?(): void;
  request: Omit<DiagnosticPullRequest, "previousResultId"> & {
    synchronizationId?: number;
    evidenceRevision?: number;
  };
}): Promise<boolean> {
  return pullClientDiagnosticEvidence({
    store: options.store,
    ...options.request,
    evidenceRevision: options.request.evidenceRevision ?? options.currentEvidenceRevision(),
    currentRevision: options.currentEvidenceRevision,
    isCurrentSynchronization: () =>
      options.request.synchronizationId === undefined ||
      isCurrentSynchronization(options.openDocuments, {
        uri: options.request.uri,
        synchronizationId: options.request.synchronizationId,
        evidenceRevision: options.request.evidenceRevision,
      }),
    isRelatedUriTracked: options.isRelatedUriTracked,
    pull: (request) => options.host.pullDocumentDiagnostics(request),
  }).then((applied) => {
    if (applied) options.onApplied?.();
    return applied;
  });
}

/** Collect pull evidence for every synchronized document in one refresh. */
export async function pullDiagnosticsForOpenDocuments(options: {
  requests: readonly DiagnosticSynchronization[];
  syncStart: number;
  maxWaitMs: number;
  signal?: AbortSignal;
  deadline?: number;
  operationId?: string;
  currentEvidenceRevision: () => number;
  openDocuments: ReadonlyMap<string, { evidenceRevision: number; synchronizationId: number }>;
  diagnosticStore: ReadonlyMap<string, DiagnosticCacheEntry>;
  waitForChange: () => DiagnosticStateWait;
  pullDiagnostics: (options: {
    request: DiagnosticSynchronization;
    timeoutMs: number;
    signal: AbortSignal;
    operationId?: string;
    deadline?: number;
  }) => Promise<boolean>;
}): Promise<void> {
  const deadline = options.syncStart + options.maxWaitMs;
  const results = await Promise.allSettled(
    options.requests.map(async (request) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("pull diagnostic timeout");
      const pullController = new AbortController();
      // Link the caller's cancellation to this document's pull controller so
      // an in-flight pull receives protocol cancellation and stops promptly.
      const onAbort = () => pullController.abort(options.signal?.reason);
      if (options.signal?.aborted) onAbort();
      else options.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const outcome = await raceDiagnosticPull({
          pull: options.pullDiagnostics({
            request,
            timeoutMs: remaining,
            signal: pullController.signal,
            operationId: options.operationId,
            deadline: options.deadline,
          }),
          waitForChange: options.waitForChange,
          freshPush: () =>
            hasFreshPush(options.diagnosticStore, request, options.currentEvidenceRevision()),
          current: () => isCurrentSynchronization(options.openDocuments, request),
        });
        if (outcome !== "pull") pullController.abort();
        return outcome === "pull";
      } finally {
        options.signal?.removeEventListener("abort", onAbort);
      }
    }),
  );

  // A cancelled refresh must not degrade into failed coverage evidence:
  // the caller no longer awaits a result.
  throwIfCodeRequestInterrupted({ signal: options.signal, deadline: options.deadline });

  const incomplete = results.some((result) => result.status === "rejected" || !result.value);
  if (incomplete && options.requests.length > 0) {
    const failedUris = options.requests.flatMap((request, index) => {
      const result = results[index];
      return result?.status === "rejected" && !isDiagnosticTimeout(result.reason)
        ? [request.uri]
        : [];
    });
    throw new DiagnosticPullError(
      results.some((result) => result.status === "rejected" && isDiagnosticTimeout(result.reason)),
      failedUris,
    );
  }
}

interface ClientDiagnosticRefreshOptions {
  readonly host: ClientDiagnosticsHost;
  readonly openDocuments: Map<string, OpenDocumentState>;
  readonly diagnosticStore: Map<string, DiagnosticCacheEntry>;
  readonly waiters: DiagnosticWaitRegistry;
  readonly versionHistory: Map<string, number>;
  readonly requestedFiles: readonly string[];
  readonly evidenceRevision: () => number;
  readonly failedFiles: () => ReadonlySet<string>;
  readonly isRelatedUriTracked: (uri: string) => boolean;
  readonly nextSynchronizationId: () => number;
  readonly clearFile: (uri: string) => void;
  readonly invalidateEvidence: (uri: string) => void;
  readonly blockUnversionedPush: (uri: string) => void;
  readonly clearFailedFile: (uri: string) => void;
  readonly unblockUnversionedPush: (uri: string) => void;
  readonly options: { maxWaitMs?: number; quietMs?: number } & CodeRequestControl;
}

/** Refresh one client and return exact document evidence for that attempt. */
export async function refreshClientOpenDiagnostics(
  options: ClientDiagnosticRefreshOptions,
): Promise<DiagnosticEvidenceSummary> {
  // Reject immediately when the request was already cancelled: no document
  // resynchronization or protocol traffic may start for a pass the caller
  // no longer awaits.
  throwIfCodeRequestInterrupted(options.options);
  const supportsPull = options.host.supportsPullDiagnostics();
  const observer = new DiagnosticObserver("refresh-open", supportsPull, options.options);
  if (!options.host.isOperational()) {
    observer.skipped(options.requestedFiles.length);
    return summarizeDiagnosticEvidence(
      options.requestedFiles.map((file) => ({
        file,
        status:
          getDiagnosticFileState(file) === "removed" ? ("removed" as const) : ("failed" as const),
      })),
    );
  }

  const maxWaitMs = options.options.maxWaitMs ?? 3_000;
  const quietMs = options.options.quietMs ?? 200;
  const syncStart = Date.now();
  const resynchronization = resynchronizeOpenDocuments({
    openDocuments: options.openDocuments,
    waiters: options.waiters,
    nextVersion: (uri) => nextDocumentVersion(options.versionHistory, uri),
    nextSynchronizationId: options.nextSynchronizationId,
    evidenceRevision: options.evidenceRevision(),
    sendNotification: (method, params) => options.host.sendNotification(method, params),
    uriToFile,
    clearFile: options.clearFile,
    invalidateEvidence: options.invalidateEvidence,
    blockUnversionedPush: options.blockUnversionedPush,
    clearFailedFile: options.clearFailedFile,
  });
  const synchronizations = resynchronization.synchronizations;
  const settleEpoch = options.waiters.settleEpoch;
  observer.synchronized();
  const documentCount = synchronizations.length;
  let failedPullUris = new Set<string>();
  const buildEvidence = () =>
    buildDiagnosticRefreshEvidence({
      requestedFiles: options.requestedFiles,
      resynchronization,
      failedPullUris,
      failedFiles: options.failedFiles(),
      failedResynchronizations: new Set(resynchronization.failedFiles),
      currentEvidenceRevision: options.evidenceRevision(),
      openDocuments: options.openDocuments,
      diagnosticStore: options.diagnosticStore,
    });
  if (documentCount === 0) {
    observer.skipped(0);
    return buildEvidence();
  }

  if (supportsPull) {
    try {
      await pullDiagnosticsForOpenDocuments({
        requests: synchronizations,
        syncStart,
        maxWaitMs,
        signal: options.options.signal,
        deadline: options.options.deadline,
        operationId: options.options.operationId,
        currentEvidenceRevision: options.evidenceRevision,
        openDocuments: options.openDocuments,
        diagnosticStore: options.diagnosticStore,
        waitForChange: () => options.waiters.waitForChange(),
        pullDiagnostics: (pullOptions) =>
          pullClientDiagnosticEvidenceFromHost({
            host: options.host,
            store: options.diagnosticStore,
            openDocuments: options.openDocuments,
            currentEvidenceRevision: options.evidenceRevision,
            isRelatedUriTracked: options.isRelatedUriTracked,
            onApplied: () => options.unblockUnversionedPush(pullOptions.request.uri),
            request: {
              uri: pullOptions.request.uri,
              timeoutMs: pullOptions.timeoutMs,
              synchronizationId: pullOptions.request.synchronizationId,
              evidenceRevision:
                options.openDocuments.get(pullOptions.request.uri)?.evidenceRevision ??
                options.evidenceRevision(),
              signal: pullOptions.signal,
              deadline: pullOptions.deadline,
              operationId: pullOptions.operationId,
            },
          }),
      });
      observer.pullCompleted(documentCount);
      return buildEvidence();
    } catch (error) {
      observer.pullFailed(error);
      if (error instanceof DiagnosticPullError) failedPullUris = new Set(error.failedUris);
      // An interruption during the pull phase stops the refresh instead of
      // falling through to the settle path with failed-coverage evidence.
      if (isCodeRequestInterruption(error, options.options)) throw error;
    }
  }

  const settle = await options.waiters.waitForSettle(
    {
      syncStart,
      maxWaitMs,
      quietMs,
      settleEpoch,
      isComplete: () =>
        synchronizations.every((item) =>
          hasFreshEvidence(options.diagnosticStore, item, options.evidenceRevision()),
        ),
      latestReceived: () =>
        latestFreshEvidenceReceivedAt(
          options.diagnosticStore,
          synchronizations,
          options.evidenceRevision(),
        ),
    },
    options.options,
  );
  observer.pushSettled(documentCount, settle);
  // A cancelled settle must not publish evidence the caller no longer awaits.
  throwIfCodeRequestInterrupted(options.options);
  return buildEvidence();
}
