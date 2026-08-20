/** Thin Pi adapter for the session-owned code_graph workflow. */

import type { GraphWorkflowInput, RequestedGraphRelation } from "../../session/graph-types.ts";
import type { GraphTargetInput } from "../../session/target-input.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { toWorkflowControl } from "../infra/workflow-control.ts";
import { finishGraphResult } from "./result.ts";

export type GraphRelation = RequestedGraphRelation;

export interface CodeGraphToolParams {
  target: GraphTargetInput;
  relations?: GraphRelation[];
  calleeDepth?: "direct" | "deep";
  maxResults?: number;
}

export async function executeGraphTool(
  params: CodeGraphToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const outcome = await ctx.session.graph(params as GraphWorkflowInput, toWorkflowControl(ctx));
  return finishGraphResult(outcome, ctx.cwd);
}
