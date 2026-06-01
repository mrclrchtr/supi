import { StringEnum } from "@earendil-works/pi-ai";
import { type TSchema, Type } from "typebox";
import type { PublicCodeIntelligenceToolName } from "../intent/types.ts";
import type { CodeIntelResult } from "../types.ts";
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
  description: "Structured kind: definition | export | import",
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
      StringEnum(["symbol", "function", "class", "interface", "type", "file", "export"], {
        description: "Preferred target kind when disambiguating the query.",
      }),
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
  run: (params: unknown, ctx: { cwd: string }) => Promise<CodeIntelResult> | CodeIntelResult;
}

// Stubs removed — real executors from execute-refactor-plan.ts and execute-refactor-apply.ts are used below

export const CODE_INTELLIGENCE_TOOL_SPECS = [
  {
    name: "code_resolve",
    label: "Code Resolve",
    description:
      "Resolve human or code references into precise file/range/symbol targets and stable target handles. Use when a symbol, file, or code reference is ambiguous and needs precise resolution. Returns targetId and spanId handles that can be passed to code_graph, code_impact, and code_refactor. Supports anchored (file + line + character), file-only, and query/symbol inputs. Does not fall back to text search for symbol resolution; ambiguous results return ranked candidates with target IDs for every shown item.",
    promptSnippet: "code_resolve — resolve references into precise targets and target handles",
    basePromptGuidelines: [
      "Use code_resolve when a symbol, file, or code reference is ambiguous and needs precise resolution.",
      "Prefer code_resolve as the entry point before other code_* tools so you can pass targetId instead of repeating fragile file/line/character coordinates.",
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
      "Inspect one precise point in a file and return factual syntax, symbol, hover, definition, diagnostics, and code-action information. Use when you need to understand exactly what is at a position without choosing between provider-specific substrate tools.",
    promptSnippet: "code_inspect — factual point inspection",
    basePromptGuidelines: [
      "Use code_inspect for factual point inspection at one precise file position.",
      "Provide `file`, `line`, and `character` — code_inspect is intentionally point-based in this phase.",
      "Use code_inspect when you want syntax node, enclosing symbol, hover/type info, definitions, nearby diagnostics, and available code-action titles gathered together.",
      "When some providers are unavailable, code_inspect returns best-effort sections and explicit unavailable notes instead of heuristic guesses.",
    ],
    parameters: CodeInspectParameters,
    run: (params, ctx) =>
      executeInspectTool(params as Parameters<typeof executeInspectTool>[0], ctx),
  },
  {
    name: "code_context",
    label: "Code Context",
    description:
      "Task-focused context bundle for a change, question, or resolved target. Use when you want prioritized definitions, relationships, diagnostics, docs, and tests gathered into one coding-oriented context result. When called without a `task`, returns a neutral orientation brief — use it as the primary entry point for project, package, directory, file, or symbol overviews.",
    promptSnippet: "code_context — task-focused coding context bundle",
    basePromptGuidelines: [
      "Use code_context for both task-focused coding context and neutral orientation overviews.",
      "Omit `task` in code_context to get a neutral project/package/file orientation brief.",
      "Prefer `targetId` from `code_resolve` in code_context when you already resolved the symbol or anchor you care about.",
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
      'Unified relation-graph tool — replaces code_references, code_calls, and code_implementations. Resolves a target once and dispatches to the appropriate analysis service per requested relation. Defaults to ["references"] when `relations` is omitted. Each relation is best-effort: unavailable substrates skip with a note rather than failing the whole call. Use code_resolve first to get a targetId, then pass it to code_graph.',
    promptSnippet: "code_graph — semantic and structural relation graph",
    basePromptGuidelines: [
      "Use code_graph to find references, outgoing calls, and implementations for a target.",
      "Prefer `targetId` from `code_resolve` over raw file/line/character coordinates when using code_graph.",
      'In code_graph, default `relations` is ["references"] — use `relations: ["callees"]` for outgoing calls or `relations: ["implements"]` for implementations.',
      'Use `relations: ["references", "callees"]` in code_graph to query multiple relation families in one call.',
      'In code_graph, `imports`, `exports`, `tests` relations return "not yet implemented" gracefully.',
      "In code_graph, `direction`, `depth`, `maxNodes` are accepted but reserved for future use.",
      "After code_graph, follow up with code_context on individual results for type or definition context.",
    ],
    parameters: CodeGraphParameters,
    run: (params, ctx) => executeGraphTool(params as Parameters<typeof executeGraphTool>[0], ctx),
  },
  {
    name: "code_impact",
    label: "Code Impact",
    description:
      "Estimate blast radius and downstream impact for a target before making edits. This is the preferred workflow-oriented impact tool. Uses semantic evidence for impact assessment and does not fall back to heuristic text search.",
    promptSnippet: "code_impact — blast radius and impact",
    basePromptGuidelines: [
      "Use code_impact before edits to estimate blast radius and follow-up checks.",
      "Prefer `targetId` from `code_resolve` in code_impact when you already resolved the target you want to analyze.",
      "Use code_graph instead of code_impact when you only need a plain reference list without impact analysis.",
    ],
    parameters: CodeImpactParameters,
    run: (params, ctx) => executeImpactTool(params as Parameters<typeof executeImpactTool>[0], ctx),
  },
  {
    name: "code_find",
    label: "Code Find",
    description:
      "Unified ranked code search with mode dispatch: text (literal ripgrep), regex (ripgrep regex), ast (tree-sitter structured), semantic (LSP workspace symbols). Defaults to text mode. Supports optional kind filtering for result ranking.",
    promptSnippet: "code_find — unified ranked code search",
    basePromptGuidelines: [
      "Use code_find for text, regex, AST-level, or semantic workspace symbol search.",
      "code_find defaults to text mode (literal ripgrep). Use code_find with mode: 'regex' for regex, mode: 'ast' with kind for structured search, mode: 'semantic' for LSP workspace symbols.",
      "Use kind with code_find for advisory filtering or ranking. In text/regex modes kind is advisory-only (no filtering applied). In ast/semantic modes, supported kinds (definition, import, export) are applied directly; call, type, test return not-yet-implemented.",
      "code_find is the sole code search tool — use code_find for all text, regex, AST, and semantic searches.",
    ],
    parameters: CodeFindParameters,
    run: (params, ctx) => executeFindTool(params as Parameters<typeof executeFindTool>[0], ctx),
  },
  {
    name: "code_refactor",
    label: "Code Refactor",
    description:
      'Preferred workflow refactor surface. Previews an operation-aware semantic refactor plan without mutating files and returns a plan ID for later use with code_apply. In this phase it wraps the existing plan store/executor and stays preview-only. Supports rename_symbol, update_imports, and delete_dead_code when the semantic provider can produce precise edits. Legacy `operation: "rename"` is accepted as a compatibility alias for `rename_symbol`.',
    promptSnippet: "code_refactor — preview a precise workflow refactor",
    basePromptGuidelines: [
      "Use code_refactor as the preferred workflow refactor surface.",
      'Use `operation: "rename_symbol"` with code_refactor for symbol renames. Legacy `operation: "rename"` is accepted as a compatibility alias.',
      'Use `operation: "update_imports"` or `operation: "delete_dead_code"` with code_refactor only when the semantic provider can return precise edits.',
      "code_refactor is preview-only in this phase — it returns a plan ID. Use `code_apply` with that planId to execute.",
      "In code_refactor, `preview: false` is not yet supported; retry with `preview: true` or omit `preview`.",
    ],
    parameters: CodeRefactorParameters,
    run: (params, ctx) =>
      executeRefactorTool(params as Parameters<typeof executeRefactorTool>[0], ctx),
  },
  {
    name: "code_apply",
    label: "Code Apply",
    description:
      'Preferred workflow plan-application surface. Applies a previously stored plan by plan ID with fingerprint checks and safety validation. In this phase, `mode: "apply"` is supported; format/verify modes return explicit unavailable results.',
    promptSnippet: "code_apply — apply a stored workflow plan",
    basePromptGuidelines: [
      "Use code_apply to execute a plan generated by code_refactor.",
      'In code_apply, use `mode: "apply"` or omit `mode` in this phase.',
      "In code_apply, `apply-and-format` and `apply-and-verify` are not yet implemented and return explicit unavailable results.",
    ],
    parameters: CodeApplyParameters,
    run: (params, ctx) => executeApplyTool(params as Parameters<typeof executeApplyTool>[0], ctx),
  },
  {
    name: "code_health",
    label: "Code Health",
    description:
      "Summarize diagnostics, language server status, dirty workspace signals, coverage, and unused-code findings. Pass refresh: true to recover stale diagnostics before checking. Use scope to narrow to a specific file or package. Use include to request specific sections: diagnostics, servers, dirty, coverage, unused. Defaults to summary level (counts); use level: detailed for per-file listings.",
    promptSnippet:
      "code_health — diagnostics, server status, coverage, unused-code, and workspace health",
    basePromptGuidelines: [
      "Use code_health to check for diagnostics, language server status, dirty workspace state, coverage, or unused-code signals.",
      "Pass `refresh: true` to code_health to recover stale diagnostics before checking.",
      "Use `scope` with code_health to narrow diagnostics to a specific file or package.",
      "Use `include` with code_health to request specific sections: diagnostics, servers, dirty, coverage, unused.",
      'Use `include: ["coverage"]` or `include: ["unused"]` with code_health to check for low-coverage files or unused code.',
      'Use `level: "detailed"` with code_health for per-file diagnostic listings.',
    ],
    parameters: CodeHealthParameters,
    run: (params, ctx) => executeHealthTool(params as Parameters<typeof executeHealthTool>[0], ctx),
  },
] as const satisfies readonly CodeIntelligenceToolDefinitionSpec[];
