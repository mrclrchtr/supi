/**
 * Tool executor for code_refactor_apply.
 *
 * Thin Phase 5 workflow wrapper over the stored-plan application path.
 * Applies a previously stored plan by planId after revalidation and fingerprint checks.
 */

import type { CodeIntelResult } from "../types.ts";
import { executeRefactorApplyTool } from "./execute-refactor-apply.ts";

export interface CodeApplyToolParams {
  planId: string;
}

export async function executeApplyTool(
  params: CodeApplyToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  return executeRefactorApplyTool({ planId: params.planId }, ctx);
}
