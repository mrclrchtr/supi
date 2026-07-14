// Client pool — owns routed client tracking without exposing LSP clients.

import type { FileEvent } from "../config/types.ts";
import type { LspManager } from "./manager.ts";

/** Workspace client lifecycle and open-document operations. */
export interface ClientPool {
  /** Track a file in its routed client. */
  trackFile(filePath: string): Promise<boolean>;
  /** Stop tracking one file. */
  closeFile(filePath: string): void;
  /** Remove missing files from client state. */
  pruneMissingFiles(): readonly string[];
  /** Re-sync tracked documents and wait for diagnostics. */
  refreshOpenDiagnostics(options?: { maxWaitMs?: number; quietMs?: number }): Promise<void>;
  /** Notify clients of workspace changes and invalidate pull result ids. */
  noteWorkspaceChanges(changes: FileEvent[]): void;
  /** Shut down all active clients. */
  shutdownAll(): Promise<void>;
}

/** Create the client-lifecycle interface around the package-internal manager. */
export function createClientPool(manager: LspManager): ClientPool {
  return {
    async trackFile(filePath) {
      return (await manager.ensureFileOpen(filePath)) !== null;
    },
    closeFile(filePath) {
      manager.closeFile(filePath);
    },
    pruneMissingFiles() {
      return manager.pruneMissingFiles();
    },
    async refreshOpenDiagnostics(options) {
      await manager.refreshOpenDiagnostics(options);
    },
    noteWorkspaceChanges(changes) {
      manager.clearAllPullResultIds();
      manager.notifyWorkspaceFileChanges(changes);
    },
    async shutdownAll() {
      await manager.shutdownAll();
    },
  };
}
