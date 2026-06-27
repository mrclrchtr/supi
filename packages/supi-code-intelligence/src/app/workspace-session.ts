/**
 * Workspace session state for supi-code-intelligence.
 *
 * This module re-exports the `WorkspaceCodeIntelligenceSession` class
 * from the new session facade (ADR 0008). Backward-compatible aliases
 * are provided for phased migration.
 *
 * Prefer importing from `../session/workspace-code-intelligence-session.ts`
 * directly in new code.
 */

import { WorkspaceCodeIntelligenceSession } from "../session/workspace-code-intelligence-session.ts";

// ── Backward-compatible aliases ───────────────────────────────────────

/**
 * @deprecated Use `WorkspaceCodeIntelligenceSession` from
 * `../session/workspace-code-intelligence-session.ts` instead.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface -- deprecation alias
export type WorkspaceSession = WorkspaceCodeIntelligenceSession;

/**
 * @deprecated Use `new WorkspaceCodeIntelligenceSession(cwd)` directly.
 * Retained for backward-compatible import during phased migration.
 */
export function createWorkspaceSession(cwd: string): WorkspaceCodeIntelligenceSession {
  return new WorkspaceCodeIntelligenceSession(cwd);
}

// Re-export the class itself so existing imports from `./workspace-session.ts` keep working
export { WorkspaceCodeIntelligenceSession } from "../session/workspace-code-intelligence-session.ts";
