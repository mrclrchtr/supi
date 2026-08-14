import * as path from "node:path";
import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import type { LspClient } from "../client/client.ts";
import { getDiagnosticFileState } from "../client/client-file-state.ts";
import {
  type DiagnosticEvidenceDocument,
  type DiagnosticEvidenceSummary,
  summarizeDiagnosticEvidence,
} from "../diagnostics/evidence.ts";
import { uriToFile } from "../utils.ts";

export function closeFileAcrossClients(clients: Iterable<LspClient>, filePath: string): void {
  const resolvedPath = path.resolve(filePath);
  for (const client of clients) {
    client.didClose(resolvedPath);
  }
}

export function pruneMissingFilesFromClients(clients: Iterable<LspClient>): string[] {
  const removed: string[] = [];
  for (const client of clients) {
    const prune = (client as unknown as { pruneMissingFiles?: () => string[] }).pruneMissingFiles;
    if (typeof prune === "function") {
      removed.push(...prune.call(client));
    }
  }
  return removed;
}

export async function refreshOpenDiagnosticsForClients(
  clients: Iterable<LspClient>,
  options?: { maxWaitMs?: number; quietMs?: number } & CodeRequestControl,
): Promise<DiagnosticEvidenceSummary> {
  const documents: DiagnosticEvidenceDocument[] = [];
  const refreshes = Array.from(clients).map(async (client) => {
    const trackedFiles = [...client.openFiles];
    if (client.status !== "running") {
      documents.push(...failedCoverageForClient(client, trackedFiles));
      return;
    }

    try {
      const result = await client.refreshOpenDiagnostics(options);
      const reportedFiles = new Set(result.documents.map((document) => document.file));
      documents.push(...result.documents);
      documents.push(
        ...trackedFiles
          .filter((file) => !reportedFiles.has(file))
          .map((file) => ({ file, status: "failed" as const })),
      );
    } catch {
      // Keep failed coverage for every document requested by the client.
      documents.push(...failedCoverageForClient(client, trackedFiles));
    }
  });
  await Promise.all(refreshes);
  return summarizeDiagnosticEvidence(deduplicateEvidenceDocuments(documents));
}

function failedCoverageForClient(
  client: LspClient,
  trackedFiles: readonly string[],
): DiagnosticEvidenceDocument[] {
  const snapshot = client.getDiagnosticSnapshot();
  const files = new Set([
    ...trackedFiles,
    ...snapshot.documents.map((document) => uriToFile(document.uri)),
  ]);
  return Array.from(files).map((file) => ({
    file,
    status: getDiagnosticFileState(file) === "removed" ? ("removed" as const) : ("failed" as const),
  }));
}

function deduplicateEvidenceDocuments(
  documents: readonly DiagnosticEvidenceDocument[],
): DiagnosticEvidenceDocument[] {
  const byFile = new Map<string, DiagnosticEvidenceDocument>();
  for (const document of documents) {
    const existing = byFile.get(document.file);
    if (!existing || evidenceStatusRank(document.status) > evidenceStatusRank(existing.status)) {
      byFile.set(document.file, document);
    }
  }
  return Array.from(byFile.values()).sort((a, b) => a.file.localeCompare(b.file));
}

function evidenceStatusRank(status: DiagnosticEvidenceDocument["status"]): number {
  switch (status) {
    case "confirmed":
      return 1;
    case "unconfirmed":
      return 2;
    case "failed":
      return 3;
    case "removed":
      return 4;
  }
}
