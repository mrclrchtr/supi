/** Thin Pi adapter for the session-owned code_health workflow. */

import type { HealthSection, HealthWorkflowInput } from "../../session/health-types.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { toWorkflowControl } from "../infra/workflow-control.ts";
import { healthErrorResult } from "../result/errors.ts";
import { assembleHealthResult } from "../result/health.ts";
import { renderHealthResult } from "./markdown.ts";

export interface CodeHealthToolParams {
  scope?: string;
  refresh?: boolean;
  include?: HealthSection[];
  level?: "summary" | "detailed";
}

export async function executeHealthTool(
  params: CodeHealthToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const outcome = await ctx.session.health(params as HealthWorkflowInput, toWorkflowControl(ctx));
  if (outcome.kind === "unavailable") throw new Error(outcome.reason);
  if (outcome.kind === "invalid-input") {
    return healthErrorResult(`**Error:** ${outcome.message}`, outcome.message);
  }

  const assembly = assembleHealthResult(outcome.data);
  return {
    content: renderHealthResult(assembly, ctx.cwd),
    details: {
      type: "health",
      data: assembly.details,
      status: "completed",
      displaySections: assembly.displaySections,
    },
  };
}
