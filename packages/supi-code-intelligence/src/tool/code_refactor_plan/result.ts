/** Result assembly for code_refactor_plan. */

import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { renderRefactorPlanResult } from "../refactor-markdown.ts";
import { searchErrorResult } from "../result/errors.ts";
import { assembleRefactorPlanDetails } from "../result/refactor.ts";
import { structuredRefactorPlan } from "./structured.ts";

type RefactorPlanOutcome = Awaited<ReturnType<CodeIntelToolExecCtx["session"]["planRefactor"]>>;

/** Assemble the final model-visible code_refactor_plan result for one workflow outcome. */
export function finishRefactorPlanResult(
  outcome: RefactorPlanOutcome,
  cwd: string,
): CodeIntelResult {
  if (outcome.kind === "unavailable") throw new Error(outcome.reason);
  if (outcome.kind === "invalid-input") {
    return {
      ...searchErrorResult(`**Error:** ${outcome.message}`, {
        nextQueries: ["Fix the target or operation and retry"],
        message: outcome.message,
      }),
      structuredContent: structuredRefactorPlan(outcome, cwd),
    };
  }
  if (outcome.kind === "ambiguous") {
    const candidates = outcome.candidates
      .map(
        (candidate, index) =>
          `${index + 1}. ${candidate.description} (${candidate.file}:${candidate.line})`,
      )
      .join("\n");
    return {
      ...searchErrorResult(`**Refactor ambiguous:**\n${candidates}`, {
        nextQueries: ["Use a precise target handle or anchor"],
        message: "The refactor target is ambiguous.",
      }),
      structuredContent: structuredRefactorPlan(outcome, cwd),
    };
  }

  const assembly = assembleRefactorPlanDetails(outcome.plan, cwd);
  return {
    content: renderRefactorPlanResult(assembly),
    structuredContent: structuredRefactorPlan(outcome, cwd),
    details: {
      type: "search",
      data: assembly.details,
      status: "completed",
      displaySections: assembly.displaySections,
    },
  };
}
