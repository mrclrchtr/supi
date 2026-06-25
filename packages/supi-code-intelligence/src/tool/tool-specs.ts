import { StringEnum } from "@earendil-works/pi-ai";
import { type TSchema, Type } from "typebox";
import type { PublicCodeIntelligenceToolName } from "../intent/types.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../types.ts";
import {
  CodeApplyParameters,
  CodeContextParameters,
  CodeFindParameters,
  CodeGraphParameters,
  CodeHealthParameters,
  CodeImpactParameters,
  CodeInspectParameters,
  CodeRefactorParameters,
} from "../workflow/schemas.ts";
import { executeApplyTool } from "./execute-apply.ts";
import { executeContextTool } from "./execute-context.ts";
import { executeFindTool } from "./execute-find.ts";
import { executeGraphTool } from "./execute-graph.ts";
import { executeHealthTool } from "./execute-health.ts";
import { executeImpactTool } from "./execute-impact.ts";
import { executeInspectTool } from "./execute-inspect.ts";
import { executeRefactorTool } from "./execute-refactor.ts";
import { executeResolveTool } from "./execute-resolve.ts";

const _PathParam = Type.String({ description: "Scope path" });
const FileParam = Type.String({ description: "Target file" });
const LineParam = Type.Number({ description: "1-based line", minimum: 1 });
const CharacterParam = Type.Number({ description: "1-based UTF-16 column", minimum: 1 });
const _SymbolParam = Type.String({ description: "Symbol name" });
const _PatternParam = Type.String({ description: "Search pattern" });
const _RegexParam = Type.Boolean({ description: "Regex search" });
const MaxResultsParam = Type.Number({ description: "Max results" });
const _ContextLinesParam = Type.Number({ description: "Context lines" });
const _SummaryParam = Type.Boolean({ description: "Summarize by directory" });
const _StructuredPatternKindParam = Type.String({
  description: "Structured kind: definition | export | import | call",
});
const _TargetIdParam = Type.String({
  description:
    "Resolved target handle from `code_resolve`. Takes precedence over file/line/character/symbol.",
});

