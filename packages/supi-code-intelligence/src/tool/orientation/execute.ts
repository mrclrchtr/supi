/** Thin Pi adapter for the session-owned Orientation workflow. */

import type {
  OrientationFocusInput,
  OrientationWorkflowInput,
} from "../../session/orientation-types.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { toWorkflowControl } from "../infra/workflow-control.ts";
import { contextErrorResult } from "../result/errors.ts";
import {
  assembleOrientationDetails,
  assembleOrientationResult,
  orientationCandidateDisplaySections,
} from "../result/orientation.ts";
import { renderOrientationResult } from "./markdown.ts";

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
  if (outcome.kind === "unavailable") throw new Error(outcome.reason);
  if (outcome.kind === "invalid-input") {
    return contextErrorResult(`**Error:** ${outcome.message}`, {
      nextQueries: ["Choose an existing path, module, or precise target"],
      message: outcome.message,
    });
  }
  if (outcome.kind === "disambiguation" || outcome.kind === "kind-mismatch") {
    const candidates = outcome.candidates ?? [];
    const lines = [
      outcome.kind === "kind-mismatch"
        ? `# No Orientation target matched provider kind \`${outcome.requestedKind}\``
        : "# Multiple Orientation targets",
      "",
    ];
    for (const candidate of candidates) {
      lines.push(
        `${candidate.rank}. **${candidate.name}** (\`${candidate.kind ?? "unknown"}\`) — \`${candidate.file}\`:${candidate.line}:${candidate.character} — \`${candidate.targetId}\``,
      );
    }
    const nextQueries =
      outcome.kind === "kind-mismatch"
        ? ["Retry without symbolKind, use an observed provider kind, or focus one handle"]
        : ["Use one candidate handle as focus.target.handle"];
    const details = assembleOrientationDetails({
      confidence: "semantic",
      omittedCount: outcome.omittedCount,
      candidates,
      nextQueries,
    });
    return {
      content: lines.join("\n"),
      details: {
        type: "context",
        data: details,
        status: "completed",
        displaySections: orientationCandidateDisplaySections(candidates, outcome.omittedCount),
      },
    };
  }
  const assembly = assembleOrientationResult(outcome.data);
  return {
    content: renderOrientationResult(assembly),
    details: {
      type: "context",
      data: assembly.details,
      status: "completed",
      displaySections: assembly.displaySections,
    },
  };
}
