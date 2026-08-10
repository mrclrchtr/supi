/** Thin Pi adapter for session-owned refactor application. */

import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { toWorkflowControl } from "../infra/workflow-control.ts";
import { renderRefactorApplyResult } from "../refactor-plan/markdown.ts";
import { searchErrorResult } from "../result/errors.ts";
import { assembleRefactorApplyDetails } from "../result/refactor.ts";

export interface CodeRefactorApplyToolParams {
  planId: string;
}

export async function executeRefactorApplyTool(
  params: CodeRefactorApplyToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const outcome = await ctx.session.applyRefactor(params, toWorkflowControl(ctx));
  if (outcome.kind === "unavailable") throw new Error(outcome.reason);
  if (outcome.kind === "invalid-input") {
    return searchErrorResult(`**Error:** ${outcome.message}`, {
      nextQueries: ["Generate a fresh plan with code_refactor_plan"],
    });
  }

  const assembly = assembleRefactorApplyDetails(outcome.result, outcome.plan);
  return {
    content: renderRefactorApplyResult(assembly),
    details: {
      type: "search",
      data: assembly.details,
    },
  };
}
