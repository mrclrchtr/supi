import type { TSchema } from "typebox";
import type {
  CodeIntelligenceToolName,
  CodeIntelResult,
  CodeIntelToolExecCtx,
} from "../types/index.ts";
import { executeFindTool } from "./find/execute.ts";
import { executeGraphTool } from "./graph/execute.ts";
import { executeHealthTool } from "./health/execute.ts";
import { executeImpactTool } from "./impact/execute.ts";
import { emitToolProgress } from "./infra/progress.ts";
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
  CodeImpactParameters,
  CodeInspectParameters,
  CodeOrientationParameters,
  CodeRefactorParameters,
  CodeResolveParameters,
} from "./schemas.ts";

/** Substrate families that power a tool's implementation. */
export type ToolSubstrate = "semantic" | "structural" | "search" | "git" | "diagnostics";

/** Deployment phase for a tool. */
export type ToolPhase = "phase-1" | "phase-2" | "phase-3" | "phase-4" | "phase-5" | "phase-6";

/** Canonical spec for one code-intelligence tool — runtime registration config. */
export interface CodeIntelligenceToolDefinitionSpec {
  name: CodeIntelligenceToolName;
  label: string;
  parameters: TSchema;
  /** Per-spec line-limit override for the adapter's head truncation. */
  maxLines?: number;
  /** Per-spec byte-limit override for the adapter's head truncation. */
  maxBytes?: number;
  /** When true, oversized truncated output spills to a temp file. */
  spillToTempFile?: boolean;
  run: (params: unknown, ctx: CodeIntelToolExecCtx) => Promise<CodeIntelResult> | CodeIntelResult;

  // ── Design metadata ────────────────────────────────────────────────

  /** One-line purpose summary for docs and tests. */
  purpose?: string;
  /** Key into CODE_INTELLIGENCE_TOOL_SCHEMAS. */
  schemaKey?: CodeIntelligenceToolName;
  /** Concise schema summary for future maintainers. */
  schemaDocs?: string;
  /** Legacy tools this tool absorbed (empty for new tools). */
  absorbsTools?: string[];
  /** Legacy behaviors this tool absorbed. */
  absorbsBehaviors?: string[];
  /** Substrate families that power the implementation. */
  substrates?: ToolSubstrate[];
  /** Deployment phase. */
  phase?: ToolPhase;
  /** Explicit non-goals — what the tool intentionally does NOT do. */
  nonGoals?: string[];
}

/**
 * Canonical code-intelligence tool specs — runtime registration data.
 *
 * Prompt descriptions and guidelines live in {@link ./guidance.ts}.
 */
