/**
 * Shared helper for expanding targetId into existing target-oriented tool params.
 *
 * Current target-oriented tools (code_context, code_graph,
 * code_impact, code_affected, code_brief, code_refactor, code_refactor_plan)
 * accept optional targetId that takes precedence over raw
 * file/line/character/symbol.
 */

import type { TargetStoreEntry } from "../workflow/target-store.ts";
import { getWorkflowTarget } from "../workflow/target-store.ts";

/** Result of attempting to expand a targetId into tool params. */
export type TargetIdExpansionResult =
  | {
      kind: "ok";
      file: string;
      line: number;
      character: number;
      targetName: string | null;
      targetKind: string | null;
      entry: TargetStoreEntry;
    }
  | { kind: "not-provided" }
  | { kind: "error"; message: string };

/**
 * Expand an optional targetId into anchored file/line/character params.
 *
 * Usage at the top of each target-oriented executor:
 *
 * ```ts
 * const expansion = expandTargetId(params, ctx.cwd);
 * if (expansion.kind === "error") return { content: expansion.message, ... };
 * if (expansion.kind === "ok") {
 *   params.file = expansion.file;
 *   params.line = expansion.line;
 *   params.character = expansion.character;
 * }
 * ```
 *
 * The expansion checks the workflow target store for a matching entry.
 * Unknown or stale target IDs return an explicit error message.
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
  // No targetId — nothing to expand
  if (params.targetId === undefined || params.targetId === null) {
    return { kind: "not-provided" };
  }

  // Look up in store
  const result = getWorkflowTarget(cwd, params.targetId);
  if (result.kind === "unavailable") {
    return { kind: "error", message: `**Error:** ${result.reason}` };
  }

  const { entry } = result;

  // If the caller also provided raw coordinates that disagree,
  // targetId takes precedence so we silently override.
  // (No need to warn — the model chose to use targetId.)

  return {
    kind: "ok",
    file: entry.file,
    line: entry.displayLine,
    character: entry.displayCharacter,
    targetName: entry.name,
    targetKind: entry.kind,
    entry,
  };
}
