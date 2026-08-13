/** Thin Pi adapter for session-owned point inspection. */

import type { InspectWorkflowInput } from "../../session/inspect-types.ts";
import type { SourcePointInput } from "../../session/target-input.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { toWorkflowControl } from "../infra/workflow-control.ts";
import { inspectErrorResult } from "../result/errors.ts";
import { assembleInspectResult } from "../result/inspect.ts";
import { renderInspectResult } from "./markdown.ts";

export interface CodeInspectToolParams {
  point: SourcePointInput;
  maxResults?: number;
}

export async function executeInspectTool(
  params: CodeInspectToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const outcome = await ctx.session.inspect(params as InspectWorkflowInput, toWorkflowControl(ctx));
  if (outcome.kind === "unavailable") throw new Error(outcome.reason);
  if (outcome.kind === "invalid-input") {
    return inspectErrorResult(`**Error:** ${outcome.message}`, {
      focusTarget: "invalid input",
      nextQueries: ["Provide an existing file and exact 1-based point"],
      message: outcome.message,
    });
  }

  const assembly = assembleInspectResult(outcome.data, outcome.nextQueries);
  return {
    content: renderInspectResult(assembly),
    details: {
      type: "inspect",
      data: assembly.details,
      status: "completed",
      displaySections: assembly.displaySections,
    },
  };
}
