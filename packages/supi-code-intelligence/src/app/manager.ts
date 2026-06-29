/**
 * Workspace-session lifecycle management.
 *
 * Owns per-cwd workspace session instances. Sessions are created
 * once per cwd and reused until explicitly released or shut down.
 *
 * Does NOT own the shared capability broker in @mrclrchtr/supi-code-runtime
 * — sessions read from it.
 */

import { WorkspaceCodeIntelligenceSession } from "../session/session.ts";

/**
 * Manages per-cwd workspace session instances.
 */
export class WorkspaceManager {
  /** Active sessions keyed by cwd. */
  readonly #sessions = new Map<string, WorkspaceCodeIntelligenceSession>();

  /**
   * Get the session for a cwd, or undefined if none exists.
   */
  getSession(cwd: string): WorkspaceCodeIntelligenceSession | undefined {
    return this.#sessions.get(cwd);
  }

  /**
   * Get or create a session for the given cwd.
   * Returns the existing session if one already exists for this cwd.
   */
  getOrCreateSession(cwd: string): WorkspaceCodeIntelligenceSession {
    let session = this.#sessions.get(cwd);
    if (!session) {
      session = new WorkspaceCodeIntelligenceSession(cwd);
      this.#sessions.set(cwd, session);
    }
    return session;
  }

  /**
   * Release a session for a specific cwd.
   * Does NOT affect the shared capability broker.
   */
  releaseSession(cwd: string): void {
    this.#sessions.delete(cwd);
  }

  /**
   * Release all sessions.
   * Does NOT affect the shared capability broker.
   */
  shutdown(): void {
    this.#sessions.clear();
  }

  /** Get the number of active sessions. */
  get size(): number {
    return this.#sessions.size;
  }

  /** Iterate over all active sessions. */
  allSessions(): IterableIterator<WorkspaceCodeIntelligenceSession> {
    return this.#sessions.values();
  }
}
