import { StringEnum } from "@earendil-works/pi-ai";
import { type TSchema, Type } from "typebox";
import type { CodeIntelligenceToolName } from "../intent/types.ts";
import type { CodeIntelResult } from "../types.ts";
import { CodeFindParameters, CodeHealthParameters } from "../workflow/schemas.ts";
import { executeAffectedTool } from "./execute-affected.ts";
import { executeBriefTool } from "./execute-brief.ts";
import { executeFindTool } from "./execute-find.ts";
import { executeGraphTool } from "./execute-graph.ts";
import { executeHealthTool } from "./execute-health.ts";
import { executeRefactorApplyTool } from "./execute-refactor-apply.ts";
import { executeRefactorPlanTool } from "./execute-refactor-plan.ts";
import { executeResolveTool } from "./execute-resolve.ts";

const PathParam = Type.String({ description: "Scope path" });
const FileParam = Type.String({ description: "Target file" });
const LineParam = Type.Number({ description: "1-based line", minimum: 1 });
const CharacterParam = Type.Number({ description: "1-based UTF-16 column", minimum: 1 });
const SymbolParam = Type.String({ description: "Symbol name" });
const _PatternParam = Type.String({ description: "Search pattern" });
const _RegexParam = Type.Boolean({ description: "Regex search" });
const ExportedOnlyParam = Type.Boolean({ description: "Exported symbols only" });
const MaxResultsParam = Type.Number({ description: "Max results" });
const _ContextLinesParam = Type.Number({ description: "Context lines" });
const _SummaryParam = Type.Boolean({ description: "Summarize by directory" });
const _StructuredPatternKindParam = Type.String({
  description: "Structured kind: definition | export | import",
});
const NewNameParam = Type.String({ description: "New symbol or file name for rename operations" });
const DestinationParam = Type.String({ description: "Destination path for move operations" });
const OperationParam = StringEnum(
  ["rename", "rename_symbol", "rename_file", "move_file", "update_imports", "delete_dead_code"],
  {
    description:
      "Refactor operation to preview. `rename` is kept as a legacy alias for `rename_symbol`.",
  },
);
const PlanIdParam = Type.String({ description: "Plan ID from a previous code_refactor_plan call" });
const TargetIdParam = Type.String({
  description:
    "Resolved target handle from `code_resolve`. Takes precedence over file/line/character/symbol.",
});

