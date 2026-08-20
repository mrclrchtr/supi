/** Thin Pi adapter for session-owned point inspection. */

import type { InspectWorkflowInput } from "../../session/inspect-types.ts";
import type { SourcePointInput } from "../../session/target-input.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { toWorkflowControl } from "../infra/workflow-control.ts";
import { finishInspectResult } from "./result.ts";

export interface CodeInspectToolParams {
  point: SourcePointInput;
  maxResults?: number;
}

export async function executeInspectTool(
  params: CodeInspectToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const outcome = await ctx.session.inspect(params as InspectWorkflowInput, toWorkflowControl(ctx));
  return finishInspectResult(outcome);
}
