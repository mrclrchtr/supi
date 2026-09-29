import { readFileSync } from "node:fs";
import {
  TextDocumentSyncKind,
  type VersionedTextDocumentIdentifier,
} from "vscode-languageserver-protocol";
import type { DiagnosticSynchronization } from "./client-diagnostic-evidence.ts";
import type { DiagnosticWaitRegistry } from "./client-diagnostic-waiters.ts";
import { fingerprintDocumentContent, type OpenDocumentState } from "./client-document-state.ts";
import { getDiagnosticFileState } from "./client-file-state.ts";

type NotificationSender = (method: string, params: unknown) => void;

/** Normalized document lifecycle options negotiated with one LSP server. */
export interface NormalizedDocumentSync {
  readonly openClose: boolean;
  readonly change: TextDocumentSyncKind;
  readonly save: boolean;
  readonly includeText: boolean;
}

const NO_DOCUMENT_SYNC: NormalizedDocumentSync = Object.freeze({
  openClose: false,
  change: TextDocumentSyncKind.None,
  save: false,
  includeText: false,
});

/**
 * Normalize structured and legacy numeric server synchronization options.
 * Legacy non-none values use the historical full lifecycle defaults.
 */
export function normalizeDocumentSync(value: unknown): NormalizedDocumentSync {
  if (value === TextDocumentSyncKind.None) return NO_DOCUMENT_SYNC;
  if (value === TextDocumentSyncKind.Full || value === TextDocumentSyncKind.Incremental) {
    return Object.freeze({
      openClose: true,
      change: value,
      save: true,
      includeText: false,
    });
  }
  if (!isRecord(value)) return NO_DOCUMENT_SYNC;

  const change = isTextDocumentSyncKind(value.change) ? value.change : TextDocumentSyncKind.None;
  const save = value.save === true || isRecord(value.save);
  return Object.freeze({
    openClose: value.openClose === true,
    change,
    save,
    includeText: isRecord(value.save) && value.save.includeText === true,
  });
}

