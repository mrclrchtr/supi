import { existsSync, readFileSync } from "node:fs";
import type { VersionedTextDocumentIdentifier } from "../config/types.ts";
import type { DiagnosticSynchronization } from "./client-diagnostic-evidence.ts";
import type { DiagnosticWaitRegistry } from "./client-diagnostic-waiters.ts";
import { fingerprintDocumentContent, type OpenDocumentState } from "./client-document-state.ts";

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

interface ResynchronizeDocumentsOptions {
  openDocuments: Map<string, OpenDocumentState>;
  waiters: DiagnosticWaitRegistry;
  nextVersion(uri: string): number;
  nextSynchronizationId(): number;
  evidenceRevision: number;
  sendNotification: NotificationSender;
  uriToFile(uri: string): string;
  clearFile(uri: string): void;
}

/** Re-read and synchronize every existing open document. */
export function resynchronizeOpenDocuments(
  options: ResynchronizeDocumentsOptions,
): DiagnosticSynchronization[] {
  const synchronizations: DiagnosticSynchronization[] = [];
  for (const [uri, document] of options.openDocuments) {
    const filePath = options.uriToFile(uri);
    try {
      if (!existsSync(filePath)) {
        options.clearFile(uri);
        options.sendNotification("textDocument/didClose", { textDocument: { uri } });
        continue;
      }
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
      synchronizations.push({ uri, synchronizationId: document.synchronizationId });
    } catch {
      // Keep the document open when a transient read fails.
    }
  }
  return synchronizations;
}
