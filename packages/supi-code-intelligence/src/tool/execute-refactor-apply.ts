/**
 * Tool executor for the stored-plan application path.
 * Revalidates the plan and applies the workspace edit through safety gates.
 */

import { applyWorkspaceEdit } from "../analysis/refactor/apply-workspace-edit.ts";
import { getPlan, isPlanFresh, removePlan } from "../analysis/refactor/plan-store.ts";
import { validateEdit } from "../analysis/refactor/safety.ts";
import { renderRefactorApplyResult } from "../presentation/markdown/refactor.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../types.ts";
import { unavailableSearchDetails } from "./details-helpers.ts";

export interface CodeRefactorApplyToolParams {
  planId: string;
}

export async function executeRefactorApplyTool(
  params: CodeRefactorApplyToolParams,
  _ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  if (!params.planId) {
    return {
      content: "**Error:** `planId` is required.",
      details: unavailableSearchDetails(null, ["Provide a valid `planId` from code_refactor_plan"]),
    };
  }

  // Find the plan
  const plan = getPlan(params.planId);
  if (!plan) {
    return {
      content: `**Error:** Plan "${params.planId}" not found. The plan may have expired or was generated in a different session. Use code_refactor_plan to generate a new plan.`,
      details: unavailableSearchDetails(null, ["Run code_refactor_plan to generate a new plan"]),
    };
  }

  // Check freshness
  const freshness = isPlanFresh(plan);
  if (!freshness.fresh) {
    return {
      content: `**Stale plan:** ${freshness.reason}`,
      details: unavailableSearchDetails(null, ["Regenerate the plan with code_refactor_plan"]),
    };
  }

  // Re-validate
  const validation = validateEdit(plan.edits);
  if (!validation.safe) {
    return {
      content: `**Safety check failed:** ${validation.reason}. Regenerate the plan with code_refactor_plan.`,
      details: unavailableSearchDetails(null, ["Regenerate the plan with code_refactor_plan"]),
    };
  }

  // Apply
  const applyResult = await applyWorkspaceEdit(plan.edits);
  removePlan(plan.id);

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
