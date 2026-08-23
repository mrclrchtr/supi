// biome-ignore-all lint/style/noExcessiveLinesPerFile: refresh orchestration, pull collection, and the reopen fallback stay in one cohesive module.
import { readFileSync } from "node:fs";
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
import { detectLanguageId, fileToUri, uriToFile } from "../utils.ts";
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
import {
  fingerprintDocumentContent,
  hasCurrentDiagnosticEvidence,
  type OpenDocumentState,
} from "./client-document-state.ts";
import {
  type ResynchronizeDocumentsResult,
  reopenDocument,
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
  /** Synchronizations that prove evidence, after reopen-resync updates. */
  synchronizations: readonly DiagnosticSynchronization[];
  failedPullUris: ReadonlySet<string>;
  failedFiles: ReadonlySet<string>;
  failedResynchronizations: ReadonlySet<string>;
  currentEvidenceRevision: number;
  openDocuments: ReadonlyMap<string, unknown>;
  diagnosticStore: ReadonlyMap<string, DiagnosticCacheEntry>;
}): DiagnosticEvidenceSummary {
  const synchronizationByFile = new Map(
    options.synchronizations.map((item) => [uriToFile(item.uri), item]),
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

/** Find open documents with current diagnostic evidence and matching disk content. */
function findReusableDocumentUris(options: {
  openDocuments: ReadonlyMap<string, OpenDocumentState>;
  diagnosticStore: ReadonlyMap<string, DiagnosticCacheEntry>;
  evidenceRevision: number;
  failedFiles: ReadonlySet<string>;
}): Set<string> {
  const reusable = new Set<string>();
  for (const [uri, document] of options.openDocuments) {
    if (options.failedFiles.has(uriToFile(uri))) continue;
    if (
      !hasCurrentDiagnosticEvidence(
        document,
        options.diagnosticStore.get(uri),
        options.evidenceRevision,
      )
    ) {
      continue;
    }
    try {
      const content = readFileSync(uriToFile(uri), "utf-8");
      if (fingerprintDocumentContent(content) === document.contentFingerprint) {
        reusable.add(uri);
      }
    } catch {
      // The normal resynchronization path handles files that cannot be read.
    }
  }
  return reusable;
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
  readonly markUnversionedSyncMoment: (uri: string) => void;
  readonly clearFailedFile: (uri: string) => void;
  /** Server-requested refreshes bypass normal push-only evidence reuse. */
  readonly forceResynchronize?: boolean;
  readonly options: { maxWaitMs?: number; quietMs?: number } & CodeRequestControl;
}

interface PreparedRefreshDocuments {
  readonly resynchronization: ResynchronizeDocumentsResult;
  readonly synchronizations: DiagnosticSynchronization[];
  readonly fullyReusable: boolean;
}

/** Classify reusable documents, then resynchronize only the remaining set. */
function prepareRefreshDocuments(
  options: ClientDiagnosticRefreshOptions,
  supportsPull: boolean,
  evidenceRevision: number,
): PreparedRefreshDocuments {
  const reuseEnabled = !supportsPull && !options.forceResynchronize;
  const reusableUris = reuseEnabled
    ? findReusableDocumentUris({
        openDocuments: options.openDocuments,
        diagnosticStore: options.diagnosticStore,
        evidenceRevision,
        failedFiles: options.failedFiles(),
      })
    : new Set<string>();
  const documentsToResynchronize = new Map(
    Array.from(options.openDocuments).filter(([uri]) => !reusableUris.has(uri)),
  );
  const resynchronization = resynchronizeOpenDocuments({
    openDocuments: documentsToResynchronize,
    waiters: options.waiters,
    nextVersion: (uri) => nextDocumentVersion(options.versionHistory, uri),
    nextSynchronizationId: options.nextSynchronizationId,
    evidenceRevision,
    sendNotification: (method, params) => options.host.sendNotification(method, params),
    uriToFile,
    clearFile: options.clearFile,
    invalidateEvidence: options.invalidateEvidence,
    markUnversionedSyncMoment: options.markUnversionedSyncMoment,
    clearFailedFile: options.clearFailedFile,
  });
  const reusableSynchronizations: DiagnosticSynchronization[] = [];
  for (const uri of reusableUris) {
    const document = options.openDocuments.get(uri);
    if (!document) continue;
    reusableSynchronizations.push({
      uri,
      synchronizationId: document.synchronizationId,
      evidenceRevision: document.evidenceRevision,
    });
  }
  const synchronizations = [...reusableSynchronizations, ...resynchronization.synchronizations];
  const fullyReusable =
    reuseEnabled &&
    options.openDocuments.size > 0 &&
    reusableUris.size === options.openDocuments.size;
  return { resynchronization, synchronizations, fullyReusable };
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
  const observer = new DiagnosticObserver("refresh-open", supportsPull, options.options, {
    server: options.host.server,
    cwd: options.host.cwd,
  });
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
  const prepared = prepareRefreshDocuments(options, supportsPull, options.evidenceRevision());
  const resynchronization = prepared.resynchronization;
  let synchronizations = prepared.synchronizations;
  let failedPullUris: ReadonlySet<string> = new Set();
  const buildEvidence = () =>
    buildDiagnosticRefreshEvidence({
      requestedFiles: options.requestedFiles,
      resynchronization,
      synchronizations,
      failedPullUris,
      failedFiles: options.failedFiles(),
      failedResynchronizations: new Set(resynchronization.failedFiles),
      currentEvidenceRevision: options.evidenceRevision(),
      openDocuments: options.openDocuments,
      diagnosticStore: options.diagnosticStore,
    });

  // A fully reusable push-only refresh has no protocol work to collect.
  // Preserve the existing cache timing event format and return current evidence.
  if (prepared.fullyReusable) {
    observer.cacheReused(synchronizations.length);
    return buildEvidence();
  }

  const settleEpoch = options.waiters.settleEpoch;
  observer.synchronized();
  const documentCount = resynchronization.synchronizations.length;
  if (documentCount === 0) {
    observer.skipped(0);
    return buildEvidence();
  }

  if (supportsPull) {
    const pull = await collectPullEvidenceForRefresh({
      options,
      synchronizations,
      syncStart,
      maxWaitMs,
      observer,
    });
    failedPullUris = new Set(pull.failedPullUris);
    if (pull.completed) return buildEvidence();
  }

  const waitForDiagnosticSettle = (settleStart: number, settleGeneration: number) =>
    options.waiters.waitForSettle(
      {
        syncStart: settleStart,
        maxWaitMs,
        quietMs,
        settleEpoch: settleGeneration,
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

  let finalSettle = await waitForDiagnosticSettle(syncStart, settleEpoch);
  if (!supportsPull && finalSettle.outcome === "timed-out") {
    const reopen = await reopenUnconfirmedDocuments({
      options,
      synchronizations,
      observer,
    });
    if (reopen.performed) {
      synchronizations = reopen.synchronizations;
      // A large push-only project may still be processing the reopen batch.
      // The replacement pass uses the same collection budget as the initial pass.
      finalSettle = await waitForDiagnosticSettle(reopen.startedAt, options.waiters.settleEpoch);
    }
  }
  observer.pushSettled(documentCount, finalSettle);
  // A cancelled settle must not publish evidence the caller no longer awaits.
  throwIfCodeRequestInterrupted(options.options);
  return buildEvidence();
}

/**
 * Pull diagnostic evidence for every synchronized document, or fall through
 * to the push settle path when any pull fails. An interruption during the
 * pull phase stops the refresh instead of degrading into failed coverage.
 */
async function collectPullEvidenceForRefresh(options: {
  options: ClientDiagnosticRefreshOptions;
  synchronizations: readonly DiagnosticSynchronization[];
  syncStart: number;
  maxWaitMs: number;
  observer: DiagnosticObserver;
}): Promise<{ completed: boolean; failedPullUris: ReadonlySet<string> }> {
  const { options: refresh, synchronizations, syncStart, maxWaitMs, observer } = options;
  try {
    await pullDiagnosticsForOpenDocuments({
      requests: synchronizations,
      syncStart,
      maxWaitMs,
      signal: refresh.options.signal,
      deadline: refresh.options.deadline,
      operationId: refresh.options.operationId,
      currentEvidenceRevision: refresh.evidenceRevision,
      openDocuments: refresh.openDocuments,
      diagnosticStore: refresh.diagnosticStore,
      waitForChange: () => refresh.waiters.waitForChange(),
      pullDiagnostics: (pullOptions) =>
        pullClientDiagnosticEvidenceFromHost({
          host: refresh.host,
          store: refresh.diagnosticStore,
          openDocuments: refresh.openDocuments,
          currentEvidenceRevision: refresh.evidenceRevision,
          isRelatedUriTracked: refresh.isRelatedUriTracked,
          request: {
            uri: pullOptions.request.uri,
            timeoutMs: pullOptions.timeoutMs,
            synchronizationId: pullOptions.request.synchronizationId,
            evidenceRevision:
              refresh.openDocuments.get(pullOptions.request.uri)?.evidenceRevision ??
              refresh.evidenceRevision(),
            signal: pullOptions.signal,
            deadline: pullOptions.deadline,
            operationId: pullOptions.operationId,
          },
        }),
    });
    observer.pullCompleted(synchronizations.length);
    return { completed: true, failedPullUris: new Set() };
  } catch (error) {
    observer.pullFailed(error);
    if (error instanceof DiagnosticPullError) {
      return { completed: false, failedPullUris: new Set(error.failedUris) };
    }
    if (isCodeRequestInterruption(error, refresh.options)) throw error;
    return { completed: false, failedPullUris: new Set() };
  }
}

/**
 * Reopen-resync fallback (R2): on push-only routes an open document that

 * stays unconfirmed after the settle window receives no further push — a
 * clean file gets no push on didChange at all. Close and reopen each
 * unconfirmed document so the server publishes on didOpen, then settle
 * again within a bounded second window. The cache entry and version
 * history survive the reopen; other documents keep their server state.
 */
async function reopenUnconfirmedDocuments(options: {
  options: ClientDiagnosticRefreshOptions;
  synchronizations: readonly DiagnosticSynchronization[];
  observer: DiagnosticObserver;
}): Promise<{
  performed: boolean;
  startedAt: number;
  synchronizations: DiagnosticSynchronization[];
}> {
  const { options: refresh, synchronizations, observer } = options;
  const startedAt = Date.now();
  const unconfirmed = synchronizations.filter(
    (item) => !hasFreshEvidence(refresh.diagnosticStore, item, refresh.evidenceRevision()),
  );
  const reopenedSynchronizations: DiagnosticSynchronization[] = [];
  for (const item of unconfirmed) {
    const document = refresh.openDocuments.get(item.uri);
    if (!document) continue;
    const filePath = uriToFile(item.uri);
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      // The file disappeared mid-refresh; keep the document as-is and
      // report its current unconfirmed coverage.
      continue;
    }
    reopenDocument({
      uri: item.uri,
      content,
      document,
      languageId: detectLanguageId(filePath),
      nextVersion: () => nextDocumentVersion(refresh.versionHistory, item.uri),
      nextSynchronizationId: refresh.nextSynchronizationId,
      evidenceRevision: refresh.evidenceRevision(),
      waiters: refresh.waiters,
      sendNotification: (method, params) => refresh.host.sendNotification(method, params),
      markUnversionedSyncMoment: () => refresh.markUnversionedSyncMoment(item.uri),
    });
    reopenedSynchronizations.push({
      uri: item.uri,
      synchronizationId: document.synchronizationId,
      evidenceRevision: document.evidenceRevision,
    });
  }
  if (reopenedSynchronizations.length === 0) {
    return { performed: false, startedAt, synchronizations: [...synchronizations] };
  }
  observer.reopened(reopenedSynchronizations.length);
  const reopenedByUri = new Map(reopenedSynchronizations.map((item) => [item.uri, item]));
  return {
    performed: true,
    startedAt,
    synchronizations: synchronizations.map((item) => reopenedByUri.get(item.uri) ?? item),
  };
}
