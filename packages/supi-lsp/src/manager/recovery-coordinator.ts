// Recovery coordinator — orchestrates stale diagnostic recovery.

import type { LspManager } from "./manager.ts";

/**
 * Orchestrates stale diagnostic detection and recovery.
 */
export interface RecoveryCoordinator {
  /**
   * Trigger a workspace-wide diagnostics refresh.
   * Returns info about refreshed/restarted clients and stale assessment.
   */
  recover(options?: {
    restartIfStillStale?: boolean;
    maxWaitMs?: number;
    quietMs?: number;
  }): Promise<{
    refreshedClients: number;
    restartedClients: number;
    staleAssessment: {
      suspected: boolean;
      matchedFiles: Array<{ file: string; diagnostics: unknown[] }>;
      warning: string | null;
    };
  }>;
}

/**
 * Create a RecoveryCoordinator backed by LspManager.
 */
export function createRecoveryCoordinator(manager: LspManager): RecoveryCoordinator {
  return {
    async recover(options) {
      return manager.recoverWorkspaceDiagnostics(options);
    },
  };
}
