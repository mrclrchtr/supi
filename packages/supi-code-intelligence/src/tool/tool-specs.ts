import type { TSchema } from "typebox";
import type { CodeIntelligenceToolName } from "../intent/types.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../types.ts";
import { executeOrientationTool } from "./execute-context.ts";
import { executeFindTool } from "./execute-find.ts";
import { executeGraphTool } from "./execute-graph.ts";
import { executeHealthTool } from "./execute-health.ts";
import { executeImpactTool } from "./execute-impact.ts";
import { executeInspectTool } from "./execute-inspect.ts";
import { executeRefactorApplyTool } from "./execute-refactor-apply.ts";
import { executeRefactorPlanTool } from "./execute-refactor-plan.ts";
import { executeResolveTool } from "./execute-resolve.ts";
import { emitToolProgress } from "./progress.ts";
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

/** Canonical spec for one code-intelligence tool — runtime config + design metadata. */
export interface CodeIntelligenceToolDefinitionSpec {
  name: CodeIntelligenceToolName;
  label: string;
  /** Full user-facing tool description shown in the prompt. */
  description: string;
  promptSnippet: string;
  basePromptGuidelines: string[];
  parameters: TSchema;
  /** Per-spec line-limit override for the adapter's head truncation. */
  maxLines?: number;
  /** Per-spec byte-limit override for the adapter's head truncation. */
  maxBytes?: number;
  /** When true, oversized truncated output spills to a temp file. */
  spillToTempFile?: boolean;
  run: (params: unknown, ctx: CodeIntelToolExecCtx) => Promise<CodeIntelResult> | CodeIntelResult;

