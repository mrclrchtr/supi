/** Thin Pi adapter for the session-owned Orientation workflow. */

import type {
  OrientationFocusInput,
  OrientationWorkflowInput,
} from "../../session/orientation-types.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { toWorkflowControl } from "../infra/workflow-control.ts";
import { finishOrientationResult } from "./result.ts";

export interface CodeOrientationToolParams {
  focus?: OrientationFocusInput;
  maxResults?: number;
}

export async function executeOrientationTool(
  params: CodeOrientationToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const outcome = await ctx.session.orient(
    params as OrientationWorkflowInput,
    toWorkflowControl(ctx),
  );
  return finishOrientationResult(outcome);
}
