import { executeAffectedTool } from "../../src/tool/execute-affected.ts";
import { executeBriefTool } from "../../src/tool/execute-brief.ts";
import { executeCallsTool } from "../../src/tool/execute-calls.ts";
import { executeFindTool } from "../../src/tool/execute-find.ts";
import { executeImplementationsTool } from "../../src/tool/execute-implementations.ts";
import { executeRefactorApplyTool } from "../../src/tool/execute-refactor-apply.ts";
import { executeRefactorPlanTool } from "../../src/tool/execute-refactor-plan.ts";
import { executeReferencesTool } from "../../src/tool/execute-references.ts";
import type { CodeIntelResult } from "../../src/types.ts";

export type TestAction =
  | "brief"
  | "references"
  | "calls"
  | "implementations"
  | "affected"
  | "find"
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
  operation?: string;
  newName?: string;
  planId?: string;
}

const SUPPORTED_ACTIONS = [
  "brief",
  "references",
  "calls",
  "implementations",
  "affected",
  "find",
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
    case "brief":
      return executeBriefTool(rest, ctx);
    case "references":
      return executeReferencesTool(rest, ctx);
    case "calls":
      return executeCallsTool(rest as Parameters<typeof executeCallsTool>[0], ctx);
    case "implementations":
      return executeImplementationsTool(rest, ctx);
    case "affected":
      return executeAffectedTool(rest, ctx);
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
