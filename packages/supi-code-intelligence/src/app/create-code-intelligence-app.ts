/**
 * Code-intelligence app composition root.
 *
 * Creates the app object that wires the workspace manager, exposes
 * registration hooks used by the extension entrypoint, and coordinates
 * feature wiring.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { WorkspaceCodeIntelligenceSession } from "../session/workspace-code-intelligence-session.ts";
import { WorkspaceManager } from "./workspace-manager.ts";

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

let appInstance: CodeIntelligenceApp | null = null;

/** Standalone session cache — used when the app is not initialized (e.g., unit tests). */
const standaloneSessions = new Map<string, WorkspaceCodeIntelligenceSession>();

/**
 * Get a workspace session for the given cwd.
 *
 * Returns the app-managed session if the app is initialized, or a cached
 * standalone session for ad-hoc use (e.g., unit tests). Standalone sessions
 * are reused across calls for the same cwd so that targets registered by
 * one tool call are visible to subsequent tool calls.
 *
 * Prefer using the session from `CodeIntelToolExecCtx.session` inside
 * tool executors. This function exists for the transition phase and for
 * code paths that run outside a tool execution context.
 */
export function getOrCreateSessionForCwd(cwd: string): WorkspaceCodeIntelligenceSession {
  const session = appInstance?.getSession(cwd);
  if (session) return session;

  // Standalone mode — cache per cwd so cross-tool state (targetIds, plans) persists
  let standalone = standaloneSessions.get(cwd);
  if (!standalone) {
    standalone = new WorkspaceCodeIntelligenceSession(cwd);
    standaloneSessions.set(cwd, standalone);
  }
  return standalone;
}

/**
 * Clear the standalone session cache.
 *
 * Use in test teardown (e.g., global afterAll) to prevent unbounded
 * accumulation across test suites with unique tmpdir paths.
 */
export function clearStandaloneSessions(): void {
  standaloneSessions.clear();
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

  const app: CodeIntelligenceApp = {
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

  appInstance = app;
  return app;
}