function isTextDocumentSyncKind(value: unknown): value is TextDocumentSyncKind {
  return (
    value === TextDocumentSyncKind.None ||
    value === TextDocumentSyncKind.Full ||
    value === TextDocumentSyncKind.Incremental
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface SynchronizeDocumentOptions {
  uri: string;
  content: string;
  document: OpenDocumentState;
  version: number;
  synchronizationId: number;
  evidenceRevision: number;
  documentSync: NormalizedDocumentSync;
  waiters: DiagnosticWaitRegistry;
  sendNotification: NotificationSender;
}

function endPosition(content: string): { line: number; character: number } {
  const lines = content.split(/\r\n|\r|\n/);
  return { line: lines.length - 1, character: lines.at(-1)?.length ?? 0 };
}

/**
 * For incremental sync, replace the old full range with the new text.
 * This is a valid incremental edit and avoids a second text-diff engine.
 */
function contentChanges(
  previousContent: string,
  content: string,
  change: TextDocumentSyncKind,
): unknown[] {
  if (change === TextDocumentSyncKind.Incremental) {
    return [
      {
        range: {
          start: { line: 0, character: 0 },
          end: endPosition(previousContent),
        },
        text: content,
      },
    ];
  }
  return [{ text: content }];
}

/** Retain one document synchronization while advancing its evidence revision. */
function retainDocumentSynchronization(
  options: Pick<SynchronizeDocumentOptions, "uri" | "document" | "evidenceRevision" | "waiters">,
): void {
  options.waiters.releaseFile(options.uri);
  options.waiters.cancelSettle();
  options.document.evidenceRevision = options.evidenceRevision;
}

/** Advance and publish one explicit document synchronization. */
export function synchronizeDocument(options: SynchronizeDocumentOptions): void {
  retainDocumentSynchronization(options);
  options.document.version = options.version;
  options.document.synchronizationId = options.synchronizationId;
  const changes = contentChanges(
    options.document.content,
    options.content,
    options.documentSync.change,
  );
  options.document.content = options.content;
  options.document.contentFingerprint = fingerprintDocumentContent(options.content);
  if (options.documentSync.change === TextDocumentSyncKind.None) return;
  options.sendNotification("textDocument/didChange", {
    textDocument: {
      uri: options.uri,
      version: options.version,
    } satisfies VersionedTextDocumentIdentifier,
    contentChanges: changes,
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

/** Synchronize one open document, or open it when the route is not tracked yet. */
export function synchronizeTrackedDocument(options: {
  uri: string;
  content: string;
  document: OpenDocumentState | undefined;
  nextVersion(): number;
  nextSynchronizationId(): number;
  evidenceRevision: number;
  documentSync: NormalizedDocumentSync;
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
    documentSync: options.documentSync,
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
  documentSync: NormalizedDocumentSync;
  /** Invalidate route evidence before the first changed document is applied. */
  noteInputContentChange(): number;
  /** Record the verified disk content and report whether its baseline changed. */
  observeDiskContent(uri: string, content: string): boolean;
  /** Send one save for an externally observed disk change. */
  noteExternalDiskChange(uri: string, content: string): void;
  sendNotification: NotificationSender;
  uriToFile(uri: string): string;
  /** Disk content already read by classification; avoids a second read. */
  preloadedContent?: ReadonlyMap<string, string>;
  clearFile(uri: string): void;
  invalidateEvidence(uri: string): void;
  markUnversionedSyncMoment(uri: string): void;
  clearFailedFile(uri: string): void;
}

/** Document coverage produced while re-reading tracked files for refresh. */
export interface ResynchronizeDocumentsResult {
  /** Documents that were synchronized and can receive fresh evidence. */
  synchronizations: DiagnosticSynchronization[];
  /** URIs that received a new didChange synchronization in this pass. */
  resynchronizedUris: ReadonlySet<string>;
  /** Existing tracked documents removed because their files no longer exist. */
  removedFiles: string[];
  /** Existing tracked documents that could not be read or synchronized. */
  failedFiles: string[];
}

/** Send one save when a refresh observes a new disk fingerprint. */
function noteObservedDiskChange(
  options: ResynchronizeDocumentsOptions,
  uri: string,
  content: string,
): void {
  if (options.observeDiskContent(uri, content)) {
    options.noteExternalDiskChange(uri, content);
  }
}

/** Re-read and synchronize every existing open document. */
export function resynchronizeOpenDocuments(
  options: ResynchronizeDocumentsOptions,
): ResynchronizeDocumentsResult {
  const synchronizedUris = new Set<string>();
  const resynchronizedUris = new Set<string>();
  const removedFiles: string[] = [];
  const failedFiles: string[] = [];
  let synchronizationRevision = options.evidenceRevision;
  let inputChangeNoted = false;
  for (const [uri, document] of options.openDocuments) {
    const filePath = options.uriToFile(uri);
    try {
      options.markUnversionedSyncMoment(uri);
      const content = options.preloadedContent?.get(uri) ?? readFileSync(filePath, "utf-8");
      const contentChanged = fingerprintDocumentContent(content) !== document.contentFingerprint;
      if (contentChanged) {
        if (!inputChangeNoted) {
          synchronizationRevision = options.noteInputContentChange();
          inputChangeNoted = true;
        }
        synchronizeDocument({
          uri,
          content,
          document,
          version: options.nextVersion(uri),
          synchronizationId: options.nextSynchronizationId(),
          evidenceRevision: synchronizationRevision,
          documentSync: options.documentSync,
          waiters: options.waiters,
          sendNotification: options.sendNotification,
        });
      } else {
        // A failed read can select an unchanged open document for recovery.
        // Keep its protocol identity stable, but make the current evidence
        // generation eligible for a fresh request or push observation.
        retainDocumentSynchronization({
          uri,
          document,
          evidenceRevision: synchronizationRevision,
          waiters: options.waiters,
        });
      }
      noteObservedDiskChange(options, uri, content);
      options.clearFailedFile(uri);
      synchronizedUris.add(uri);
      if (contentChanged) resynchronizedUris.add(uri);
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
  const synchronizations: DiagnosticSynchronization[] = [];
  for (const uri of synchronizedUris) {
    const document = options.openDocuments.get(uri);
    if (!document) continue;
    synchronizations.push({
      uri,
      synchronizationId: document.synchronizationId,
      evidenceRevision: document.evidenceRevision,
    });
  }
  return { synchronizations, resynchronizedUris, removedFiles, failedFiles };
}
