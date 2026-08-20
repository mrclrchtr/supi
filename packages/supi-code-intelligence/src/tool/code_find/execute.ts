/** Thin Pi adapter for the session-owned code_find workflow. */

import type { FindMode, FindWorkflowInput } from "../../session/find-types.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { toWorkflowControl } from "../infra/workflow-control.ts";
import type { CodeFindAstKind } from "./ast-kinds.ts";
import { finishFindResult } from "./result.ts";

export interface CodeFindToolParams {
  query: string;
  scope?: string[];
  mode: FindMode;
  kind?: CodeFindAstKind;
  maxResults?: number;
}

export async function executeFindTool(
  params: CodeFindToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const outcome = await ctx.session.find(params as FindWorkflowInput, toWorkflowControl(ctx));
  return finishFindResult(outcome, params.scope);
}
