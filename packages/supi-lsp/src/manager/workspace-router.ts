// Workspace router — classifies file support and exposes routed project status.

import type { ProjectServerInfo } from "../config/types.ts";
import type { LspManager } from "./manager.ts";

/** File routing and workspace-project inventory. */
export interface WorkspaceRouter {
  /** Check whether a file can be served by a configured server. */
  canServeFile(filePath: string): boolean;
  /** Check whether runtime guidance should track this source file. */
  isSupportedSourceFile(filePath: string): boolean;
  /** Get known project server state. */
  getProjectServers(): ProjectServerInfo[];
}

/** Create the routing interface around the package-internal manager. */
export function createWorkspaceRouter(manager: LspManager): WorkspaceRouter {
  return {
    canServeFile(filePath) {
      return manager.canServeFile(filePath);
    },
    isSupportedSourceFile(filePath) {
      return manager.isSupportedSourceFile(filePath);
    },
    getProjectServers() {
      return manager.getKnownProjectServers([]);
    },
  };
}
