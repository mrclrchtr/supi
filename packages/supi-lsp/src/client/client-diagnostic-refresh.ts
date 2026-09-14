// biome-ignore-all lint/style/noExcessiveLinesPerFile: refresh orchestration and evidence collection stay in one cohesive module.
import { readFileSync } from "node:fs";
import {
  type CodeRequestControl,
  isCodeRequestDeadlineError,
  isCodeRequestInterruption,
  throwIfCodeRequestInterrupted,
} from "@mrclrchtr/supi-code-runtime/api";
import { fileToUri, uriToFile } from "@mrclrchtr/supi-core/path";
import type { TextDocumentIdentifier } from "../config/types.ts";
import {
  type DiagnosticEvidenceSummary,
  summarizeDiagnosticEvidence,
} from "../diagnostics/evidence.ts";
import { raceRequestControl } from "../session/readiness.ts";
import {
  type DiagnosticCacheEntry,
  type DiagnosticSynchronization,
  hasCurrentEvidence,
  hasFreshEvidence,
  latestCurrentEvidenceReceivedAt,
  nextDocumentVersion,
} from "./client-diagnostic-evidence.ts";
import type { ClientDiagnosticsHost } from "./client-diagnostic-host.ts";
import type {
  DiagnosticPublicationIdentity,
  DiagnosticPublicationSynchronization,
} from "./client-diagnostic-publication.ts";
import { isDiagnosticRequestInvalidated } from "./client-diagnostic-request.ts";
import { DiagnosticObserver, isDiagnosticTimeout } from "./client-diagnostic-timing.ts";
import type { DiagnosticWaitRegistry } from "./client-diagnostic-waiters.ts";
import {
  fingerprintDocumentContent,
  hasConfirmedDiagnosticEvidence,
  type OpenDocumentState,
} from "./client-document-state.ts";
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
  /** Synchronizations that can prove evidence after this refresh. */
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
      hasSettledRefreshEvidence({
        store: options.diagnosticStore,
        synchronization,
        currentEvidenceRevision: options.currentEvidenceRevision,
      })
    ) {
      return { file, status: "confirmed" as const };
    }
    const currentPushObservation = Boolean(
      synchronization &&
        options.diagnosticStore.get(uri)?.source === "push" &&
        hasCurrentEvidence(
          options.diagnosticStore,
          synchronization,
          options.currentEvidenceRevision,
        ),
    );
    return {
      file,
      // A failed request with a current ambient push remains unconfirmed, not
      // failed: the push is useful observation but cannot confirm the file.
      status:
        options.failedPullUris.has(uri) && !currentPushObservation
          ? ("failed" as const)
          : ("unconfirmed" as const),
    };
  });
  return summarizeDiagnosticEvidence(documents);
}

/** Test whether fresh evidence can confirm this refresh result. */
function hasSettledRefreshEvidence(options: {
  store: ReadonlyMap<string, DiagnosticCacheEntry>;
  synchronization: DiagnosticSynchronization;
  currentEvidenceRevision: number;
}): boolean {
  return hasFreshEvidence(options.store, options.synchronization, options.currentEvidenceRevision);
}

interface OpenDocumentRequestCollectionOptions {
  readonly requests: readonly DiagnosticSynchronization[];
  readonly syncStart: number;
  readonly maxWaitMs: number;
  readonly signal?: AbortSignal;
  readonly deadline?: number;
  readonly operationId?: string;
  readonly pullDiagnostics: (options: {
    request: DiagnosticSynchronization;
    timeoutMs: number;
    signal: AbortSignal;
    operationId?: string;
    deadline?: number;
  }) => Promise<boolean>;
}

/** Collect request-based evidence sequentially within one refresh budget. */
export async function pullDiagnosticsForOpenDocuments(
  options: OpenDocumentRequestCollectionOptions,
): Promise<{
  failedUris: readonly string[];
  incompleteUris: readonly string[];
  timedOut: boolean;
}> {
  const deadline = Math.min(
    options.syncStart + options.maxWaitMs,
    options.deadline ?? Number.POSITIVE_INFINITY,
  );
  const failedUris: string[] = [];
  const incompleteUris: string[] = [];
  let timedOut = false;

  for (const request of options.requests) {
    throwIfCodeRequestInterrupted({ signal: options.signal, deadline: options.deadline });
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      timedOut = true;
      break;
    }
    const outcome = await collectOneRefreshRequest(options, request, remaining, deadline);
    if (outcome === "failed") failedUris.push(request.uri);
    if (outcome === "incomplete") incompleteUris.push(request.uri);
    if (outcome === "timed-out") {
      timedOut = true;
      break;
    }
  }

  throwIfCodeRequestInterrupted({ signal: options.signal, deadline: options.deadline });
  return { failedUris, incompleteUris, timedOut };
}

