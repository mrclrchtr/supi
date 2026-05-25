// Client pool — manages LSP client lifecycle (start, stop, reconnect).

import type { LspManager } from "./manager.ts";

/**
 * Manages the lifecycle of LSP client instances for a workspace.
 * Currently delegates to LspManager; the extraction will grow
 * as responsibilities are migrated from manager.ts.
 */
export interface ClientPool {
  /**
   * Ensure a file has an active client and return it.
   * Returns null if no server can serve the file.
   */
  ensureFileOpen(filePath: string): ReturnType<LspManager["ensureFileOpen"]>;

  /** Shut down all active clients. */
  shutdownAll(): Promise<void>;
}

/**
 * Create a ClientPool backed by LspManager.
 */
export function createClientPool(manager: LspManager): ClientPool {
  return {
    async ensureFileOpen(filePath: string) {
      return manager.ensureFileOpen(filePath);
    },
    async shutdownAll() {
      return manager.shutdownAll();
    },
  };
}
