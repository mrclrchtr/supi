import type { WorkflowControl } from "../../session/workflow-control.ts";
import type { CodeIntelToolExecCtx } from "../../types/index.ts";
import { emitToolProgress } from "./progress.ts";

/**
 * Internal absolute deadline for one public code tool call. Pi supplies only
 * a signal, so the adapter derives one bounded deadline per call.
 */
export const DEFAULT_WORKFLOW_DEADLINE_MS = 60_000;

/** Translate Pi execution controls into presentation-free session controls. */
export function toWorkflowControl(ctx: CodeIntelToolExecCtx): WorkflowControl {
  return {
    operationId: ctx.operationId,
    signal: ctx.signal,
    deadline: Date.now() + DEFAULT_WORKFLOW_DEADLINE_MS,
    progress: (event) => emitToolProgress(ctx.onUpdate, `${event.intent}: ${event.message}`),
  };
}
