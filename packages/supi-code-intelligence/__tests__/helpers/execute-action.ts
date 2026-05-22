import { executeAffectedTool } from "../../src/tool/execute-affected.ts";
import { executeBriefTool } from "../../src/tool/execute-brief.ts";
import { executePatternTool } from "../../src/tool/execute-pattern.ts";
import { executeRelationsTool } from "../../src/tool/execute-relations.ts";
import type { CodeIntelResult } from "../../src/types.ts";

export type TestAction =
  | "brief"
  | "callers"
  | "callees"
  | "implementations"
  | "affected"
  | "pattern";

export interface ActionParams {
  action?: string;
  path?: string;
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  pattern?: string;
  regex?: boolean;
  kind?: string;
  exportedOnly?: boolean;
  maxResults?: number;
  contextLines?: number;
  summary?: boolean;
}

const SUPPORTED_ACTIONS = [
  "brief",
  "callers",
  "callees",
  "implementations",
  "affected",
  "pattern",
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
    case "callers":
      return executeRelationsTool({ ...rest, kind: "callers" }, ctx);
    case "callees":
      return executeRelationsTool({ ...rest, kind: "callees" }, ctx);
    case "implementations":
      return executeRelationsTool({ ...rest, kind: "implementations" }, ctx);
    case "affected":
      return executeAffectedTool(rest, ctx);
    case "pattern":
      return executePatternTool({ ...rest, pattern: rest.pattern ?? "" }, ctx);
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
