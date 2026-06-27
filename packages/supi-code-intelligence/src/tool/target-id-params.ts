/**
 * Shared helper for expanding targetId into existing target-oriented tool params.
 *
 * Current target-oriented tools (code_orientation, code_graph,
 * code_impact, code_refactor_plan)
 * accept optional targetId that takes precedence over raw
 * file/line/character/symbol.
 *
 * @deprecated Prefer calling `ctx.session.expandTargetId(params)` directly
 * inside tool executors. These standalone functions are kept for
 * transitional code paths and tests that don't have a session ref.
 */

import { getOrCreateSessionForCwd } from "../app/create-code-intelligence-app.ts";
import type { WorkspaceCodeIntelligenceSession } from "../session/workspace-code-intelligence-session.ts";
import {
  expandSessionTargetId,
  type TargetIdExpansionResult,
} from "../session/workspace-code-intelligence-session.ts";
import type { TargetStoreEntry } from "../workflow/target-store.ts";

// Re-export for backward compatibility with callers that haven't migrated yet
export type { TargetIdExpansionResult } from "../session/workspace-code-intelligence-session.ts";

export type TargetIdLookupResult =
  | { kind: "ok"; entry: TargetStoreEntry }
  | { kind: "not-provided" }
  | { kind: "error"; message: string };

/**
 * Expand an optional targetId into anchored file/line/character params.
 *
 * @deprecated Use `ctx.session.expandTargetId(params)` instead.
 */
export function expandTargetId(
  params: {
    targetId?: string;
    file?: string;
    line?: number;
    character?: number;
    symbol?: string;
  },
  cwd: string,
): TargetIdExpansionResult {
  const session = getOrCreateSessionForCwd(cwd);
  return expandSessionTargetId(session, params);
}

/**
 * Look up a targetId in the session-scoped store.
 *
 * @deprecated Use `ctx.session.lookupTargetEntry(targetId)` instead.
 */
export function lookupTargetId(params: { targetId?: string }, cwd: string): TargetIdLookupResult {
  if (params.targetId === undefined || params.targetId === null) {
    return { kind: "not-provided" };
  }

  const session = getOrCreateSessionForCwd(cwd);
  const result = session.lookupTargetEntry(params.targetId);
  if (result.kind === "unavailable") {
    return { kind: "error", message: `**Error:** ${result.reason}` };
  }

  return { kind: "ok", entry: result.entry };
}

/**
 * Expanded version of expandTargetId that accepts a session directly.
 * Use this when you already hold a session reference.
 */
export function expandTargetIdWithSession(
  session: WorkspaceCodeIntelligenceSession,
  params: {
    targetId?: string;
    file?: string;
    line?: number;
    character?: number;
    symbol?: string;
  },
): TargetIdExpansionResult {
  return expandSessionTargetId(session, params);
}