const CodeResolveParameters = Type.Object(
  {
    query: Type.Optional(Type.String({ description: "Human or code reference to resolve." })),
    scope: Type.Optional(
      Type.String({
        description: "Workspace-relative path, package, or directory scope for the resolve query.",
      }),
    ),
    kind: Type.Optional(
      StringEnum(
        [
          "symbol",
          "function",
          "class",
          "interface",
          "type",
          "file",
          "export",
          "variable",
          "method",
          "const",
          "enum",
        ],
        {
          description: "Preferred target kind when disambiguating the query.",
        },
      ),
    ),
    file: Type.Optional(FileParam),
    line: Type.Optional(LineParam),
    character: Type.Optional(CharacterParam),
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

export interface CodeIntelligenceToolDefinitionSpec {
  name: PublicCodeIntelligenceToolName;
  label: string;
  description: string;
  promptSnippet: string;
  basePromptGuidelines: string[];
  parameters: TSchema;
  /** Per-spec line-limit override for the adapter's head truncation. Defaults to pi's `DEFAULT_MAX_LINES`. */
  maxLines?: number;
  /** Per-spec byte-limit override for the adapter's head truncation. Defaults to pi's `DEFAULT_MAX_BYTES`. */
  maxBytes?: number;
  /**
   * When true, oversized truncated output spills to a temp file whose path is
   * appended to the truncation notice (full output preserved for `read`).
   * Enabled for heavy-output tools (code_find, code_graph, code_impact).
   */
  spillToTempFile?: boolean;
  run: (params: unknown, ctx: CodeIntelToolExecCtx) => Promise<CodeIntelResult> | CodeIntelResult;
}

// Stubs removed — real executors from execute-refactor-plan.ts and execute-refactor-apply.ts are used below

export const CODE_INTELLIGENCE_TOOL_SPECS = [
  {
    name: "code_resolve",
    label: "Code Resolve",
    description:
      "Resolve human or code references into precise file/range/symbol targets and stable target handles. Use when a symbol, file, or code reference is ambiguous and needs precise resolution. Returns targetId and spanId handles that can be passed to code_graph, code_impact, and code_refactor_plan. Supports anchored (file + line + character), file-only, and query/symbol inputs. Anchored coordinates resolve a real symbol target from provider-backed evidence: an exact identifier coordinate resolves to a named target; a declaration-header coordinate (e.g. an `export` keyword) snaps to the symbol name anchor only when unambiguous. Whitespace/comment/non-symbol coordinates fail honestly and recommend code_inspect. Does not fall back to text search for symbol resolution; ambiguous results return ranked candidates with target IDs for every shown item. Output is truncated to 2000 lines / 50KB.",
    promptSnippet: "code_resolve — resolve references into precise targets and target handles",
    basePromptGuidelines: [
      "Use code_resolve when a symbol, file, or code reference is ambiguous and needs precise resolution.",
      "Prefer code_resolve as the entry point before code_context, code_graph, code_impact, or code_refactor_plan — its targetId replaces fragile file/line/character coordinates.",
      "When code_resolve returns ambiguous results with ranked candidates, pick one and use file + line + character for follow-up resolution.",
    ],
    parameters: CodeResolveParameters,
    run: (params, ctx) =>
      executeResolveTool(params as Parameters<typeof executeResolveTool>[0], ctx),
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
      "Prefer code_inspect over code_context for point-level facts when no symbol target can be resolved.",
    ],
    parameters: CodeInspectParameters,
    run: (params, ctx) =>
      executeInspectTool(params as Parameters<typeof executeInspectTool>[0], ctx),
  },
  {
    name: "code_context",
    label: "Code Context",
    description:
      "Task-focused context bundle for a change, question, or resolved target. Use when you want prioritized definitions, relationships, diagnostics, docs, and tests gathered into one coding-oriented context result. Accepts either `targetId` (from `code_resolve`) or `file` + `line` + `character` for precise target context; `targetId` takes precedence over coordinates. Coordinate mode resolves a real symbol target through the same provider-backed path as `code_resolve` and exposes a reusable `targetId`. When called without a `task`, returns a neutral orientation brief — use it as the primary entry point for project, package, directory, file, or symbol overviews. Not a point-inspection tool — use `code_inspect` for point-level facts when no symbol target can be resolved. `scope` is a selection/orientation boundary, not a downstream evidence filter: when a precise target is supplied with `scope`, the target wins and `scope` is ignored with a visible note. Output is truncated to 2000 lines / 50KB.",
    promptSnippet: "code_context — task-focused coding context bundle",
    basePromptGuidelines: [
      "Use code_context for both task-focused coding context and neutral orientation overviews.",
      "Omit `task` in code_context to get a neutral project/package/file orientation brief.",
      "Use `include` in code_context to request only the sections you need.",
    ],
    parameters: CodeContextParameters,
    run: (params, ctx) =>
      executeContextTool(params as Parameters<typeof executeContextTool>[0], ctx),
  },
  {
    name: "code_graph",
    label: "Code Graph",
    description:
      'Unified relation-graph tool — replaces code_references, code_calls, and code_implementations. Resolves a target once and dispatches to the appropriate analysis service per requested relation. Defaults to ["references"] when `relations` is omitted. Each relation is best-effort: unavailable substrates skip with a note rather than failing the whole call. Each relation annotates its evidence source. The tests relation displays discovery provenance (semantic+conventions or conventions-only) separately from any extracted test labels. `callees` is structural/direct-scope evidence: it reports call expressions by source shape, not symbol identity, and excludes calls inside nested function/method/callback scopes — use `references` on a resolved target for identity-aware incoming callers. Pass `calleeDepth: "deep"` to include callees from nested scopes. `imports` and `exports` use file-level tree-sitter analysis; `tests` discovers companion test files and labels. `scope` (not `path`) narrows by workspace-relative directory/package. Use code_resolve first to get a targetId, then pass it to code_graph. Output is truncated to 2000 lines / 50KB.',
    promptSnippet: "code_graph — semantic and structural relation graph",
    basePromptGuidelines: [
      "Use code_graph to find references, direct structural calls, and implementations for a target.",
      'Default `relations` is ["references"]; use `relations: ["callees"]` or `["implements"]` for those, or `relations: ["all"]` to expand to every relation family in one call.',
      "After code_graph, follow up with code_context on individual results for type or definition context.",
      'Pass `calleeDepth: "deep"` to include callees from nested function/method/callback scopes (default `"direct"` excludes them).',
    ],
    parameters: CodeGraphParameters,
    spillToTempFile: true,
    run: (params, ctx) => executeGraphTool(params as Parameters<typeof executeGraphTool>[0], ctx),
  },
  {
    name: "code_impact",
    label: "Code Impact",
    description:
      "Estimate blast radius and downstream impact for a target before making edits. This is the preferred workflow-oriented impact tool. Uses semantic evidence for target-based impact and merges semantic references into changedFiles analysis when available. Does not fall back to heuristic text search. Use a resolved target for precise semantic reference-based impact. Output is truncated to 2000 lines / 50KB.",
    promptSnippet: "code_impact — blast radius and impact",
    basePromptGuidelines: [
      "Use code_impact before edits to estimate blast radius and follow-up checks.",
      "Use code_graph instead of code_impact when you only need a plain reference list without impact analysis.",
    ],
    parameters: CodeImpactParameters,
    spillToTempFile: true,
    run: (params, ctx) => executeImpactTool(params as Parameters<typeof executeImpactTool>[0], ctx),
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
    run: (params, ctx) =>
      executeRefactorTool(params as Parameters<typeof executeRefactorTool>[0], ctx),
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
    run: (params, ctx) => executeApplyTool(params as Parameters<typeof executeApplyTool>[0], ctx),
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
  },
] as const satisfies readonly CodeIntelligenceToolDefinitionSpec[];
