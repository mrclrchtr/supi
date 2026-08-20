import { createSessionCache } from "../../src/app/app.ts";
import type { GraphTargetInput, TargetInput } from "../../src/session/target-input.ts";
import type { GraphRelation } from "../../src/tool/code_graph/execute.ts";
import { executeGraphTool } from "../../src/tool/code_graph/execute.ts";
import { executeOrientationTool } from "../../src/tool/code_orientation/execute.ts";
import { executeRefactorApplyTool } from "../../src/tool/code_refactor_apply/execute.ts";
import { executeRefactorPlanTool } from "../../src/tool/code_refactor_plan/execute.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../src/types/index.ts";

export type TestAction =
  | "graph"
  | "context"
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
  maxResults?: number;
  relations?: string[];
  operation?: string;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  newName?: string;
  planId?: string;
}

const SUPPORTED_ACTIONS = [
  "graph",
  "context",
  "refactor",
  "apply",
  "refactor_plan",
  "refactor_apply",
] as const satisfies readonly TestAction[];

export const sessionCache = createSessionCache();

function buildCtx(ctx: { cwd: string }): CodeIntelToolExecCtx {
  return { cwd: ctx.cwd, session: sessionCache.getOrCreate(ctx.cwd) };
}

export function makeTestCtx(cwd: string): CodeIntelToolExecCtx {
  return { cwd, session: sessionCache.getOrCreate(cwd) };
}

/** Route compact test fixtures through the focused public Tool adapters. */
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
          focus: toOrientationFocus(rest),
          maxResults: rest.maxResults,
        },
        fullCtx,
      );
    case "graph":
      return executeGraphTool(
        {
          target: toGraphTarget(rest),
          relations: rest.relations as GraphRelation[] | undefined,
          maxResults: rest.maxResults,
        },
        fullCtx,
      );
    case "refactor":
    case "refactor_plan":
      return executeRefactorPlanTool(toRefactorParams(rest), fullCtx);
    case "apply":
    case "refactor_apply":
      return executeRefactorApplyTool({ planId: rest.planId ?? "" }, fullCtx);
    default:
      return {
        content: `**Error:** Unknown action \`${String(action)}\`.`,
        details: undefined,
      };
  }
}

function toOrientationFocus(rest: Omit<ActionParams, "action">) {
  if (rest.targetId) return { target: { handle: rest.targetId } } as const;
  if (rest.file && rest.line && rest.character) {
    return {
      target: {
        anchor: { file: rest.file, line: rest.line, character: rest.character },
      },
    } as const;
  }
  const path = rest.path ?? rest.file;
  return path ? ({ path } as const) : undefined;
}

function toGraphTarget(rest: Omit<ActionParams, "action">): GraphTargetInput {
  const target = toTarget(rest);
  if ("file" in target) {
    return { anchor: { file: target.file, line: rest.line ?? 1, character: rest.character ?? 1 } };
  }
  return target;
}

function toTarget(rest: Omit<ActionParams, "action">): TargetInput {
  if (rest.targetId) return { handle: rest.targetId };
  if (rest.file && rest.line && rest.character) {
    return { anchor: { file: rest.file, line: rest.line, character: rest.character } };
  }
  if (rest.symbol) return { symbol: { query: rest.symbol, scope: rest.path } };
  return { file: rest.file ?? rest.path ?? "." };
}

function toRefactorParams(rest: Omit<ActionParams, "action">) {
  const target = toTarget(rest);
  const operation = rest.operation ?? "rename_symbol";
  if (operation === "extract_function" || operation === "extract_variable") {
    return {
      target,
      operation: {
        [operation]: {
          newName: rest.newName ?? "extracted",
          range: rest.range ?? {
            start: { line: rest.line ?? 1, character: rest.character ?? 1 },
            end: { line: rest.line ?? 1, character: (rest.character ?? 1) + 1 },
          },
        },
      },
    } as Parameters<typeof executeRefactorPlanTool>[0];
  }
  return {
    target,
    operation: { rename_symbol: { newName: rest.newName ?? "renamed" } },
  } as Parameters<typeof executeRefactorPlanTool>[0];
}

function isSupportedAction(action: string | undefined): action is TestAction {
  return action != null && SUPPORTED_ACTIONS.includes(action as TestAction);
}

function stripAction(params: ActionParams): Omit<ActionParams, "action"> {
  const { action: _action, ...rest } = params;
  return rest;
}
