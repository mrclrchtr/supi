import type { TSchema } from "typebox";
import {
  DEFAULT_AST_SCAN_MAX_FILES,
  DEFAULT_AST_SCAN_TIMEOUT_MS,
} from "../analysis/search/ast-scan.ts";
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

/** Substrate families that power a tool's implementation. */
export type ToolSubstrate = "semantic" | "structural" | "search" | "diagnostics";

/** Canonical registration spec for one public code-intelligence tool. */
export interface CodeIntelligenceToolDefinitionSpec {
  name: CodeIntelligenceToolName;
  label: string;
  parameters: TSchema;
  maxLines?: number;
  maxBytes?: number;
  run: (params: unknown, ctx: CodeIntelToolExecCtx) => Promise<CodeIntelResult> | CodeIntelResult;
  purpose: string;
  schemaDocs: string;
  substrates: ToolSubstrate[];
  nonGoals: string[];
}

/** Single source of truth for the surviving eight-tool family. */
export const CODE_INTELLIGENCE_TOOL_SPECS = [
  {
    name: "code_resolve",
    label: "Code Resolve",
    parameters: CodeResolveParameters,
    run: (params, ctx) =>
      executeResolveTool(params as Parameters<typeof executeResolveTool>[0], ctx),
    purpose:
      "Resolve an anchor/symbol into handles or enumerate a file's declarations as a Target group.",
    schemaDocs: "Requires one exact target selector: anchor, symbol, or file.",
    substrates: ["semantic", "structural"],
    nonGoals: [
      "Handles do not persist across sessions.",
      "No text-search or structural-only target creation fallback.",
    ],
  },
  {
    name: "code_inspect",
    label: "Code Inspect",
    parameters: CodeInspectParameters,
    run: (params, ctx) =>
      executeInspectTool(params as Parameters<typeof executeInspectTool>[0], ctx),
    purpose: "Inspect one exact source point with semantic, structural, and diagnostic facts.",
    schemaDocs: "Requires point.file, point.line, and point.character.",
    substrates: ["semantic", "structural", "diagnostics"],
    nonGoals: ["Does not apply code actions."],
  },
  {
    name: "code_orientation",
    label: "Code Orientation",
    parameters: CodeOrientationParameters,
    run: (params, ctx) =>
      executeOrientationTool(params as Parameters<typeof executeOrientationTool>[0], ctx),
    purpose: "Orient around the workspace or one exact path, module, or target focus.",
    schemaDocs: "Omitted focus means workspace; otherwise focus is an exact-one selector.",
    substrates: ["semantic", "structural", "diagnostics"],
    nonGoals: ["Relation evidence belongs to code_graph.", "Health belongs to code_health."],
  },
  {
    name: "code_graph",
    label: "Code Graph",
    parameters: CodeGraphParameters,
    run: (params, ctx) => executeGraphTool(params as Parameters<typeof executeGraphTool>[0], ctx),
    purpose: "Collect references, structural callees, and implementations for one exact target.",
    schemaDocs:
      "Target is handle, anchor, or symbol; all expands to the three surviving relations.",
    substrates: ["semantic", "structural"],
    nonGoals: ["No inferred tests.", "No file-level import/export inventories."],
  },
  {
    name: "code_find",
    label: "Code Find",
    parameters: CodeFindParameters,
    run: (params, ctx) => executeFindTool(params as Parameters<typeof executeFindTool>[0], ctx),
    purpose: "Search structural source shape or semantic workspace symbols explicitly.",
    schemaDocs: `Requires query and ast/semantic mode; scope is optional and AST mode requires kind. AST enumeration uses a shared ${DEFAULT_AST_SCAN_TIMEOUT_MS / 1_000}-second deadline, a ${DEFAULT_AST_SCAN_MAX_FILES}-file cap, and canonical scope deduplication.`,
    substrates: ["semantic", "structural"],
    nonGoals: [
      "No literal or regex text search; use PI grep when active.",
      "No natural-language retrieval.",
      "No silent mode fallback.",
    ],
  },
  {
    name: "code_health",
    label: "Code Health",
    parameters: CodeHealthParameters,
    run: (params, ctx) => executeHealthTool(params as Parameters<typeof executeHealthTool>[0], ctx),
    purpose: "Report live diagnostic, runtime, and structural health observations.",
    schemaDocs: "Optional scope, refresh, include, and level; diagnostics and servers are default.",
    substrates: ["semantic", "structural", "diagnostics"],
    nonGoals: [
      "Does not run tests or verification commands.",
      "Does not load precomputed coverage or unused-code reports.",
    ],
  },
  {
    name: "code_refactor_plan",
    label: "Code Refactor Plan",
    parameters: CodeRefactorParameters,
    run: (params, ctx) =>
      executeRefactorPlanTool(params as Parameters<typeof executeRefactorPlanTool>[0], ctx),
    purpose: "Create a precise, non-mutating semantic refactor plan.",
    schemaDocs: "Requires one handle/anchor target and one exact operation payload.",
    substrates: ["semantic"],
    nonGoals: ["Never mutates files.", "No heuristic text edits."],
  },
  {
    name: "code_refactor_apply",
    label: "Code Refactor Apply",
    parameters: CodeApplyParameters,
    run: (params, ctx) =>
      executeRefactorApplyTool(params as Parameters<typeof executeRefactorApplyTool>[0], ctx),
    purpose: "Apply one stored, fingerprint-checked refactor plan.",
    schemaDocs: "Requires the planId returned by code_refactor_plan.",
    substrates: ["structural"],
    nonGoals: ["Does not compose plans.", "Does not bypass freshness checks."],
  },
] as const satisfies readonly CodeIntelligenceToolDefinitionSpec[];
