/**
 * Code-intelligence app composition root.
 *
 * Creates the app object that wires the workspace manager, exposes
 * registration hooks used by the extension entrypoint, and coordinates
 * feature wiring.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { WorkspaceCodeIntelligenceSession } from "../session/session.ts";

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

/** Get or create a session in a Map-based cache. */
export function getOrCreateSession(
  sessions: Map<string, WorkspaceCodeIntelligenceSession>,
  cwd: string,
): WorkspaceCodeIntelligenceSession {
  let session = sessions.get(cwd);
  if (!session) {
    session = new WorkspaceCodeIntelligenceSession(cwd);
    sessions.set(cwd, session);
  }
  return session;
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
    getOrCreate: (cwd) => getOrCreateSession(sessions, cwd),
    clear: () => {
      for (const session of sessions.values()) session.clearStores();
      sessions.clear();
    },
  };
}

/**
 * Keep a session informed about the instruction files its model already has, so directory
 * `code_orientation` does not deliver them again. Shared by the full extension and the
 * headless profile; without it every instruction file counts as unseen.
 *
 * Registers:
 * - `session_start` / `session_tree` — rebuild surfaced directories and full reads from the branch
 * - `before_agent_start` — record the context files Pi loaded into the system prompt
 * - `tool_result` — record full `read` results
 * - `session_compact` — reset, so instructions are delivered again
 */
export function registerInstructionDedup(
  pi: ExtensionAPI,
  getSession: (cwd: string) => WorkspaceCodeIntelligenceSession,
): void {
  const restore = (_event: unknown, ctx: ExtensionContext): void => {
    getSession(ctx.cwd).reconstructInstructionState(ctx.sessionManager.getBranch());
  };
  pi.on("session_start", restore);
  pi.on("session_tree", restore);
  pi.on("before_agent_start", (event, ctx) => {
    getSession(ctx.cwd).captureNativeInstructionPaths(event.systemPromptOptions.contextFiles ?? []);
  });
  pi.on("tool_result", (event, ctx) => {
    getSession(ctx.cwd).recordToolResult(event);
  });
  pi.on("session_compact", (_event, ctx) => {
    getSession(ctx.cwd).resetInstructionDedup();
  });
}

/**
 * Create the code-intelligence app and wire it to pi lifecycle events.
 *
 * Registers:
 * - instruction deduplication, see {@link registerInstructionDedup}
 * - `session_start` / `session_tree` — create the session for the cwd and
 *   restore overview state from the active branch
 * - `session_shutdown` — releases all sessions and clears per-session stores
 */
export function createCodeIntelligenceApp(pi: ExtensionAPI): CodeIntelligenceApp {
  const sessions = new Map<string, WorkspaceCodeIntelligenceSession>();
  const OVERVIEW_CUSTOM_TYPE = "code-intelligence-overview";

  pi.on("session_start", (_event, ctx) => {
    const session = getOrCreateSession(sessions, ctx.cwd);
    restoreBranchOverviewState(session, ctx.sessionManager.getBranch());
  });

  pi.on("session_tree", (_event, ctx) => {
    const session = sessions.get(ctx.cwd);
    if (!session) return;
    restoreBranchOverviewState(session, ctx.sessionManager.getBranch());
  });

  registerInstructionDedup(pi, (cwd) => getOrCreateSession(sessions, cwd));

  pi.on("session_shutdown", () => {
    for (const session of sessions.values()) {
      session.clearStores();
    }
    sessions.clear();
  });

  /** Check whether this branch already contains a code-intelligence-overview custom message. */
  function restoreBranchOverviewState(
    session: WorkspaceCodeIntelligenceSession,
    branch: unknown[],
  ): void {
    session.restoreOverviewInjection(false);
    for (const entry of branch as Array<{ type?: string; customType?: string }>) {
      if (entry.type === "custom_message" && entry.customType === OVERVIEW_CUSTOM_TYPE) {
        session.restoreOverviewInjection();
        return;
      }
    }
  }

  return {
    getSession: (cwd) => sessions.get(cwd),
    createSession: (cwd) => getOrCreateSession(sessions, cwd),
    releaseSession(cwd: string): void {
      sessions.get(cwd)?.clearStores();
      sessions.delete(cwd);
    },
    shutdown(): void {
      for (const session of sessions.values()) {
        session.clearStores();
      }
      sessions.clear();
    },
  };
}
