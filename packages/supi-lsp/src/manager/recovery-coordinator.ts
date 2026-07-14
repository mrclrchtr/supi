// Recovery coordinator — owns stale-diagnostic refresh and restart policy.

import type { Diagnostic } from "../config/types.ts";
import type { LspManager } from "./manager.ts";

export interface RecoveryResult {
  readonly refreshedClients: number;
  readonly restartedClients: number;
  readonly staleAssessment: {
    readonly suspected: boolean;
    readonly matchedFiles: Array<{ file: string; diagnostics: Diagnostic[] }>;
    readonly warning: string | null;
  };
}

/** Workspace stale-state recovery interface. */
export interface RecoveryCoordinator {
  recover(options?: {
    restartIfStillStale?: boolean;
    maxWaitMs?: number;
    quietMs?: number;
  }): Promise<RecoveryResult>;
}

/** Create the recovery interface around the package-internal manager. */
export function createRecoveryCoordinator(manager: LspManager): RecoveryCoordinator {
  return {
    async recover(options) {
      return manager.recoverWorkspaceDiagnostics(options);
    },
  };
}