export const CODE_INTELLIGENCE_TOOL_SPECS = [
  {
    name: "code_resolve",
    label: "Code Resolve",
    parameters: CodeResolveParameters,
    run: (params, ctx) =>
      executeResolveTool(params as Parameters<typeof executeResolveTool>[0], ctx),
    purpose:
      "Resolve human or code references into precise file/range/symbol targets and stable target handles.",
    schemaKey: "code_resolve",
    schemaDocs:
      "Accepts a query or file-based anchor plus optional scope/kind/maxResults. Later phases validate that line/character require file.",
    absorbsTools: [],
    absorbsBehaviors: [],
    substrates: ["semantic", "search"],
    phase: "phase-1",
    nonGoals: ["Target handles do not persist across sessions."],
  },
  {
    name: "code_inspect",
    label: "Code Inspect",
    parameters: CodeInspectParameters,
    run: (params, ctx) =>
      executeInspectTool(params as Parameters<typeof executeInspectTool>[0], ctx),
    purpose:
      "Inspect one precise point in code with best-effort syntax, symbol, hover, definition, diagnostics, and code-action facts.",
    schemaKey: "code_inspect",
    schemaDocs:
      "Requires file, line, and character plus optional maxResults. It is the explicit point-inspection surface; code_orientation handles broader orientation.",
    absorbsTools: [],
    absorbsBehaviors: ["anchored orientation inspection"],
    substrates: ["semantic", "structural", "diagnostics"],
    phase: "phase-2",
    nonGoals: [
      "Does not accept targetId in this first pass; inspection stays point-based.",
      "Does not apply code actions.",
    ],
  },
  {
    name: "code_orientation",
    label: "Code Orientation",
    parameters: CodeOrientationParameters,
    run: (params, ctx) =>
      executeOrientationTool(params as Parameters<typeof executeOrientationTool>[0], ctx),
    purpose:
      "Orient around a project, discovered module, directory, file, or precise symbol before choosing surgical follow-up tools.",
    schemaKey: "code_orientation",
    schemaDocs:
      "Accepts optional focus, targetId, line, character, and maxResults. Omitted focus returns workspace orientation; focus is path-first with discovered-module lookup; focus+line+character resolves a symbol; targetId wins over focus/coordinates.",
    absorbsTools: ["code_brief", "code_context"],
    absorbsBehaviors: [],
    substrates: ["semantic", "structural", "diagnostics"],
    phase: "phase-2",
    nonGoals: [
      "Does not provide relation, tests, or impact sections; use code_graph and code_impact.",
      "Does not resolve bare symbol names; use code_resolve first.",
    ],
  },
  {
    name: "code_graph",
    label: "Code Graph",
    parameters: CodeGraphParameters,
    spillToTempFile: true,
    run: (params, ctx) => executeGraphTool(params as Parameters<typeof executeGraphTool>[0], ctx),
    purpose:
      "Show the graph of relationships touching a target, including references, callees, imports, exports, implementations, and tests.",
    schemaKey: "code_graph",
    schemaDocs:
      "Accepts targetId plus relations and maxResults (per-relation result cap). Uses references rather than misleading callers labels.",
    absorbsTools: ["code_references", "code_calls", "code_implementations"],
    absorbsBehaviors: [],
    substrates: ["semantic", "structural", "search"],
    phase: "phase-3",
    nonGoals: [
      "Does not claim true incoming caller support until a real call hierarchy exists.",
      "Does not collapse unrelated impact or search concerns into the graph surface.",
    ],
  },
  {
    name: "code_impact",
    label: "Code Impact",
    parameters: CodeImpactParameters,
    spillToTempFile: true,
    run: (params, ctx) => executeImpactTool(params as Parameters<typeof executeImpactTool>[0], ctx),
    purpose:
      "Estimate blast radius for a target, user-supplied change set, or proposed change description, including likely tests and docs.",
    schemaKey: "code_impact",
    schemaDocs:
      "Accepts targetId, change, or changeSetFiles plus includeTests/maxResults. Runtime validation later requires at least one primary subject.",
    absorbsTools: [],
    absorbsBehaviors: [],
    substrates: ["semantic", "structural", "search", "diagnostics"],
    phase: "phase-4",
    nonGoals: [
      "Does not guarantee perfect downstream impact inference without substrate evidence.",
    ],
  },
  {
    name: "code_find",
    label: "Code Find",
    parameters: CodeFindParameters,
    spillToTempFile: true,
    run: (params, ctx) => executeFindTool(params as Parameters<typeof executeFindTool>[0], ctx),
    purpose:
      "Run unified ranked search across literal text, regex, AST, and semantic modes with one intent-level surface.",
    schemaKey: "code_find",
    schemaDocs:
      "Requires query and supports scope, mode, kind, contextLines, and maxResults. Excludes speculative natural-language mode.",
    absorbsTools: ["code_pattern"],
    absorbsBehaviors: [],
    substrates: ["semantic", "structural", "search"],
    phase: "phase-2",
    nonGoals: [
      "Does not activate natural-language retrieval without a real implementation.",
      "Removed code_pattern in Phase 2b (TNDM-057XHJ).",
    ],
  },
  {
    name: "code_refactor_plan",
    label: "Code Refactor Plan",
    parameters: CodeRefactorParameters,
    run: async (params, ctx) => {
      emitToolProgress(
        ctx.onUpdate,
        `code_refactor_plan: requesting ${(params as Record<string, unknown>).operation} plan from LSP...`,
      );
      return executeRefactorPlanTool(
        params as Parameters<typeof executeRefactorPlanTool>[0],
        ctx,
        "code_refactor_plan",
      );
    },
    purpose:
      "Create precise refactor plans for named operations such as rename and extract refactors.",
    schemaKey: "code_refactor_plan",
    schemaDocs:
      "Uses a scoped operation enum with target/file coordinates, optional selected range, and operation-specific options. This is the only intentional operation-style schema.",
    absorbsTools: [],
    absorbsBehaviors: [],
    substrates: ["semantic", "structural", "search"],
    phase: "phase-5",
    nonGoals: [
      "Does not introduce a broad action mega-tool.",
      "code_refactor_plan is a pure planner; use code_refactor_apply to execute stored plans.",
    ],
  },
  {
    name: "code_refactor_apply",
    label: "Code Refactor Apply",
    parameters: CodeApplyParameters,
    run: (params, ctx) =>
      executeRefactorApplyTool(params as Parameters<typeof executeRefactorApplyTool>[0], ctx),
    purpose: "Apply a previously stored plan through explicit, fingerprint-checked mutation.",
    schemaKey: "code_refactor_apply",
    schemaDocs:
      "Requires a planId. Enforces stale-plan rejection, validation, and fingerprint checks before mutation.",
    absorbsTools: [],
    absorbsBehaviors: [],
    substrates: ["semantic", "search", "git"],
    phase: "phase-5",
    nonGoals: [
      "Does not bypass plan validation or fingerprint checks.",
      "Format/verify modes are not implemented; they return explicit unavailable outcomes when added later.",
    ],
  },
  {
    name: "code_health",
    label: "Code Health",
    parameters: CodeHealthParameters,
    run: (params, ctx) => executeHealthTool(params as Parameters<typeof executeHealthTool>[0], ctx),
    purpose:
      "Summarize diagnostics, provider state, dirty workspace signals, and maintenance cues from one workflow-oriented health surface.",
    schemaKey: "code_health",
    schemaDocs:
      "Accepts scope, refresh, include sections, and detail level. It is the planned replacement for direct public diagnostic and recovery substrate access.",
    absorbsTools: ["lsp_diagnostics", "lsp_recover"],
    absorbsBehaviors: ["ci-status summary"],
    substrates: ["semantic", "search", "git", "diagnostics"],
    phase: "phase-6",
    nonGoals: [
      "Public lsp_* and tree_sitter_* tools were removed; only code_* tools remain on the public surface.",
      "Does not act as a generic verification/test runner.",
    ],
  },
] as const satisfies readonly CodeIntelligenceToolDefinitionSpec[];
