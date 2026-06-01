/**
 * Tool executor for code_apply.
 *
 * Thin Phase 5 workflow wrapper over the stored-plan application path.
 * Only `mode: "apply"` is implemented in this phase; richer modes stay
 * explicit unavailable outcomes until formatting/verification orchestration lands.
 */

import type { CodeIntelResult } from "../types.ts";
import { executeRefactorApplyTool } from "./execute-refactor-apply.ts";

export interface CodeApplyToolParams {
  planId: string;
  mode?: "apply";
}

export async function executeApplyTool(
  params: CodeApplyToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  if (params.mode && params.mode !== "apply") {
    return {
      content:
        `**Apply mode unavailable:** \`code_apply\` currently supports only \`mode: "apply"\`. ` +
        `Requested \`${params.mode}\` remains a follow-up workflow mode.`,
      details: {
        type: "search" as const,
        data: {
          confidence: "unavailable" as const,
          scope: null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: ['Retry with `mode: "apply"` or omit `mode`'],
        },
      },
    };
  }

  return executeRefactorApplyTool({ planId: params.planId }, ctx);
}
