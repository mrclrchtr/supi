/**
 * Code-intelligence app composition root.
 *
 * Creates the app object that wires the workspace manager, exposes
 * registration hooks used by the extension entrypoint, and coordinates
 * feature wiring.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { WorkspaceCodeIntelligenceSession } from "../session/session.ts";
import { WorkspaceManager } from "./manager.ts";

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
  getSession(cwd: string): WorkspaceCodeIntelligenceSession | undefined;
  /** Get or create a session for the given cwd. */
  createSession(cwd: string): WorkspaceCodeIntelligenceSession;
  /** Release a session for the given cwd. */
  releaseSession(cwd: string): void;
  /** Release all sessions. */
  shutdown(): void;
}

/**
 * Create a simple session cache for tests and ad-hoc usage.
 *
 * Returns `{ getOrCreate, clear }` — sessions are cached per cwd so
 * that targets registered by one tool call are visible to subsequent
 * tool calls. Production code should use the app-managed sessions
 * passed through `CodeIntelToolExecCtx.session` instead.
 */
export function createSessionCache(): {
  getOrCreate(cwd: string): WorkspaceCodeIntelligenceSession;
  clear(): void;
} {
  const sessions = new Map<string, WorkspaceCodeIntelligenceSession>();
  return {
    getOrCreate(cwd: string): WorkspaceCodeIntelligenceSession {
      let session = sessions.get(cwd);
      if (!session) {
        session = new WorkspaceCodeIntelligenceSession(cwd);
        sessions.set(cwd, session);
      }
      return session;
    },
    clear(): void {
      sessions.clear();
    },
  };
}

/**
 * Create the code-intelligence app and wire it to pi lifecycle events.
 *
 * Registers:
 * - `session_start` — creates a session for the new cwd, checks branch
 *   for existing overview
 * - `session_shutdown` — releases all sessions and clears per-session stores
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
    // Clear per-session stores before releasing sessions
    for (const session of manager.allSessions()) {
      session.clearStores();
    }
    manager.shutdown();
  });

  return {
    getSession(cwd: string): WorkspaceCodeIntelligenceSession | undefined {
      return manager.getSession(cwd);
    },

    createSession(cwd: string): WorkspaceCodeIntelligenceSession {
      return manager.getOrCreateSession(cwd);
    },

    releaseSession(cwd: string): void {
      const session = manager.getSession(cwd);
      if (session) {
        session.clearStores();
      }
      manager.releaseSession(cwd);
    },

    shutdown(): void {
      for (const session of manager.allSessions()) {
        session.clearStores();
      }
      manager.shutdown();
    },
  };
}
