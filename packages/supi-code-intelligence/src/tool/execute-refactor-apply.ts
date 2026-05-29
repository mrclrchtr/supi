/**
 * Tool executor for code_refactor_apply.
 *
 * Finds a previously generated plan by ID, revalidates it,
 * and applies the workspace edit through safety gates.
 */

import { applyWorkspaceEdit } from "../analysis/refactor/apply-workspace-edit.ts";
import { getPlan, isPlanFresh, removePlan } from "../analysis/refactor/plan-store.ts";
import { validateEdit } from "../analysis/refactor/safety.ts";
import { routeFor } from "../analysis/routing/planner.ts";
import { renderRefactorApplyResult } from "../presentation/markdown/refactor.ts";
import type { CodeIntelResult } from "../types.ts";

export interface CodeRefactorApplyToolParams {
  planId: string;
}

export async function executeRefactorApplyTool(
  params: CodeRefactorApplyToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  if (!params.planId) {
    return {
      content: "**Error:** `planId` is required for code_refactor_apply.",
      details: undefined,
    };
  }

  // Route check (optional since a plan may have been generated earlier)
  const route = routeFor(ctx.cwd, "code_refactor_apply");
  if (route.preferred === "unavailable") {
    return {
      content:
        "**Error:** No semantic analysis provider is available. Regenerate the plan with code_refactor_plan after enabling LSP.",
      details: undefined,
    };
  }

  // Find the plan
  const plan = getPlan(params.planId);
  if (!plan) {
    return {
      content: `**Error:** Plan "${params.planId}" not found. The plan may have expired or was generated in a different session. Use code_refactor_plan to generate a new plan.`,
      details: undefined,
    };
  }

  // Check freshness
  const freshness = isPlanFresh(plan);
  if (!freshness.fresh) {
    return {
      content: `**Stale plan:** ${freshness.reason}`,
      details: undefined,
    };
  }

  // Re-validate
  const validation = validateEdit(plan.edits);
  if (!validation.safe) {
    return {
      content: `**Safety check failed:** ${validation.reason}. Regenerate the plan with code_refactor_plan.`,
      details: undefined,
    };
  }

  // Apply
  const applyResult = applyWorkspaceEdit(plan.edits);
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
