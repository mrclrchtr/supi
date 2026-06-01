import { executeApplyTool } from "../../src/tool/execute-apply.ts";
import { executeContextTool } from "../../src/tool/execute-context.ts";
import { executeFindTool } from "../../src/tool/execute-find.ts";
import type { GraphRelation } from "../../src/tool/execute-graph.ts";
import { executeGraphTool } from "../../src/tool/execute-graph.ts";
import { executeImpactTool } from "../../src/tool/execute-impact.ts";
import { executeRefactorTool } from "../../src/tool/execute-refactor.ts";
import { executeRefactorApplyTool } from "../../src/tool/execute-refactor-apply.ts";
import { executeRefactorPlanTool } from "../../src/tool/execute-refactor-plan.ts";
import type { CodeIntelResult } from "../../src/types.ts";

export type TestAction =
  | "graph"
  | "context"
  | "impact"
  | "find"
  | "refactor"
  | "apply"
  | "refactor_plan"
  | "refactor_apply";

export interface ActionParams {
  action?: string;
  path?: string;
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  pattern?: string;
  query?: string;
  regex?: boolean;
  kind?: string;
  exportedOnly?: boolean;
  maxResults?: number;
  contextLines?: number;
  summary?: boolean;
  relations?: string[];
  operation?: string;
  newName?: string;
  planId?: string;
  mode?: "apply" | "apply-and-format" | "apply-and-verify";
}

const SUPPORTED_ACTIONS = [
  "graph",
  "context",
  "impact",
  "find",
  "refactor",
  "apply",
  "refactor_plan",
  "refactor_apply",
] as const satisfies readonly TestAction[];

/**
 * Test-only legacy action shim that routes old action-shaped fixtures through the
 * current focused-tool adapters.
 */
export async function executeAction(
  params: ActionParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const action = params.action;
  if (!isSupportedAction(action)) {
    return {
      content: `**Error:** Unknown action \`${params.action ?? "(none)"}\`. Supported: ${SUPPORTED_ACTIONS.map((name) => `\`${name}\``).join(", ")}.`,
      details: undefined,
    };
  }

  const rest = stripAction(params);

  switch (action) {
    case "context":
      return executeContextTool(rest, ctx);
    case "impact":
      return executeImpactTool(rest, ctx);
    case "graph":
      return executeGraphTool(
        {
          file: rest.file,
          line: rest.line,
          character: rest.character,
          symbol: rest.symbol,
          path: rest.path,
          relations: rest.relations as GraphRelation[] | undefined,
          maxResults: rest.maxResults,
        },
        ctx,
      );
    case "find":
      return executeFindTool(
        {
          query: rest.query ?? rest.pattern ?? "",
          scope: rest.path,
          mode: rest.regex ? "regex" : "text",
          kind: rest.kind as
            | "definition"
            | "import"
            | "export"
            | "call"
            | "type"
            | "test"
            | undefined,
          maxResults: rest.maxResults,
          contextLines: rest.contextLines,
        } as Parameters<typeof executeFindTool>[0],
        ctx,
      );
    case "refactor":
      return executeRefactorTool(rest as Parameters<typeof executeRefactorTool>[0], ctx);
    case "apply":
      return executeApplyTool(rest as Parameters<typeof executeApplyTool>[0], ctx);
    case "refactor_plan":
      return executeRefactorPlanTool(rest as Parameters<typeof executeRefactorPlanTool>[0], ctx);
    case "refactor_apply":
      return executeRefactorApplyTool(rest as Parameters<typeof executeRefactorApplyTool>[0], ctx);
    default:
      return {
        content: `**Error:** Unknown action \`${action satisfies never}\`.`,
        details: undefined,
      };
  }
}

function isSupportedAction(action: string | undefined): action is TestAction {
  return action != null && SUPPORTED_ACTIONS.includes(action as TestAction);
}

function stripAction(params: ActionParams): Omit<ActionParams, "action"> {
  const { action: _action, ...rest } = params;
  return rest;
}
