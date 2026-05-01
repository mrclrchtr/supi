// LSP Client diagnostic refresh — pull diagnostics and push settle logic.
// Extracted from client.ts to keep file sizes manageable.

import { existsSync, readFileSync } from "node:fs";
import type { LspClient } from "./client.ts";
import type { DocumentDiagnosticReport, TextDocumentIdentifier } from "./types.ts";
import { uriToFile } from "./utils.ts";

// biome-ignore lint/suspicious/noExplicitAny: accessing private members for testing
type ClientAccess = any;

/**
 * Re-read and re-sync all currently open, existing documents for a client.
 * Uses pull diagnostics when the server supports them, otherwise falls back
 * to push-diagnostic settling. Never throws.
 */
export async function refreshClientOpenDiagnostics(
  client: LspClient,
  options: { maxWaitMs?: number; quietMs?: number } = {},
): Promise<void> {
  const maxWaitMs = options.maxWaitMs ?? 3_000;
  const quietMs = options.quietMs ?? 200;

  if (client.status !== "running") return;

  const syncStart = Date.now();

  // Re-sync all open documents that still exist on disk
  const openDocs = (client as ClientAccess).openDocs as Map<
    string,
    { version: number; languageId: string }
  >;

  for (const [uri, doc] of openDocs) {
    const filePath = uriToFile(uri);
    try {
      if (!existsSync(filePath)) {
        clearFileState(client, uri);
        sendNotification(client, "textDocument/didClose", {
          textDocument: { uri } satisfies TextDocumentIdentifier,
        });
        continue;
      }
      const content = readFileSync(filePath, "utf-8");
      doc.version++;
      sendDidChange(client, uri, doc.version, content);
    } catch {
      // Read error — skip this file, keep it open
    }
  }

  if (openDocs.size === 0) return;

  // Try pull diagnostics if server supports them
  if (client.hasDiagnosticProvider) {
    try {
      await pullDiagnosticsForOpenDocs(client, syncStart, maxWaitMs);
      return;
    } catch {
      // Pull diagnostics failed — fall back to push settle
    }
  }

  // Fall back to push-diagnostic settling
  await waitForDiagnosticSettle(client, syncStart, maxWaitMs, quietMs);
}

/** Send a didChange notification through the client's RPC. */
function sendDidChange(client: LspClient, uri: string, version: number, content: string): void {
  sendNotification(client, "textDocument/didChange", {
    textDocument: { uri, version },
    contentChanges: [{ text: content }],
  });
}

/** Send an RPC notification through the client. */
function sendNotification(client: LspClient, method: string, params: unknown): void {
  const rpc = (client as ClientAccess).rpc;
  if (rpc) rpc.sendNotification(method, params);
}

/** Clear open doc and diagnostic state for a URI. */
function clearFileState(client: LspClient, uri: string): void {
  (client as ClientAccess).openDocs.delete(uri);
  (client as ClientAccess).diagnosticStore.delete(uri);
  (client as ClientAccess).releaseDiagnosticWaiters(uri);
}

/**
 * Request pull diagnostics for all open documents.
 * Throws if no diagnostics were successfully retrieved.
 */
async function pullDiagnosticsForOpenDocs(
  client: LspClient,
  syncStart: number,
  maxWaitMs: number,
): Promise<void> {
  const deadline = syncStart + maxWaitMs;
  const uris = Array.from(((client as ClientAccess).openDocs as Map<string, unknown>).keys());
  const results = await Promise.allSettled(
    uris.map(async (uri) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("pull diagnostic timeout");

      return pullDiagnosticsForUri(client, uri, remaining);
    }),
  );

  const anySuccess = results.some((result) => result.status === "fulfilled" && result.value);
  const hadFailure = results.some((result) => result.status === "rejected");

  if ((hadFailure || !anySuccess) && uris.length > 0) {
    throw new Error("pull diagnostics incomplete");
  }
}

/** Pull diagnostics for a single URI and apply the report to the cache. */
export async function pullDiagnosticsForUri(
  client: LspClient,
  uri: string,
  timeoutMs: number,
): Promise<boolean> {
  const report = await pullDocumentDiagnostics(client, uri, timeoutMs);
  if (!report) return false;
  applyPullReport(client, uri, report);
  return true;
}

/** Pull diagnostics for a single document with timeout. */
async function pullDocumentDiagnostics(
  client: LspClient,
  uri: string,
  timeoutMs: number,
): Promise<DocumentDiagnosticReport | null> {
  const rpc = (client as ClientAccess).rpc;
  if (!rpc || client.status !== "running") {
    throw new Error("client not running");
  }

  const previousResultId = (client as ClientAccess).diagnosticStore.get(uri)?.resultId;
  return rpc.sendRequest(
    "textDocument/diagnostic",
    {
      textDocument: { uri },
      previousResultId,
    },
    { timeoutMs },
  ) as Promise<DocumentDiagnosticReport>;
}

/** Apply a pull diagnostic report to the cache, including related documents. */
function applyPullReport(client: LspClient, uri: string, report: DocumentDiagnosticReport): void {
  if (report.kind === "full") {
    (client as ClientAccess).diagnosticStore.set(uri, {
      diagnostics: report.items,
      receivedAt: Date.now(),
      resultId: report.resultId,
    });
  } else if (report.kind === "unchanged" && report.resultId) {
    const current = (client as ClientAccess).diagnosticStore.get(uri);
    if (current) current.resultId = report.resultId;
  }

  applyRelatedDocuments(client, report);
}

/** Extract and store related document diagnostics from a pull report. */
function applyRelatedDocuments(client: LspClient, report: DocumentDiagnosticReport): void {
  const related = (report as unknown as Record<string, unknown>).relatedDocuments;
  if (!related || typeof related !== "object") return;

  for (const [relatedUri, relatedReport] of Object.entries(
    related as Record<string, DocumentDiagnosticReport>,
  )) {
    if (relatedReport.kind === "full" && relatedReport.items) {
      (client as ClientAccess).diagnosticStore.set(relatedUri, {
        diagnostics: relatedReport.items,
        receivedAt: Date.now(),
        resultId: relatedReport.resultId,
      });
    }
  }
}

/**
 * Wait until no publishDiagnostics notifications arrive for quietMs
 * after syncStart, or until maxWaitMs elapses.
 */
async function waitForDiagnosticSettle(
  client: LspClient,
  syncStart: number,
  maxWaitMs: number,
  quietMs: number,
): Promise<void> {
  const deadline = syncStart + maxWaitMs;

  while (Date.now() < deadline) {
    const lastReceived = lastDiagnosticReceivedTimeAfter(client, syncStart) || syncStart;
    const elapsed = Date.now() - lastReceived;
    if (elapsed >= quietMs) {
      return;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(quietMs - elapsed, deadline - Date.now(), 50)),
    );
  }
}

/** Get the most recent receivedAt timestamp after a given time. */
function lastDiagnosticReceivedTimeAfter(client: LspClient, afterTime: number): number {
  let latest = 0;
  const store = (client as ClientAccess).diagnosticStore as Map<string, { receivedAt: number }>;
  for (const entry of store.values()) {
    if (entry.receivedAt > afterTime && entry.receivedAt > latest) {
      latest = entry.receivedAt;
    }
  }
  return latest;
}
