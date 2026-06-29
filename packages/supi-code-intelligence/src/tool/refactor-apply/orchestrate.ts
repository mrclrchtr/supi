/**
 * Refactor apply orchestration use-case.
 *
 * Handles plan lookup, freshness checking, safety re-validation, and
 * workspace edit application for a previously stored refactor plan.
 * Returns a rendered CodeIntelResult.
 *
 * Extracted from execute-refactor-apply.ts as part of the thin-executor
 * normalization.
 */

import { validateEdit } from "../../analysis/refactor/safety.ts";
import { isPlanFresh } from "../../session/refactor-plans.ts";
import type { WorkspaceCodeIntelligenceSession } from "../../session/session.ts";
import type { CodeIntelResult } from "../../types/index.ts";
import { unavailableSearchDetails } from "../infra/error-results.ts";
import { renderRefactorApplyResult } from "../refactor-plan/markdown.ts";
import { applyWorkspaceEdit } from "./apply.ts";

export interface RefactorApplyInput {
  planId: string;
}

export interface RefactorApplyDeps {
  session: WorkspaceCodeIntelligenceSession;
}

/**
 * Execute the refactor apply use-case.
 *
 * Validates plan existence, freshness, and safety, then applies the
 * workspace edit. Removes the plan from the session store on success.
 */
export async function executeRefactorApply(
  input: RefactorApplyInput,
  deps: RefactorApplyDeps,
): Promise<CodeIntelResult> {
  if (!input.planId) {
    return {
      content: "**Error:** `planId` is required.",
      details: unavailableSearchDetails(null, ["Provide a valid `planId` from code_refactor_plan"]),
    };
  }

  const plan = deps.session.getPlan(input.planId);
  if (!plan) {
    return {
      content: `**Error:** Plan "${input.planId}" not found. The plan may have expired or was generated in a different session. Use code_refactor_plan to generate a new plan.`,
      details: unavailableSearchDetails(null, ["Run code_refactor_plan to generate a new plan"]),
    };
  }

  const freshness = isPlanFresh(plan);
  if (!freshness.fresh) {
    return {
      content: `**Stale plan:** ${freshness.reason}`,
      details: unavailableSearchDetails(null, ["Regenerate the plan with code_refactor_plan"]),
    };
  }

  const validation = validateEdit(plan.edits);
  if (!validation.safe) {
    return {
      content: `**Safety check failed:** ${validation.reason}. Regenerate the plan with code_refactor_plan.`,
      details: unavailableSearchDetails(null, ["Regenerate the plan with code_refactor_plan"]),
    };
  }

  const applyResult = await applyWorkspaceEdit(plan.edits);
  if (applyResult.kind === "applied") {
    deps.session.removePlan(plan.id);
  }

  const content = renderRefactorApplyResult(applyResult, plan);

  return {
    content,
    details: {
      type: "search" as const,
      data: {
        confidence: "semantic" as const,
        scope: null,
        candidateCount: applyResult.kind === "applied" ? applyResult.totalEdits : 0,
        omittedCount: 0,
        nextQueries: ["`code_health` to check for new issues after the refactor"],
      },
    },
  };
}
