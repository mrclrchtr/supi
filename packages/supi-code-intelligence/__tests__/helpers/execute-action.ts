import { createSessionCache } from "../../src/app/app.ts";
import { executeFindTool } from "../../src/tool/find/execute.ts";
import type { GraphRelation } from "../../src/tool/graph/execute.ts";
import { executeGraphTool } from "../../src/tool/graph/execute.ts";
import { executeImpactTool } from "../../src/tool/impact/execute.ts";
import { executeOrientationTool } from "../../src/tool/orientation/execute.ts";
import { executeRefactorApplyTool } from "../../src/tool/refactor-apply/execute.ts";
import { executeRefactorPlanTool } from "../../src/tool/refactor-plan/execute.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../src/types/index.ts";

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
  targetId?: string;
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
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  newName?: string;
  planId?: string;
  mode?: "apply";
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

export const sessionCache = createSessionCache();

/**
 * Build a full CodeIntelToolExecCtx from a minimal cwd-only context.
 *
 * Uses a module-level session cache so targets registered in one call
 * are visible to subsequent tool calls for the same cwd.
 */
function buildCtx(ctx: { cwd: string }): CodeIntelToolExecCtx {
  const session = sessionCache.getOrCreate(ctx.cwd);
  return { cwd: ctx.cwd, session };
}

/**
 * Build a CodeIntelToolExecCtx from a cwd string for direct executor calls.
 * Used in tests that call executors without going through `executeAction`.
 */
export function makeTestCtx(cwd: string): CodeIntelToolExecCtx {
  const session = sessionCache.getOrCreate(cwd);
  return { cwd, session };
}

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
  const fullCtx = buildCtx(ctx);

  switch (action) {
    case "context":
      return executeOrientationTool(
        {
          focus: rest.path ?? rest.file,
          targetId: rest.targetId,
          line: rest.line,
          character: rest.character,
          maxResults: rest.maxResults,
        },
        fullCtx,
      );
    case "impact":
      return executeImpactTool(rest, fullCtx);
    case "graph":
      return executeGraphTool(
        {
          targetId: rest.targetId,
          file: rest.file,
          line: rest.line,
          character: rest.character,
          symbol: rest.symbol,
          scope: rest.path,
          relations: rest.relations as GraphRelation[] | undefined,
          maxResults: rest.maxResults,
        },
        fullCtx,
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
            | "interface"
            | "test"
            | undefined,
          maxResults: rest.maxResults,
          contextLines: rest.contextLines,
        } as Parameters<typeof executeFindTool>[0],
        fullCtx,
      );
    case "refactor":
      return executeRefactorPlanTool(
        rest as Parameters<typeof executeRefactorPlanTool>[0],
        fullCtx,
        "code_refactor_plan",
      );
    case "apply":
      return executeRefactorApplyTool(
        rest as Parameters<typeof executeRefactorApplyTool>[0],
        fullCtx,
      );
    case "refactor_plan":
      return executeRefactorPlanTool(
        rest as Parameters<typeof executeRefactorPlanTool>[0],
        fullCtx,
      );
    case "refactor_apply":
      return executeRefactorApplyTool(
        rest as Parameters<typeof executeRefactorApplyTool>[0],
        fullCtx,
      );
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
