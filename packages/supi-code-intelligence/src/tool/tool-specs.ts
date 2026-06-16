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
      StringEnum(
        [
          "symbol",
          "function",
          "class",
          "interface",
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
      "Prefer code_resolve as the entry point before code_context, code_graph, code_impact, or code_refactor — its targetId replaces fragile file/line/character coordinates.",
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
      "Code action titles from code_inspect are advisory only — there is no tool to execute them yet.",
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
      'Unified relation-graph tool — replaces code_references, code_calls, and code_implementations. Resolves a target once and dispatches to the appropriate analysis service per requested relation. Defaults to ["references"] when `relations` is omitted. Each relation is best-effort: unavailable substrates skip with a note rather than failing the whole call. Each relation annotates its evidence source. The tests relation displays discovery provenance (semantic+conventions or conventions-only) separately from any extracted test labels. Use code_resolve first to get a targetId, then pass it to code_graph.',
    promptSnippet: "code_graph — semantic and structural relation graph",
    basePromptGuidelines: [
      "Use code_graph to find references, outgoing calls, and implementations for a target.",
      'In code_graph, default `relations` is ["references"] — use `relations: ["callees"]` for outgoing calls or `relations: ["implements"]` for implementations.',
      'Use `relations: ["references", "callees"]` in code_graph to query multiple relation families in one call.',
      "In code_graph, `imports` and `exports` relations use file-level tree-sitter analysis; `tests` discovers companion test files and test labels. The tests relation displays discovery provenance (`semantic+conventions` or `conventions-only`) separately from placeholder output such as `_(no recognized test blocks)_`.",
      "After code_graph, follow up with code_context on individual results for type or definition context.",
      "code_graph uses `scope` (not `path`) for workspace-relative directory/package filtering.",
    ],
    parameters: CodeGraphParameters,
    run: (params, ctx) => executeGraphTool(params as Parameters<typeof executeGraphTool>[0], ctx),
  },
  {
    name: "code_impact",
    label: "Code Impact",
    description:
      "Estimate blast radius and downstream impact for a target before making edits. This is the preferred workflow-oriented impact tool. Uses semantic evidence for impact assessment and does not fall back to heuristic text search. Supports target-based analysis and changedFiles-based analysis. changedFiles-based analysis uses structural evidence only. Use a resolved target for semantic reference-based impact.",
    promptSnippet: "code_impact — blast radius and impact",
    basePromptGuidelines: [
      "Use code_impact before edits to estimate blast radius and follow-up checks.",
      "Use code_graph instead of code_impact when you only need a plain reference list without impact analysis.",
    ],
    parameters: CodeImpactParameters,
    run: (params, ctx) => executeImpactTool(params as Parameters<typeof executeImpactTool>[0], ctx),
  },
  {
    name: "code_find",
    label: "Code Find",
    description:
      'Unified ranked code search with strict mode dispatch: default/`mode: "text"` is literal ripgrep, `mode: "regex"` is ripgrep regex, `mode: "semantic"` is LSP workspace-symbol search, and `mode: "ast"` is tree-sitter structured search. `mode: "ast"` requires `kind` and currently supports only `definition`, `import`, and `export`. `mode: "text"`, `mode: "regex"`, and `mode: "semantic"` do not accept `kind`. `code_find` with `mode: "semantic"` does not silently fall back to text search, and unsupported mode/kind combinations fail.',
    promptSnippet: "code_find — unified ranked code search",
    basePromptGuidelines: [
      "Use code_find for literal text search, regex search, semantic workspace-symbol search, or AST structured search.",
      'Use code_find with `mode: "text"` or omitted `mode` for literal ripgrep search, and use code_find with `mode: "regex"` for regex search.',
      'code_find with `mode: "ast"` requires `kind` and supports only `definition`, `import`, and `export` in this phase.',
      'code_find with `mode: "text"`, `mode: "regex"`, or `mode: "semantic"` does not accept `kind`.',
      'code_find with `mode: "semantic"` does not fall back to text search and fails when semantic capability is unavailable.',
      "code_find is the sole code search tool — use code_find for all text, regex, AST, and semantic searches.",
    ],
    parameters: CodeFindParameters,
    run: (params, ctx) => executeFindTool(params as Parameters<typeof executeFindTool>[0], ctx),
  },
  {
    name: "code_refactor",
    label: "Code Refactor",
    description:
      'Preferred workflow refactor surface. Previews a semantic rename plan without mutating files and returns a plan ID for later use with code_apply. Supports only rename_symbol in this phase. Legacy `operation: "rename"` is accepted as a compatibility alias.',
    promptSnippet: "code_refactor — preview a precise workflow refactor",
    basePromptGuidelines: [
      'Use `operation: "rename_symbol"` with code_refactor for symbol renames. Legacy `operation: "rename"` is accepted as a compatibility alias.',
      "code_refactor is preview-only — it returns a plan ID. Use `code_apply` with that planId to execute.",
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
      'In code_apply, use `mode: "apply"` or omit `mode` — it is the only supported mode.',
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
    ],
    parameters: CodeHealthParameters,
    run: (params, ctx) => executeHealthTool(params as Parameters<typeof executeHealthTool>[0], ctx),
  },
] as const satisfies readonly CodeIntelligenceToolDefinitionSpec[];
