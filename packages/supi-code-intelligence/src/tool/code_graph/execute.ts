/** Thin Pi adapter for the session-owned code_graph workflow. */

import type { GraphWorkflowInput, RequestedGraphRelation } from "../../session/graph-types.ts";
import type { GraphTargetInput } from "../../session/target-input.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { toWorkflowControl } from "../infra/workflow-control.ts";
import { createToolDisplaySection } from "../result/display.ts";
import { searchErrorResult } from "../result/errors.ts";
import { renderGraphResult } from "./markdown.ts";
import { assembleGraphResult } from "./result.ts";

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
    return searchErrorResult(`**Error:** ${outcome.message}`, { message: outcome.message });
  }
  if (outcome.kind === "disambiguation" || outcome.kind === "kind-mismatch") {
    const lines = [
      outcome.kind === "kind-mismatch"
        ? `**No target matched provider kind \`${outcome.requestedKind}\`. Near matches:**`
        : "**Target is ambiguous. Choose one candidate handle:**",
      "",
    ];
    for (const candidate of outcome.candidates) {
      lines.push(
        `- \`${candidate.targetId}\` — ${candidate.name} (\`${candidate.kind ?? "unknown"}\`) at ${candidate.file}:${candidate.line}:${candidate.character}`,
      );
    }
    if (outcome.kind === "kind-mismatch") {
      lines.push(
        "",
        "Retry without `symbolKind`, use an observed provider kind, or choose a handle.",
      );
    }
    return searchErrorResult(lines.join("\n"), {
      message:
        outcome.kind === "kind-mismatch"
          ? `No target matched provider kind ${outcome.requestedKind}.`
          : "The target is ambiguous.",
      displaySections: [
        createToolDisplaySection({
          key: "graph.candidates",
          title: "Candidates",
          items: outcome.candidates,
          format: (candidate) =>
            `${candidate.targetId} — ${candidate.name} (${candidate.kind ?? "unknown"}) at ${candidate.file}:${candidate.line}:${candidate.character}`,
        }),
      ],
    });
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
    details: {
      type: "search",
      data: assembly.details,
      status: "completed",
      displaySections: assembly.displaySections,
    },
  };
}
