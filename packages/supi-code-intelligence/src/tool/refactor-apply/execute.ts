/**
 * Tool executor for the stored-plan application path.
 *
 * Thin executor: delegates to the refactor apply use-case for plan lookup,
 * freshness checking, safety validation, and workspace edit application.
 */

import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { executeRefactorApply } from "./orchestrate.ts";

export interface CodeRefactorApplyToolParams {
  planId: string;
}

export async function executeRefactorApplyTool(
  params: CodeRefactorApplyToolParams,
  _ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  return executeRefactorApply({ planId: params.planId }, { session: _ctx.session });
}
