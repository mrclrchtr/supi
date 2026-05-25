// Workspace router — routes files to the correct LSP client based on project root.

import type { ProjectServerInfo } from "../config/server-config.ts";
import type { LspManager } from "./manager.ts";

/**
 * Routes file paths to the correct LSP client and tracks
 * which project roots are known.
 */
export interface WorkspaceRouter {
  /** Check whether a file can be served by any active server. */
  canServeFile(filePath: string): boolean;

  /** Check whether a source file type is supported. */
  isSupportedSourceFile(filePath: string): boolean;

  /** Get known project server info. */
  getProjectServers(): ProjectServerInfo[];

  /** Register detected servers from the workspace scan. */
  registerDetectedServers(servers: Array<{ language: string; root: string }>): void;
}

/**
 * Create a WorkspaceRouter backed by LspManager.
 */
export function createWorkspaceRouter(manager: LspManager): WorkspaceRouter {
  return {
    canServeFile(filePath: string) {
      return manager.canServeFile(filePath);
    },
    isSupportedSourceFile(filePath: string) {
      return manager.isSupportedSourceFile(filePath);
    },
    getProjectServers(): ProjectServerInfo[] {
      return manager.getKnownProjectServers([]);
    },
    registerDetectedServers(servers: Array<{ language: string; root: string }>) {
      manager.registerDetectedServers(
        servers as unknown as Parameters<typeof manager.registerDetectedServers>[0],
      );
    },
  };
}
