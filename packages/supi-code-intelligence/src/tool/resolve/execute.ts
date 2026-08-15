/** Thin Pi adapter for code_resolve. */

import type { ResolveTargetInput } from "../../session/target-input.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { toWorkflowControl } from "../infra/workflow-control.ts";
import { assembleResolveResult } from "../result/resolve.ts";
import { renderResolveResult } from "./markdown.ts";

export interface CodeResolveToolParams {
  target: ResolveTargetInput;
  maxResults?: number;
}

export async function executeResolveTool(
  params: CodeResolveToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const outcome = await ctx.session.resolve(params, toWorkflowControl(ctx));
  if (outcome.kind === "unavailable") {
    throw new Error(outcome.reason);
  }

  const assembly = assembleResolveResult(outcome, ctx.cwd);
  const content = renderResolveResult(assembly);

  return {
    content,
    details: {
      type: "resolve",
      data: assembly.details,
      status:
        outcome.kind === "resolved" || outcome.kind === "target-group"
          ? "completed"
          : outcome.kind === "disambiguation" || outcome.kind === "kind-mismatch"
            ? "disambiguation"
            : "invalid-input",
      ...(outcome.kind === "invalid-input"
        ? { message: outcome.message }
        : outcome.kind === "disambiguation"
          ? { message: "Multiple target matches require one candidate." }
          : outcome.kind === "kind-mismatch"
            ? { message: `No target matched provider kind ${outcome.requestedKind}.` }
            : {}),
      displaySections: assembly.displaySections,
    },
  };
}
