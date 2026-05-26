/**
 * Code-intelligence app composition root.
 *
 * Creates the app object that wires the workspace manager, exposes
 * registration hooks used by the extension entrypoint, and coordinates
 * feature wiring.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { WorkspaceManager } from "./workspace-manager.ts";
import type { WorkspaceSession } from "./workspace-session.ts";

/**
 * The code-intelligence app object.
 *
 * Exposes:
 * - `getSession(cwd)` — retrieve a session (undefined if none)
 * - `createSession(cwd)` — get or create a session for a workspace
 * - `releaseSession(cwd)` — remove a session
 * - `shutdown()` — clear all sessions
 *
 * The app does NOT replace the shared capability broker in
 * @mrclrchtr/supi-code-runtime — it coordinates local session state
 * around it.
 */
export interface CodeIntelligenceApp {
  /** Get a session by cwd, or undefined. */
  getSession(cwd: string): WorkspaceSession | undefined;
  /** Get or create a session for the given cwd. */
  createSession(cwd: string): WorkspaceSession;
  /** Release a session for the given cwd. */
  releaseSession(cwd: string): void;
  /** Release all sessions. */
  shutdown(): void;
}

/**
 * Create the code-intelligence app and wire it to pi lifecycle events.
 *
 * Registers:
 * - `session_start` — creates a session for the new cwd, checks branch
 *   for existing overview
 * - `session_shutdown` — releases all sessions
 */
export function createCodeIntelligenceApp(pi: ExtensionAPI): CodeIntelligenceApp {
  const manager = new WorkspaceManager();
  const OVERVIEW_CUSTOM_TYPE = "code-intelligence-overview";

  pi.on("session_start", (_event, ctx) => {
    const session = manager.getOrCreateSession(ctx.cwd);

    // Check if the branch already contains an overview
    const branch = ctx.sessionManager.getBranch();
    for (const entry of branch) {
      if (
        entry.type === "custom_message" &&
        (entry as { customType?: string }).customType === OVERVIEW_CUSTOM_TYPE
      ) {
        session.hasInjectedOverview = true;
        break;
      }
    }
  });

  pi.on("session_shutdown", () => {
    manager.shutdown();
  });

  return {
    getSession(cwd: string): WorkspaceSession | undefined {
      return manager.getSession(cwd);
    },

    createSession(cwd: string): WorkspaceSession {
      return manager.getOrCreateSession(cwd);
    },

    releaseSession(cwd: string): void {
      manager.releaseSession(cwd);
    },

    shutdown(): void {
      manager.shutdown();
    },
  };
}
