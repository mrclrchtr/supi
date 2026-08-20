import type { Component } from "@earendil-works/pi-tui";
import type { TSchema } from "typebox";
import type {
  CodeIntelligenceToolName,
  CodeIntelResult,
  CodeIntelToolExecCtx,
} from "../types/index.ts";
import { codeFindSpec } from "./code_find/spec.ts";
import { codeGraphSpec } from "./code_graph/spec.ts";
import { codeHealthSpec } from "./code_health/spec.ts";
import { codeInspectSpec } from "./code_inspect/spec.ts";
import { codeOrientationSpec } from "./code_orientation/spec.ts";
import { codeRefactorApplySpec } from "./code_refactor_apply/spec.ts";
import { codeRefactorPlanSpec } from "./code_refactor_plan/spec.ts";
import { codeResolveSpec } from "./code_resolve/spec.ts";

/**
 * Canonical registration spec for one public code-intelligence tool.
 *
 * Model-facing prose is not part of the spec: descriptions, snippets, and
 * guidelines live in each tool's `guidance.ts`, parameter mechanics live in
 * each tool's `spec.ts` over the shared vocabulary in `schemas.ts`.
 */
// biome-ignore lint/suspicious/noExplicitAny: pi render call/result signatures vary per tool
export type CodeToolRendererFn = (...args: any[]) => Component;

export interface CodeIntelligenceToolDefinitionSpec {
  name: CodeIntelligenceToolName;
  label: string;
  parameters: TSchema;
  maxLines?: number;
  maxBytes?: number;
  run: (params: unknown, ctx: CodeIntelToolExecCtx) => Promise<CodeIntelResult> | CodeIntelResult;
  renderCall?: CodeToolRendererFn;
  renderResult?: CodeToolRendererFn;
}

/** Single source of truth for the surviving eight-tool family. */
export const CODE_INTELLIGENCE_TOOL_SPECS = [
  codeResolveSpec,
  codeInspectSpec,
  codeOrientationSpec,
  codeGraphSpec,
  codeFindSpec,
  codeHealthSpec,
  codeRefactorPlanSpec,
  codeRefactorApplySpec,
] as const satisfies readonly CodeIntelligenceToolDefinitionSpec[];

/** Code intelligence tool schemas keyed by public tool name. */
export const CODE_INTELLIGENCE_TOOL_SCHEMAS = {
  code_resolve: codeResolveSpec.parameters,
  code_inspect: codeInspectSpec.parameters,
  code_orientation: codeOrientationSpec.parameters,
  code_find: codeFindSpec.parameters,
  code_graph: codeGraphSpec.parameters,
  code_refactor_plan: codeRefactorPlanSpec.parameters,
  code_refactor_apply: codeRefactorApplySpec.parameters,
  code_health: codeHealthSpec.parameters,
} as const satisfies Record<CodeIntelligenceToolName, TSchema>;
