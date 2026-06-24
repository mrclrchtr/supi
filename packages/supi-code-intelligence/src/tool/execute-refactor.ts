/**
 * Tool executor for code_refactor_plan.
 *
 * Thin Phase 5 workflow wrapper over the existing preview-only
 * refactor plan executor. code_refactor_plan is a pure planner: it
 * always returns a plan preview and never mutates files directly.
 */

import type { CodeIntelResult, CodeIntelToolExecCtx } from "../types.ts";
import { executeRefactorPlanTool } from "./execute-refactor-plan.ts";
import { emitToolProgress } from "./progress.ts";

export interface CodeRefactorToolParams {
  operation: string;
  targetId?: string;
  file?: string;
  line?: number;
  character?: number;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  newName?: string;
}

export async function executeRefactorTool(
  params: CodeRefactorToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  emitToolProgress(
    ctx.onUpdate,
    `code_refactor_plan: requesting ${params.operation} plan from LSP...`,
  );
  return executeRefactorPlanTool(
    {
      targetId: params.targetId,
      operation: params.operation,
      file: params.file,
      line: params.line,
      character: params.character,
      range: params.range,
      newName: params.newName,
    },
    ctx,
    "code_refactor_plan",
  );
}