type RefreshRequestOutcome = "completed" | "failed" | "incomplete" | "timed-out";

async function collectOneRefreshRequest(
  options: OpenDocumentRequestCollectionOptions,
  request: DiagnosticSynchronization,
  timeoutMs: number,
  collectionDeadline: number,
): Promise<RefreshRequestOutcome> {
  const pullController = new AbortController();
  const onAbort = () => pullController.abort(options.signal?.reason);
  if (options.signal?.aborted) onAbort();
  else options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const result = options.pullDiagnostics({
      request,
      timeoutMs,
      signal: pullController.signal,
      operationId: options.operationId,
      // The adapter receives the per-refresh deadline. This prevents queued
      // work from starting after the bounded refresh budget expires.
      deadline: collectionDeadline,
    });
    const completed = await raceRequestControl(result, {
      signal: options.signal,
      deadline: collectionDeadline,
    });
    return completed ? "completed" : "incomplete";
  } catch (error) {
    if (isDiagnosticRequestInvalidated(error)) return "incomplete";
    if (
      options.signal?.aborted ||
      (options.deadline !== undefined && Date.now() >= options.deadline)
    ) {
      throw error;
    }
    if (isCodeRequestDeadlineError(error)) return "timed-out";
    return isDiagnosticTimeout(error) ? "timed-out" : "failed";
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Classify open documents for a refresh by disk content.
 *
 * A document whose disk content still matches its open fingerprint stays in
 * the server's current state:
 * - with current evidence it is reusable without document synchronization;
 * - without current evidence it is retained: it keeps its server version and
 *   receives fresh request or push evidence without a no-op didChange.
 *
 * A workspace change invalidates diagnostic evidence for every open document,
 * but only changed text is synchronized. This separates evidence generation
 * from document synchronization and avoids restarting a server's full-program
 * check for unchanged files.
 */
function classifyReusableDocuments(options: {
  openDocuments: ReadonlyMap<string, OpenDocumentState>;
  diagnosticStore: ReadonlyMap<string, DiagnosticCacheEntry>;
  evidenceRevision: number;
  failedFiles: ReadonlySet<string>;
}): {
  reusableUris: Set<string>;
  retainedUris: Set<string>;
  preloadedContent: Map<string, string>;
} {
  const reusableUris = new Set<string>();
  const retainedUris = new Set<string>();
  const preloadedContent = new Map<string, string>();
  for (const [uri, document] of options.openDocuments) {
    const filePath = uriToFile(uri);
    if (options.failedFiles.has(filePath)) continue;
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      // The resynchronization path classifies removed and unreadable files.
      continue;
    }
    if (fingerprintDocumentContent(content) !== document.contentFingerprint) {
      preloadedContent.set(uri, content);
      continue;
    }
    if (
      hasConfirmedDiagnosticEvidence(
        document,
        options.diagnosticStore.get(uri),
        options.evidenceRevision,
      )
    ) {
      reusableUris.add(uri);
    } else {
      retainedUris.add(uri);
    }
  }
  return { reusableUris, retainedUris, preloadedContent };
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
  /** Invalidate route evidence before applying a disk content change. */
  readonly noteInputContentChange: () => number;
  /** Keep the shared semantic barrier's disk-content baseline current. */
  readonly rememberDocumentContent: (uri: string, content: string) => void;
  readonly clearFile: (uri: string) => void;
  readonly invalidateEvidence: (uri: string) => void;
  readonly markUnversionedSyncMoment: (uri: string) => void;
  readonly clearFailedFile: (uri: string) => void;
  /** Shared request engine used for every request-based diagnostic source. */
  readonly requestDiagnostics: (options: {
    request: DiagnosticSynchronization;
    timeoutMs: number;
    signal?: AbortSignal;
    deadline?: number;
    operationId?: string;
  }) => Promise<boolean>;
  /** Server-requested refreshes bypass normal push-only evidence reuse. */
  readonly forceResynchronize?: boolean;
  readonly options: { maxWaitMs?: number; quietMs?: number } & CodeRequestControl;
  /** Push-publication telemetry surface for this client. */
  readonly publications: {
    emitSummary(options: {
      readonly operation: "refresh-open";
      readonly identity: DiagnosticPublicationIdentity;
      readonly synchronizations: readonly DiagnosticPublicationSynchronization[];
      readonly operationId?: string;
    }): void;
  };
}

