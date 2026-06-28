/**
 * code_orientation tool executor.
 *
 * Thin orchestrator: dispatches to precise-target resolution or
 * orientation-mode depending on whether targetId/coordinates or
 * a plain focus is provided.
 */

import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { runOrientationMode } from "./mode.ts";
import { resolvePreciseTarget } from "./precise-target.ts";

export interface CodeOrientationToolParams {
  /** Workspace-relative path or discovered module name for orientation. */
  focus?: string;
  /** Resolved target handle from code_resolve. Wins over focus/coordinates. */
  targetId?: string;
  /** 1-based line for symbol orientation. Requires focus. */
  line?: number;
  /** 1-based UTF-16 column for symbol orientation. Requires focus and line. */
  character?: number;
  /** Maximum results per rendered list. Defaults to 10. */
  maxResults?: number;
  // Internal-only expansion fields populated from targetId or coordinate resolution.
  file?: string;
  targetName?: string | null;
  targetKind?: string | null;
  targetAnchorKind?: "name" | "declaration";
}

/**
 * Execute the public code_orientation tool.
 *
 * When `targetId` or `line`/`character` coordinates are provided,
 * resolves a precise symbol target and runs symbol-centered sections.
 * Otherwise runs project/module/directory/file orientation mode.
 */
export async function executeOrientationTool(
  params: CodeOrientationToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const hasCoords = params.line !== undefined || params.character !== undefined;
  const hasTargetId = params.targetId !== undefined && params.targetId !== null;

  if (hasTargetId || hasCoords) {
    const outcome = await resolvePreciseTarget(params, ctx, hasCoords);
    if (outcome.kind === "resolved") return outcome.result;
  }
  return runOrientationMode(params, ctx);
}
