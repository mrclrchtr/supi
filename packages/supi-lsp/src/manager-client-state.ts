import * as path from "node:path";
import type { LspClient } from "./client.ts";

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
  options?: { maxWaitMs?: number; quietMs?: number },
): Promise<void> {
  const refreshes = Array.from(clients)
    .filter((client) => client.status === "running")
    .map((client) =>
      client.refreshOpenDiagnostics(options).catch(() => {
        // Soft-fail: LSP errors must not prevent agent startup
      }),
    );
  await Promise.all(refreshes);
}