interface PreparedRefreshDocuments {
  readonly resynchronization: ResynchronizeDocumentsResult;
  readonly synchronizations: DiagnosticSynchronization[];
  readonly fullyReusable: boolean;
}

/** Classify reusable documents, then resynchronize only the remaining set. */
function prepareRefreshDocuments(
  options: ClientDiagnosticRefreshOptions,
  evidenceRevision: number,
): PreparedRefreshDocuments {
  const reuseEnabled = !options.forceResynchronize;
  const classification = reuseEnabled
    ? classifyReusableDocuments({
        openDocuments: options.openDocuments,
        diagnosticStore: options.diagnosticStore,
        evidenceRevision,
        failedFiles: options.failedFiles(),
      })
    : undefined;
  const reusableUris = classification?.reusableUris ?? new Set<string>();
  const retainedUris = classification?.retainedUris ?? new Set<string>();
  const documentsToResynchronize = new Map(
    Array.from(options.openDocuments).filter(
      ([uri]) => !reusableUris.has(uri) && !retainedUris.has(uri),
    ),
  );
  const resynchronization = resynchronizeOpenDocuments({
    openDocuments: documentsToResynchronize,
    waiters: options.waiters,
    nextVersion: (uri) => nextDocumentVersion(options.versionHistory, uri),
    nextSynchronizationId: options.nextSynchronizationId,
    evidenceRevision,
    noteInputContentChange: options.noteInputContentChange,
    rememberDocumentContent: options.rememberDocumentContent,
    incrementalSync: options.host.usesIncrementalDocumentSync(),
    sendNotification: (method, params) => options.host.sendNotification(method, params),
    uriToFile,
    preloadedContent: classification?.preloadedContent,
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
  // Retained documents keep their current synchronization: settle waits for
  // the server's existing pipeline without any protocol work.
  const retainedSynchronizations: DiagnosticSynchronization[] = [];
  for (const uri of retainedUris) {
    const document = options.openDocuments.get(uri);
    if (!document) continue;
    retainedSynchronizations.push({
      uri,
      synchronizationId: document.synchronizationId,
      ...(document.evidenceRevision === evidenceRevision ? { evidenceRevision } : {}),
    });
  }
  const synchronizations = [
    ...reusableSynchronizations,
    ...retainedSynchronizations,
    ...resynchronization.synchronizations,
  ];
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
  const requestAdapter = options.host.diagnosticRequestAdapter;
  const hasDiagnosticRequestAdapter = Array.from(options.openDocuments.keys()).some((uri) =>
    requestAdapter.supports(uri),
  );
  const observer = new DiagnosticObserver(
    "refresh-open",
    hasDiagnosticRequestAdapter,
    options.options,
    {
      server: options.host.server,
      cwd: options.host.cwd,
    },
  );
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
  const prepared = prepareRefreshDocuments(options, options.evidenceRevision());
  const resynchronization = prepared.resynchronization;
  const synchronizations = prepared.synchronizations;
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

  const settleEpoch = options.waiters.settleEpoch;
  observer.synchronized();
  if (synchronizations.length === 0) {
    observer.skipped(0);
    return buildEvidence();
  }

  const requestSynchronizations = synchronizations.filter((synchronization) =>
    requestAdapter.supports(synchronization.uri),
  );
  // A fully reusable push-only refresh has no protocol work to collect.
  if (prepared.fullyReusable && requestSynchronizations.length === 0) {
    observer.cacheReused(synchronizations.length);
    return buildEvidence();
  }
  const pushSynchronizations = synchronizations.filter(
    (synchronization) => !requestSynchronizations.includes(synchronization),
  );

  const waitForDiagnosticSettle = (
    targetSynchronizations: readonly DiagnosticSynchronization[],
    settleStart: number,
    settleGeneration: number,
  ) =>
    options.waiters.waitForSettle(
      {
        syncStart: settleStart,
        maxWaitMs,
        quietMs,
        settleEpoch: settleGeneration,
        latestReceived: () =>
          latestCurrentEvidenceReceivedAt(
            options.diagnosticStore,
            targetSynchronizations,
            options.evidenceRevision(),
          ),
      },
      options.options,
    );

  if (requestSynchronizations.length > 0) {
    const request = await collectPullEvidenceForRefresh({
      options,
      synchronizations: requestSynchronizations,
      syncStart,
      maxWaitMs,
    });
    failedPullUris = new Set(request.failedPullUris);
    const source = requestSourceFor(options.host, requestSynchronizations);
    if (pushSynchronizations.length === 0) {
      if (request.completed) observer.requestCompleted(source, requestSynchronizations.length);
      else observer.requestIncomplete(source, request.timedOut, requestSynchronizations.length);
      throwIfCodeRequestInterrupted(options.options);
      emitRefreshPublicationSummary(options, synchronizations);
      return buildEvidence();
    }
    if (request.completed) {
      observer.requestCompleted(source, requestSynchronizations.length, false);
    } else {
      observer.requestIncomplete(source, request.timedOut, requestSynchronizations.length, false);
    }
    const finalSettle = await waitForDiagnosticSettle(pushSynchronizations, syncStart, settleEpoch);
    observer.mixedSettled(source, synchronizations.length, finalSettle);
    // Request failures are final for this bounded pass. Ambient pushes can
    // remain useful observations, but they cannot confirm the request route.
    throwIfCodeRequestInterrupted(options.options);
    emitRefreshPublicationSummary(options, synchronizations);
    return buildEvidence();
  }

  const finalSettle = await waitForDiagnosticSettle(synchronizations, syncStart, settleEpoch);
  observer.pushSettled(synchronizations.length, finalSettle);
  // A cancelled settle must not publish evidence the caller no longer awaits.
  throwIfCodeRequestInterrupted(options.options);
  emitRefreshPublicationSummary(options, synchronizations);
  return buildEvidence();
}

function emitRefreshPublicationSummary(
  options: ClientDiagnosticRefreshOptions,
  synchronizations: readonly DiagnosticSynchronization[],
): void {
  options.publications.emitSummary({
    operation: "refresh-open",
    identity: { server: options.host.server, cwd: options.host.cwd },
    synchronizations: synchronizations.map((synchronization) => ({
      uri: synchronization.uri,
      synchronizationId: synchronization.synchronizationId,
      evidenceRevision: synchronization.evidenceRevision ?? options.evidenceRevision(),
      confirmed: hasFreshEvidence(
        options.diagnosticStore,
        synchronization,
        options.evidenceRevision(),
      ),
    })),
    operationId: options.options.operationId,
  });
}

/** Collect request evidence for every applicable synchronized document. */
async function collectPullEvidenceForRefresh(options: {
  options: ClientDiagnosticRefreshOptions;
  synchronizations: readonly DiagnosticSynchronization[];
  syncStart: number;
  maxWaitMs: number;
}): Promise<{ completed: boolean; failedPullUris: ReadonlySet<string>; timedOut: boolean }> {
  const { options: refresh, synchronizations, syncStart, maxWaitMs } = options;
  try {
    const result = await pullDiagnosticsForOpenDocuments({
      requests: synchronizations,
      syncStart,
      maxWaitMs,
      signal: refresh.options.signal,
      deadline: refresh.options.deadline,
      operationId: refresh.options.operationId,
      pullDiagnostics: (pullOptions) =>
        refresh.requestDiagnostics({
          request: pullOptions.request,
          timeoutMs: pullOptions.timeoutMs,
          signal: pullOptions.signal,
          deadline: pullOptions.deadline,
          operationId: pullOptions.operationId,
        }),
    });
    const failedPullUris = new Set(result.failedUris);
    const incomplete =
      result.incompleteUris.length > 0 || failedPullUris.size > 0 || result.timedOut;
    return {
      completed: !incomplete,
      failedPullUris,
      timedOut: result.timedOut,
    };
  } catch (error) {
    if (isCodeRequestInterruption(error, refresh.options)) throw error;
    return { completed: false, failedPullUris: new Set(), timedOut: false };
  }
}

function requestSourceFor(
  host: ClientDiagnosticsHost,
  synchronizations: readonly DiagnosticSynchronization[],
): "pull" | "typescript" | "mixed" {
  const sources = new Set(
    synchronizations.map(
      (synchronization) => host.diagnosticRequestAdapter.sourceFor(synchronization.uri) ?? "pull",
    ),
  );
  if (sources.size === 1) return sources.values().next().value as "pull" | "typescript";
  return "mixed";
}
