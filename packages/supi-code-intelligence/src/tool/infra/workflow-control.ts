import type { WorkflowControl } from "../../session/workflow-control.ts";
import type { CodeIntelToolExecCtx } from "../../types/index.ts";
import { emitToolProgress } from "./progress.ts";

/** Translate Pi execution controls into presentation-free session controls. */
export function toWorkflowControl(ctx: CodeIntelToolExecCtx): WorkflowControl {
  return {
    operationId: ctx.operationId,
    signal: ctx.signal,
    progress: (event) => emitToolProgress(ctx.onUpdate, `${event.intent}: ${event.message}`),
  };
}
