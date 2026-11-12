/** Result assembly for code_refactor_plan. */

import { toDisplayPath } from "../../analysis/search/paths.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { renderRefactorPlanResult } from "../refactor-markdown.ts";
import { searchErrorResult } from "../result/errors.ts";
import { assembleRefactorPlanDetails } from "../result/refactor.ts";
import { AMBIGUOUS_NEXT_ACTION, structuredRefactorPlan } from "./structured.ts";

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
        nextQueries: ["Fix the operation input and retry"],
        message: outcome.message,
      }),
      structuredContent: structuredRefactorPlan(outcome, cwd),
    };
  }
  if (outcome.kind === "ambiguous") {
    const candidates = outcome.candidates.map((candidate, index) => {
      const label =
        candidate.title === undefined
          ? candidate.description
          : `${candidate.kind ? `\`${candidate.kind}\` — ` : ""}${JSON.stringify(candidate.title)}`;
      const location =
        candidate.file === undefined
          ? ""
          : ` — first edit ${toDisplayPath(cwd, candidate.file)}:${candidate.line}`;
      return `${index + 1}. ${label}${location}`;
    });
    return {
      ...searchErrorResult(
        `**Refactor ambiguous:**\n${candidates.join("\n")}\n\n${AMBIGUOUS_NEXT_ACTION}.`,
        {
          status: "disambiguation",
          nextQueries: [AMBIGUOUS_NEXT_ACTION],
          message: "Several matching actions produce different edits.",
        },
      ),
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
