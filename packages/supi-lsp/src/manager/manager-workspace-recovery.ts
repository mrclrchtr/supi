import {
  assessStaleDiagnostics,
  type StaleDiagnosticAssessment,
} from "../diagnostics/stale-diagnostics.ts";
import type { Diagnostic, FileEvent } from "../types.ts";

export interface WorkspaceRecoveryResult {
  refreshedClients: number;
  restartedClients: number;
  staleAssessment: StaleDiagnosticAssessment;
}

export interface WorkspaceRecoveryHost {
  clearAllPullResultIds(): void;
  notifyWorkspaceFileChanges(changes: FileEvent[]): void;
  refreshOpenDiagnostics(options?: { maxWaitMs?: number; quietMs?: number }): Promise<void>;
  getOutstandingDiagnostics(
    maxSeverity?: number,
  ): Array<{ file: string; diagnostics: Diagnostic[] }>;
  getStatus(): { servers: Array<{ status: "running" | "error" | "unavailable" }> };
  restartClientsForFiles(filePaths: string[]): Promise<string[]>;
}

/** Clear cached pull IDs and forward watched-file changes to active clients. */
export function softRecoverWorkspaceDiagnostics(
  host: WorkspaceRecoveryHost,
  changes: FileEvent[] = [],
): number {
  host.clearAllPullResultIds();
  if (changes.length > 0) host.notifyWorkspaceFileChanges(changes);
  return countRunningClients(host);
}

/** Run a recovery pass, refreshing diagnostics and escalating if stale state remains. */
export async function recoverWorkspaceDiagnostics(
  host: WorkspaceRecoveryHost,
  options: {
    changes?: FileEvent[];
    restartIfStillStale?: boolean;
    maxWaitMs?: number;
    quietMs?: number;
  } = {},
): Promise<WorkspaceRecoveryResult> {
  const refreshedClients = softRecoverWorkspaceDiagnostics(host, options.changes ?? []);

  try {
    await host.refreshOpenDiagnostics({ maxWaitMs: options.maxWaitMs, quietMs: options.quietMs });
  } catch {
    // Recovery should be best-effort.
  }

  let staleAssessment = assessStaleDiagnostics(host.getOutstandingDiagnostics(1));
  let restartedClients = 0;

  if (options.restartIfStillStale && staleAssessment.suspected) {
    const restarted = await host.restartClientsForFiles(
      staleAssessment.matchedFiles.map((entry) => entry.file),
    );
    restartedClients = restarted.length;

    if (restartedClients > 0) {
      try {
        await host.refreshOpenDiagnostics({
          maxWaitMs: options.maxWaitMs,
          quietMs: options.quietMs,
        });
      } catch {
        // Keep the previous assessment if the follow-up refresh fails.
      }
      staleAssessment = assessStaleDiagnostics(host.getOutstandingDiagnostics(1));
    }
  }

  return {
    refreshedClients,
    restartedClients,
    staleAssessment,
  };
}

function countRunningClients(host: WorkspaceRecoveryHost): number {
  return host.getStatus().servers.filter((server) => server.status === "running").length;
}
