/** Thin Pi adapter for session-owned refactor planning. */

import type {
  RefactorOperationInput,
  RefactorPlanWorkflowInput,
} from "../../session/refactor-types.ts";
import type { RefactorTargetInput } from "../../session/target-input.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { toWorkflowControl } from "../infra/workflow-control.ts";
import { searchErrorResult } from "../result/errors.ts";
import { assembleRefactorPlanDetails } from "../result/refactor.ts";
import { renderRefactorPlanResult } from "./markdown.ts";

export interface CodeRefactorPlanToolParams {
  target: RefactorTargetInput;
  operation: RefactorOperationInput;
}

export async function executeRefactorPlanTool(
  params: CodeRefactorPlanToolParams,
  ctx: CodeIntelToolExecCtx,
  _invokedAs: "code_refactor_plan" = "code_refactor_plan",
): Promise<CodeIntelResult> {
  const outcome = await ctx.session.planRefactor(
    params as RefactorPlanWorkflowInput,
    toWorkflowControl(ctx),
  );
  if (outcome.kind === "unavailable") throw new Error(outcome.reason);
  if (outcome.kind === "invalid-input") {
    return searchErrorResult(`**Error:** ${outcome.message}`, {
      nextQueries: ["Fix the target or operation and retry"],
    });
  }
  if (outcome.kind === "ambiguous") {
    const candidates = outcome.candidates
      .map(
        (candidate, index) =>
          `${index + 1}. ${candidate.description} (${candidate.file}:${candidate.line})`,
      )
      .join("\n");
    return searchErrorResult(`**Refactor ambiguous:**\n${candidates}`, {
      nextQueries: ["Use a precise target handle or anchor"],
    });
  }

  const assembly = assembleRefactorPlanDetails(outcome.plan, ctx.cwd);
  return {
    content: renderRefactorPlanResult(assembly),
    details: {
      type: "search",
      data: assembly.details,
    },
  };
}