const CodeBriefParameters = Type.Object(
  {
    targetId: Type.Optional(TargetIdParam),
    path: Type.Optional(PathParam),
    file: Type.Optional(FileParam),
    line: Type.Optional(LineParam),
    character: Type.Optional(CharacterParam),
    symbol: Type.Optional(SymbolParam),
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

const CodeAffectedParameters = Type.Object(
  {
    targetId: Type.Optional(TargetIdParam),
    file: Type.Optional(FileParam),
    line: Type.Optional(LineParam),
    character: Type.Optional(CharacterParam),
    symbol: Type.Optional(SymbolParam),
    exportedOnly: Type.Optional(ExportedOnlyParam),
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

const CodeRefactorPlanParameters = Type.Object(
  {
    targetId: Type.Optional(TargetIdParam),
    operation: OperationParam,
    file: Type.Optional(FileParam),
    line: Type.Optional(LineParam),
    character: Type.Optional(CharacterParam),
    newName: Type.Optional(NewNameParam),
    destination: Type.Optional(DestinationParam),
  },
  { additionalProperties: false },
);

const CodeRefactorApplyParameters = Type.Object(
  {
    planId: PlanIdParam,
  },
  { additionalProperties: false },
);

const CodeGraphExtendedParameters = Type.Object(
  {
    targetId: Type.Optional(TargetIdParam),
    file: Type.Optional(FileParam),
    line: Type.Optional(LineParam),
    character: Type.Optional(CharacterParam),
    symbol: Type.Optional(SymbolParam),
    path: Type.Optional(PathParam),
    relations: Type.Optional(
      Type.Array(
        StringEnum(["references", "callees", "imports", "exports", "implements", "tests"], {
          description: "Relation families to include in the graph.",
        }),
        {
          description: 'Requested relation families. Defaults to ["references"] when omitted.',
          uniqueItems: true,
        },
      ),
    ),
    direction: Type.Optional(
      StringEnum(["in", "out", "both"], {
        description: "Graph traversal direction (future).",
      }),
    ),
    depth: Type.Optional(Type.Number({ description: "Traversal depth (future).", minimum: 1 })),
    maxNodes: Type.Optional(
      Type.Number({ description: "Maximum graph nodes to return (future).", minimum: 1 }),
    ),
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

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
          "command",
          "setting",
        ],
        { description: "Preferred target kind when disambiguating the query." },
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
  name: CodeIntelligenceToolName;
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
      "Resolve human or code references into precise file/range/symbol targets and stable target handles. Use when a symbol, file, or code reference is ambiguous and needs precise resolution. Returns targetId and spanId handles that can be passed to code_graph, code_affected, and code_refactor_plan. Supports anchored (file + line + character), file-only, and query/symbol inputs. Does not fall back to text search for symbol resolution; ambiguous results return ranked candidates with target IDs for every shown item.",
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
    name: "code_brief",
    label: "Code Brief",
    description:
      'Prioritized code orientation for a project, package, directory, file, or symbol. Use before deeper drill-down when you need a start-here recommendation. Returns a structured overview: for files, shows outline, imports, exports, and diagnostics; for packages, shows module graph and entry points. After code_brief, use code_graph for references/usages or code_graph with relations: ["callees"] for outgoing calls.',
    promptSnippet: "code_brief — prioritized code orientation",
    basePromptGuidelines: [
      "Use code_brief for prioritized orientation on a project, package, file, or symbol.",
      "Use code_brief before deeper drill-down when you need a start-here recommendation.",
      'After code_brief, drill deeper with code_graph (usages/references) or code_graph with relations: ["callees"] (outgoing calls).',
    ],
    parameters: CodeBriefParameters,
    run: (params, ctx) => executeBriefTool(params as Parameters<typeof executeBriefTool>[0], ctx),
  },
  {
    name: "code_graph",
    label: "Code Graph",
    description:
      'Unified relation-graph tool — replaces code_references, code_calls, and code_implementations. Resolves a target once and dispatches to the appropriate analysis service per requested relation. Defaults to ["references"] when `relations` is omitted. Each relation is best-effort: unavailable substrates skip with a note rather than failing the whole call. Use code_resolve first to get a targetId, then pass it to code_graph.',
    promptSnippet: "code_graph — semantic and structural relation graph",
    basePromptGuidelines: [
      "Use code_graph to find references, outgoing calls, and implementations for a target.",
      "Prefer `targetId` from `code_resolve` over raw file/line/character coordinates.",
      'Default `relations` is ["references"] — use `relations: ["callees"]` for outgoing calls or `relations: ["implements"]` for implementations.',
      'Use `relations: ["references", "callees"]` to query multiple relation families in one call.',
      '`imports`, `exports`, `tests` relations return "not yet implemented" gracefully.',
      "`direction`, `depth`, `maxNodes` are accepted but reserved for future use.",
      "After code_graph, follow up with code_brief on individual results for type or definition context.",
    ],
    parameters: CodeGraphExtendedParameters,
    run: (params, ctx) => executeGraphTool(params as Parameters<typeof executeGraphTool>[0], ctx),
  },
  {
    name: "code_affected",
    label: "Code Affected",
    description:
      "Estimate blast radius and downstream impact for a target before making edits. Uses semantic evidence for impact assessment. Does not fall back to heuristic text search. Use code_graph when you only need a plain reference list without impact analysis.",
    promptSnippet: "code_affected — blast radius and impact",
    basePromptGuidelines: [
      "Use code_affected before edits to estimate blast radius and follow-up checks.",
      "Use code_graph instead of code_affected when you only need a plain reference list without impact analysis.",
    ],
    parameters: CodeAffectedParameters,
    run: (params, ctx) =>
      executeAffectedTool(params as Parameters<typeof executeAffectedTool>[0], ctx),
  },
  {
    name: "code_find",
    label: "Code Find",
    description:
      "Unified ranked code search with mode dispatch: text (literal ripgrep), regex (ripgrep regex), ast (tree-sitter structured), semantic (LSP workspace symbols). Defaults to text mode. Supports optional kind filtering for result ranking.",
    promptSnippet: "code_find — unified ranked code search",
    basePromptGuidelines: [
      "Use code_find for text, regex, AST-level, or semantic workspace symbol search.",
      "Default mode is text (literal ripgrep). Use mode: 'regex' for regex, mode: 'ast' with kind for structured search, mode: 'semantic' for LSP workspace symbols.",
      "Use kind for advisory filtering or ranking. In text/regex modes kind is advisory-only (no filtering applied). In ast/semantic modes, supported kinds (definition, import, export) are applied directly; call, type, test return not-yet-implemented.",
      "code_find is the sole code search tool — use it for all text, regex, AST, and semantic searches.",
    ],
    parameters: CodeFindParameters,
    run: (params, ctx) => executeFindTool(params as Parameters<typeof executeFindTool>[0], ctx),
  },
  {
    name: "code_refactor_plan",
    label: "Code Refactor Plan",
    description:
      'Preview an operation-aware semantic refactor plan without mutating files. Returns a plan ID for later use with code_refactor_apply. Supports rename_symbol, update_imports, and delete_dead_code when the semantic provider can produce precise edits. Accepts targetId from code_resolve in place of file/line/character. Legacy `operation: "rename"` remains a compatibility alias for rename_symbol.',
    promptSnippet: "code_refactor_plan — preview an operation-aware refactor plan",
    basePromptGuidelines: [
      "Use code_refactor_plan to preview a precise semantic refactor before applying it.",
      'Use `operation: "rename_symbol"` for symbol renames; `operation: "rename"` remains a legacy alias.',
      'Use `operation: "update_imports"` or `operation: "delete_dead_code"` only when the semantic provider can return precise edits.',
      "code_refactor_plan does not mutate files — it returns a plan ID. Use code_refactor_apply with that planId to execute.",
    ],
    parameters: CodeRefactorPlanParameters,
    run: (params, ctx) =>
      executeRefactorPlanTool(params as Parameters<typeof executeRefactorPlanTool>[0], ctx),
  },
  {
    name: "code_refactor_apply",
    label: "Code Refactor Apply",
    description:
      "Apply a previously generated refactor plan by plan ID. Rejects stale, missing, or invalid plans. Applies through safe file mutation with fingerprint checks.",
    promptSnippet: "code_refactor_apply — apply a rename plan",
    basePromptGuidelines: [
      "Use code_refactor_apply to execute a plan generated by code_refactor_plan.",
      "code_refactor_apply requires a valid planId; it rejects stale or missing plans.",
    ],
    parameters: CodeRefactorApplyParameters,
    run: (params, ctx) =>
      executeRefactorApplyTool(params as Parameters<typeof executeRefactorApplyTool>[0], ctx),
  },
  {
    name: "code_health",
    label: "Code Health",
    description:
      "Summarize diagnostics, language server status, and dirty workspace signals. Pass refresh: true to recover stale diagnostics before checking. Use scope to narrow to a specific file or package. Use include to request specific sections: diagnostics, servers, dirty. Defaults to summary level (counts); use level: detailed for per-file listings.",
    promptSnippet: "code_health — diagnostics, server status, and workspace health",
    basePromptGuidelines: [
      "Use code_health to check for diagnostics, language server status, or dirty workspace state.",
      "Pass `refresh: true` to code_health to recover stale diagnostics before checking.",
      "Use `scope` with code_health to narrow diagnostics to a specific file or package.",
      "Use `include` with code_health to request specific sections: diagnostics, servers, dirty.",
      'Use `level: "detailed"` with code_health for per-file diagnostic listings.',
    ],
    parameters: CodeHealthParameters,
    run: (params, ctx) => executeHealthTool(params as Parameters<typeof executeHealthTool>[0], ctx),
  },
] as const satisfies readonly CodeIntelligenceToolDefinitionSpec[];
