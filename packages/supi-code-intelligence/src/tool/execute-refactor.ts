/**
 * Tool executor for code_refactor.
 *
 * Thin Phase 5 workflow wrapper over the existing preview-only
 * code_refactor_plan executor. In this phase, code_refactor always
 * returns a plan preview and never mutates files directly.
 */

import type { CodeIntelResult } from "../types.ts";
import { executeRefactorPlanTool } from "./execute-refactor-plan.ts";

export interface CodeRefactorToolParams {
  operation: string;
  targetId?: string;
  file?: string;
  line?: number;
  character?: number;
  newName?: string;
  destination?: string;
  preview?: boolean;
}

export async function executeRefactorTool(
  params: CodeRefactorToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  if (params.preview === false) {
    return {
      content:
        "**Preview mode unavailable:** `code_refactor` is preview-only in this phase. " +
        "Requested `preview: false` is not supported yet.",
      details: {
        type: "search" as const,
        data: {
          confidence: "unavailable" as const,
          scope: null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: ["Retry with `preview: true` or omit `preview`"],
        },
      },
    };
  }

  return executeRefactorPlanTool(
    {
      targetId: params.targetId,
      operation: params.operation,
      file: params.file,
      line: params.line,
      character: params.character,
      newName: params.newName,
      destination: params.destination,
    },
    ctx,
    "code_refactor",
  );
}
