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
  const result = finishOrientationResult(outcome, ctx.cwd);
  if (result.details?.type === "context") {
    const supplied = result.details.data.instructions?.files ?? [];
    ctx.session.markInstructionDirsSurfaced(
      supplied.filter((file) => file.shownLines > 0).map((file) => file.directory),
    );
  }
  return result;
}
