/** Result assembly for code_refactor_apply. */

import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { renderRefactorApplyResult } from "../refactor-markdown.ts";
import { searchErrorResult } from "../result/errors.ts";
import { assembleRefactorApplyDetails } from "../result/refactor.ts";

type RefactorApplyOutcome = Awaited<ReturnType<CodeIntelToolExecCtx["session"]["applyRefactor"]>>;

/** Assemble the final model-visible code_refactor_apply result for one workflow outcome. */
export function finishRefactorApplyResult(outcome: RefactorApplyOutcome): CodeIntelResult {
  if (outcome.kind === "unavailable") throw new Error(outcome.reason);
  if (outcome.kind === "invalid-input") {
    return searchErrorResult(`**Error:** ${outcome.message}`, {
      nextQueries: ["Generate a fresh plan with code_refactor_plan"],
      message: outcome.message,
    });
  }

  const assembly = assembleRefactorApplyDetails(outcome.result, outcome.plan);
  return {
    content: renderRefactorApplyResult(assembly),
    details: {
      type: "search",
      data: assembly.details,
      status: "completed",
      displaySections: assembly.displaySections,
    },
  };
}
