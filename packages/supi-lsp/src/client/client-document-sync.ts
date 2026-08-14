import { readFileSync } from "node:fs";
import type { TextDocumentItem, VersionedTextDocumentIdentifier } from "../config/types.ts";
import type { DiagnosticSynchronization } from "./client-diagnostic-evidence.ts";
import type { DiagnosticWaitRegistry } from "./client-diagnostic-waiters.ts";
import { fingerprintDocumentContent, type OpenDocumentState } from "./client-document-state.ts";
import { getDiagnosticFileState } from "./client-file-state.ts";

type NotificationSender = (method: string, params: unknown) => void;

interface SynchronizeDocumentOptions {
  uri: string;
  content: string;
  document: OpenDocumentState;
  version: number;
  synchronizationId: number;
  evidenceRevision: number;
  waiters: DiagnosticWaitRegistry;
  sendNotification: NotificationSender;
}

/** Advance and publish one explicit document synchronization. */
export function synchronizeDocument(options: SynchronizeDocumentOptions): void {
  options.waiters.releaseFile(options.uri);
  options.waiters.cancelSettle();
  options.document.version = options.version;
  options.document.synchronizationId = options.synchronizationId;
  options.document.evidenceRevision = options.evidenceRevision;
  options.document.contentFingerprint = fingerprintDocumentContent(options.content);
  options.sendNotification("textDocument/didChange", {
    textDocument: {
      uri: options.uri,
      version: options.version,
    } satisfies VersionedTextDocumentIdentifier,
    contentChanges: [{ text: options.content }],
  });
}

/** Remove one document and release all diagnostic waits for its URI. */
export function clearTrackedDocumentState(
  openDocuments: Map<string, OpenDocumentState>,
  diagnosticStore: Map<string, unknown>,
  waiters: DiagnosticWaitRegistry,
  uri: string,
): void {
  openDocuments.delete(uri);
  diagnosticStore.delete(uri);
  waiters.releaseFile(uri);
  waiters.cancelSettle();
}

/** Close and reopen one open document while preserving cache and version history. */
export function reopenDocument(options: {
  uri: string;
  content: string;
  document: OpenDocumentState;
  languageId: string;
  nextVersion(): number;
  nextSynchronizationId(): number;
  evidenceRevision: number;
  waiters: DiagnosticWaitRegistry;
  sendNotification: NotificationSender;
  markUnversionedSyncMoment?(): void;
}): void {
  // Mirror didClose release semantics: pending waiters for this URI observe
  // the protocol close, and the settle generation is cancelled so concurrent
  // settles re-arm against the reopened state.
  options.waiters.releaseFile(options.uri);
  options.waiters.cancelSettle();
  options.markUnversionedSyncMoment?.();
  options.sendNotification("textDocument/didClose", {
    textDocument: { uri: options.uri },
  });
  const version = options.nextVersion();
  options.document.version = version;
  options.document.synchronizationId = options.nextSynchronizationId();
  options.document.evidenceRevision = options.evidenceRevision;
  options.document.contentFingerprint = fingerprintDocumentContent(options.content);
  options.sendNotification("textDocument/didOpen", {
    textDocument: {
      uri: options.uri,
      languageId: options.languageId,
      version,
      text: options.content,
    } satisfies TextDocumentItem,
  });
}

/** Synchronize one open document, or open it when the route is not tracked yet. */
export function synchronizeTrackedDocument(options: {
  uri: string;
  content: string;
  document: OpenDocumentState | undefined;
  nextVersion(): number;
  nextSynchronizationId(): number;
  evidenceRevision: number;
  waiters: DiagnosticWaitRegistry;
  sendNotification: NotificationSender;
  markUnversionedSyncMoment?(): void;
  clearFailedFile?(): void;
  open(): void;
}): void {
  if (!options.document) {
    options.open();
    return;
  }
  options.markUnversionedSyncMoment?.();
  synchronizeDocument({
    uri: options.uri,
    content: options.content,
    document: options.document,
    version: options.nextVersion(),
    synchronizationId: options.nextSynchronizationId(),
    evidenceRevision: options.evidenceRevision,
    waiters: options.waiters,
    sendNotification: options.sendNotification,
  });
  options.clearFailedFile?.();
}

interface ResynchronizeDocumentsOptions {
  openDocuments: Map<string, OpenDocumentState>;
  waiters: DiagnosticWaitRegistry;
  nextVersion(uri: string): number;
  nextSynchronizationId(): number;
  evidenceRevision: number;
  sendNotification: NotificationSender;
  uriToFile(uri: string): string;
  clearFile(uri: string): void;
  invalidateEvidence(uri: string): void;
  markUnversionedSyncMoment(uri: string): void;
  clearFailedFile(uri: string): void;
}

/** Document coverage produced while re-reading tracked files for refresh. */
export interface ResynchronizeDocumentsResult {
  /** Documents that were synchronized and can receive fresh evidence. */
  synchronizations: DiagnosticSynchronization[];
  /** Existing tracked documents removed because their files no longer exist. */
  removedFiles: string[];
  /** Existing tracked documents that could not be read or synchronized. */
  failedFiles: string[];
}

/** Re-read and synchronize every existing open document. */
export function resynchronizeOpenDocuments(
  options: ResynchronizeDocumentsOptions,
): ResynchronizeDocumentsResult {
  const synchronizations: DiagnosticSynchronization[] = [];
  const removedFiles: string[] = [];
  const failedFiles: string[] = [];
  for (const [uri, document] of options.openDocuments) {
    const filePath = options.uriToFile(uri);
    try {
      options.markUnversionedSyncMoment(uri);
      synchronizeDocument({
        uri,
        content: readFileSync(filePath, "utf-8"),
        document,
        version: options.nextVersion(uri),
        synchronizationId: options.nextSynchronizationId(),
        evidenceRevision: options.evidenceRevision,
        waiters: options.waiters,
        sendNotification: options.sendNotification,
      });
      options.clearFailedFile(uri);
      synchronizations.push({
        uri,
        synchronizationId: document.synchronizationId,
        evidenceRevision: document.evidenceRevision,
      });
    } catch {
      if (getDiagnosticFileState(filePath) === "removed") {
        options.clearFile(uri);
        options.sendNotification("textDocument/didClose", { textDocument: { uri } });
        removedFiles.push(filePath);
        continue;
      }
      options.invalidateEvidence(uri);
      options.markUnversionedSyncMoment(uri);
      failedFiles.push(filePath);
      // Keep the document open when a transient read fails.
    }
  }
  return { synchronizations, removedFiles, failedFiles };
}
