/** Thin Pi adapter for the session-owned code_find workflow. */

import type { FindMode, FindWorkflowInput } from "../../session/find-types.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { toWorkflowControl } from "../infra/workflow-control.ts";
import { searchErrorResult } from "../result/errors.ts";
import { assembleFindWorkflowResult } from "../result/find.ts";
import type { CodeFindAstKind } from "./ast-kinds.ts";
import { renderFindResult } from "./render.ts";

export interface CodeFindToolParams {
  query: string;
  scope?: string[];
  mode: FindMode;
  kind?: CodeFindAstKind;
  maxResults?: number;
}

export async function executeFindTool(
  params: CodeFindToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const outcome = await ctx.session.find(params as FindWorkflowInput, toWorkflowControl(ctx));
  if (outcome.kind === "unavailable") throw new Error(outcome.reason);
  if (outcome.kind === "invalid-input") {
    return searchErrorResult(`**Error:** ${outcome.message}`, {
      scope: Array.isArray(params?.scope) ? params.scope.join(", ") : null,
      nextQueries: ["Fix the search input and retry"],
      message: outcome.message,
    });
  }

  const assembly = assembleFindWorkflowResult(outcome);
  return {
    content: renderFindResult(assembly),
    details: {
      type: "search",
      data: assembly.details,
      status: "completed",
      displaySections: assembly.displaySections,
    },
  };
}
