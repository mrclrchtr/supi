/** Thin Pi adapter for the session-owned code_graph workflow. */

import type { GraphWorkflowInput, RequestedGraphRelation } from "../../session/graph-types.ts";
import type { GraphTargetInput } from "../../session/target-input.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { searchErrorResult } from "../infra/error-results.ts";
import { toWorkflowControl } from "../infra/workflow-control.ts";
import { assembleGraphResult } from "../result/graph.ts";
import { renderGraphResult } from "./markdown-base.ts";

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

  if (outcome.kind === "unavailable") throw new Error(outcome.reason);
  if (outcome.kind === "invalid-input") {
    return searchErrorResult(`**Error:** ${outcome.message}`);
  }
  if (outcome.kind === "disambiguation") {
    const lines = ["**Target is ambiguous. Choose one candidate handle:**", ""];
    for (const candidate of outcome.candidates) {
      lines.push(
        `- \`${candidate.targetId}\` — ${candidate.name} at ${candidate.file}:${candidate.line}:${candidate.character}`,
      );
    }
    return searchErrorResult(lines.join("\n"));
  }

  const assembly = assembleGraphResult({
    displayName: outcome.displayName,
    sections: outcome.sections,
    resolvedDisplayFile: outcome.resolvedDisplayFile,
    maxResults: outcome.maxResults,
    cwd: ctx.cwd,
  });
  return {
    content: renderGraphResult(assembly),
    details: { type: "search", data: assembly.details },
  };
}