  // ── Design metadata (formerly workflow/surface.ts) ─────────────────

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
 * Canonical code-intelligence tool specs — the single source of truth
 * for runtime registration, prompt surfaces, design documentation, and tests.
 */
export const CODE_INTELLIGENCE_TOOL_SPECS = [
  {
    name: "code_resolve",
    label: "Code Resolve",
    description:
      "Resolve human or code references into precise file/range/symbol targets and stable target handles. Use when a symbol, file, or code reference is ambiguous and needs precise resolution. Returns targetId and spanId handles that can be passed to code_graph, code_impact, and code_refactor_plan. Supports anchored (file + line + character), file-only, and query/symbol inputs. Anchored coordinates resolve a real symbol target from provider-backed evidence: an exact identifier coordinate resolves to a named target; a declaration-header coordinate (e.g. an `export` keyword) snaps to the symbol name anchor only when unambiguous. Whitespace/comment/non-symbol coordinates fail honestly and recommend code_inspect. Does not fall back to text search for symbol resolution; ambiguous results return ranked candidates with target IDs for every shown item. Output is truncated to 2000 lines / 50KB.",
    promptSnippet: "code_resolve — resolve references into precise targets and target handles",
    basePromptGuidelines: [
      "Use code_resolve when a symbol, file, or code reference is ambiguous and needs precise resolution.",
      "Prefer code_resolve as the entry point before code_orientation, code_graph, code_impact, or code_refactor_plan — its targetId replaces fragile file/line/character coordinates.",
      "When code_resolve returns ambiguous results with ranked candidates, pick one and use file + line + character for follow-up resolution.",
    ],
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
    description:
      "Inspect one precise point in a file and return factual syntax, symbol, hover, definition, diagnostics, and code-action information. Use when you need to understand exactly what is at a position without choosing between provider-specific substrate tools. When some providers are unavailable, returns best-effort sections with explicit unavailable notes instead of heuristic guesses. Code action titles are advisory only — there is no tool to execute them yet. Output is truncated to 2000 lines / 50KB.",
    promptSnippet: "code_inspect — factual point inspection",
    basePromptGuidelines: [
      "Use code_inspect for factual point inspection at one precise file position.",
      "Provide `file`, `line`, and `character` — code_inspect is intentionally point-based.",
      "Prefer code_inspect over code_orientation for point-level facts when no symbol target can be resolved.",
    ],
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
    description:
      "Primary code-orientation tool for understanding a project, discovered module, directory, file, or symbol before choosing surgical follow-up tools. Use `focus` for a workspace-relative path or discovered module name; omit `focus` for project orientation. Use `focus` + `line` + `character` for symbol orientation, or pass `targetId` from `code_resolve`; `targetId` takes precedence over focus/coordinates and stale target IDs do not fall back. Symbol orientation returns definitions, JSDoc/TSDoc docs, local diagnostics near the target, and Read Next guidance; relation evidence belongs in code_graph, impact evidence in code_impact, and health/status in code_health. Not a point-inspection tool — use code_inspect for exact position facts. `maxResults` caps each rendered list and defaults to 10. Output is truncated to 2000 lines / 50KB.",
    promptSnippet: "code_orientation — project/module/file/symbol orientation",
    basePromptGuidelines: [
      "Use `code_orientation({ focus })` for first-pass project/package/directory/file orientation before `bash`/`read`.",
      "Use code_resolve first for bare symbol names, then pass the resulting targetId to code_orientation.",
      "Use code_graph/code_impact/code_health for relations, impact, or full health instead of asking code_orientation for those sections.",
    ],
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
    description:
      'Unified relation-graph tool — replaces code_references, code_calls, and code_implementations. Resolves a target once and dispatches to the appropriate analysis service per requested relation. Defaults to ["references"] when `relations` is omitted. Each relation is best-effort: unavailable substrates skip with a note rather than failing the whole call. Each relation annotates its evidence source. The tests relation displays discovery provenance (semantic+conventions or conventions-only) separately from any extracted test labels. `callees` is structural/direct-scope evidence: it reports call expressions by source shape, not symbol identity, and excludes calls inside nested function/method/callback scopes — use `references` on a resolved target for identity-aware incoming callers. Pass `calleeDepth: "deep"` to include callees from nested scopes. `imports` and `exports` use file-level tree-sitter analysis; `tests` discovers companion test files and labels. Targeted graph results include Read Next guidance for source ranges worth inspecting via `read`. `scope` (not `path`) narrows by workspace-relative directory/package. Use code_resolve first to get a targetId, then pass it to code_graph. Output is truncated to 2000 lines / 50KB.',
    promptSnippet: "code_graph — semantic and structural relation graph",
    basePromptGuidelines: [
      "Use code_graph to find references, direct structural calls, and implementations for a target.",
      'Default `relations` is ["references"]; use `relations: ["callees"]` or `["implements"]` for those, or `relations: ["all"]` to expand to every relation family in one call.',
      "After code_graph, follow up with code_orientation on individual results for type or definition context.",
      'Pass `calleeDepth: "deep"` to include callees from nested function/method/callback scopes (default `"direct"` excludes them).',
      'Suggested relations by target kind: For functions/methods: `["references", "callees", "tests"]` — For interfaces/types/classes/enums: `["references", "implements"]` — For files/modules: `["imports", "exports"]` — For tests: `["tests"]`.',
    ],
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
    description:
      "Estimate blast radius and downstream impact for a target or user-supplied change set before making edits. `changeSetFiles` are explicit workspace-relative files to analyze as in scope for a proposed/current change; they are not inferred from git and carry no line-level diff evidence. Uses semantic evidence for target-based impact and merges semantic references for symbols defined in change-set files when available. Includes Read Next guidance for source ranges worth inspecting via `read` before editing. Does not fall back to heuristic text search. Use a resolved target for precise semantic reference-based impact. Output is truncated to 2000 lines / 50KB.",
    promptSnippet: "code_impact — blast radius and impact",
    basePromptGuidelines: [
      "Use code_impact before edits to estimate blast radius and follow-up checks.",
      "Use code_graph instead of code_impact when you only need a plain reference list without impact analysis.",
    ],
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
    description:
      'Unified ranked code search with strict mode dispatch: default/`mode: "text"` is literal ripgrep, `mode: "regex"` is ripgrep regex, `mode: "semantic"` is LSP workspace-symbol search, and `mode: "ast"` is tree-sitter structured search. `mode: "ast"` requires `kind` and currently supports `definition`, `import`, `export`, `call`, `type`, `interface`, `class`, `method`, `enum`, and `test`. `mode: "text"`, `mode: "regex"`, and `mode: "semantic"` do not accept `kind`. `code_find` with `mode: "semantic"` does not silently fall back to text search, and unsupported mode/kind combinations fail. AST `call` mode matches call-site identifiers by name, not by symbol identity; use `code_graph` references for identity-aware callers of a resolved target. Output is truncated to 2000 lines / 50KB.',
    promptSnippet: "code_find — unified ranked code search",
    basePromptGuidelines: [
      "Use code_find as the sole code search tool for literal text, regex, semantic workspace-symbol, or AST structured search.",
      'code_find with `mode: "ast"` requires `kind` and supports `definition`, `import`, `export`, `call`, `type`, `interface`, `class`, `method`, `enum`, and `test`.',
      'code_find with `mode: "text"`, `mode: "regex"`, or `mode: "semantic"` does not accept `kind`.',
      'code_find with `mode: "semantic"` does not fall back to text search and fails when semantic capability is unavailable.',
      'AST `call` mode matches call-site identifiers by name only; use `code_graph` with `relations: ["references"]` on a resolved target for symbol-identity-aware callers.',
    ],
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
    description:
      'Pure planner: previews a precise semantic refactor plan without mutating files and returns a planId for later use with code_refactor_apply. Supports rename_symbol plus extract_function/extract_variable when the active LSP can return precise edits. Legacy `operation: "rename"` is accepted as a compatibility alias. This tool never mutates files. Output is truncated to 2000 lines / 50KB.',
    promptSnippet: "code_refactor_plan — preview a precise workflow refactor plan",
    basePromptGuidelines: [
      'Use `operation: "rename_symbol"` with code_refactor_plan for symbol renames. Legacy `operation: "rename"` is accepted as a compatibility alias.',
      'Use `operation: "extract_function"` or `"extract_variable"` with a 1-based `range` and `newName` when the LSP advertises precise extract code actions.',
      "code_refactor_plan is a pure planner — it returns a planId. Use code_refactor_apply with that planId to execute.",
    ],
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
    description:
      "Sole mutator in the refactor workflow: applies a previously stored plan by planId. Revalidates the plan and checks file fingerprints, mutating files only when the plan is still fresh. Output is truncated to 2000 lines / 50KB.",
    promptSnippet: "code_refactor_apply — apply a stored refactor plan",
    basePromptGuidelines: [
      "Use code_refactor_apply to execute a plan generated by code_refactor_plan.",
      "Use code_refactor_plan first to obtain a planId, then code_refactor_apply to execute it.",
    ],
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
    description:
      "Summarize diagnostics, language server status, dirty workspace signals, coverage, and unused-code findings. Pass refresh: true to recover stale diagnostics before checking. Use scope to narrow to a specific file or package. Use include to request specific sections: diagnostics, servers, dirty, coverage, unused. Defaults to summary level (counts); use level: detailed for per-file listings. Output is truncated to 2000 lines / 50KB.",
    promptSnippet:
      "code_health — diagnostics, server status, coverage, unused-code, and workspace health",
    basePromptGuidelines: [
      "Use code_health to check for diagnostics, language server status, dirty workspace state, coverage, or unused-code signals.",
      "Pass `refresh: true` to code_health to recover stale diagnostics before checking.",
    ],
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
