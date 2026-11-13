/** Thin Pi adapter for the session-owned code_find workflow. */

import type { FindSearchInput, FindWorkflowInput } from "../../session/find-types.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { toWorkflowControl } from "../infra/workflow-control.ts";
import { finishFindResult } from "./result.ts";

export interface CodeFindToolParams {
  search: FindSearchInput;
  scopes?: string[];
  maxResults?: number;
}

export async function executeFindTool(
  params: CodeFindToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const outcome = await ctx.session.find(params as FindWorkflowInput, toWorkflowControl(ctx));
  const semantic =
    typeof params.search === "object" && params.search !== null && "semantic" in params.search;
  return finishFindResult(outcome, ctx.cwd, params.scopes, semantic ? "semantic" : "ast");
}
