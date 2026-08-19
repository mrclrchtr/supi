import type { TSchema } from "typebox";
import type {
  CodeIntelligenceToolName,
  CodeIntelResult,
  CodeIntelToolExecCtx,
} from "../types/index.ts";
import { executeFindTool } from "./find/execute.ts";
import { executeGraphTool } from "./graph/execute.ts";
import { executeHealthTool } from "./health/execute.ts";
import { executeInspectTool } from "./inspect/execute.ts";
import { executeOrientationTool } from "./orientation/execute.ts";
import { executeRefactorApplyTool } from "./refactor-apply/execute.ts";
import { executeRefactorPlanTool } from "./refactor-plan/execute.ts";
import { executeResolveTool } from "./resolve/execute.ts";
import {
  CodeApplyParameters,
  CodeFindParameters,
  CodeGraphParameters,
  CodeHealthParameters,
  CodeInspectParameters,
  CodeOrientationParameters,
  CodeRefactorParameters,
  CodeResolveParameters,
} from "./schemas.ts";

/**
 * Canonical registration spec for one public code-intelligence tool.
 *
 * Model-facing prose is not part of the spec: descriptions, snippets, and
 * guidelines live in `guidance.ts`, parameter mechanics live in `schemas.ts`.
 */
export interface CodeIntelligenceToolDefinitionSpec {
  name: CodeIntelligenceToolName;
  label: string;
  parameters: TSchema;
  maxLines?: number;
  maxBytes?: number;
  run: (params: unknown, ctx: CodeIntelToolExecCtx) => Promise<CodeIntelResult> | CodeIntelResult;
}

/** Single source of truth for the surviving eight-tool family. */
export const CODE_INTELLIGENCE_TOOL_SPECS = [
  {
    name: "code_resolve",
    label: "Code Resolve",
    parameters: CodeResolveParameters,
    run: (params, ctx) =>
      executeResolveTool(params as Parameters<typeof executeResolveTool>[0], ctx),
  },
  {
    name: "code_inspect",
    label: "Code Inspect",
    parameters: CodeInspectParameters,
    run: (params, ctx) =>
      executeInspectTool(params as Parameters<typeof executeInspectTool>[0], ctx),
  },
  {
    name: "code_orientation",
    label: "Code Orientation",
    parameters: CodeOrientationParameters,
    run: (params, ctx) =>
      executeOrientationTool(params as Parameters<typeof executeOrientationTool>[0], ctx),
  },
  {
    name: "code_graph",
    label: "Code Graph",
    parameters: CodeGraphParameters,
    run: (params, ctx) => executeGraphTool(params as Parameters<typeof executeGraphTool>[0], ctx),
  },
  {
    name: "code_find",
    label: "Code Find",
    parameters: CodeFindParameters,
    run: (params, ctx) => executeFindTool(params as Parameters<typeof executeFindTool>[0], ctx),
  },
  {
    name: "code_health",
    label: "Code Health",
    parameters: CodeHealthParameters,
    run: (params, ctx) => executeHealthTool(params as Parameters<typeof executeHealthTool>[0], ctx),
  },
  {
    name: "code_refactor_plan",
    label: "Code Refactor Plan",
    parameters: CodeRefactorParameters,
    run: (params, ctx) =>
      executeRefactorPlanTool(params as Parameters<typeof executeRefactorPlanTool>[0], ctx),
  },
  {
    name: "code_refactor_apply",
    label: "Code Refactor Apply",
    parameters: CodeApplyParameters,
    run: (params, ctx) =>
      executeRefactorApplyTool(params as Parameters<typeof executeRefactorApplyTool>[0], ctx),
  },
] as const satisfies readonly CodeIntelligenceToolDefinitionSpec[];
