import { StringEnum } from "@earendil-works/pi-ai";
import { type TSchema, Type } from "typebox";
import type { CodeIntelligenceToolName } from "../intent/types.ts";
import type { CodeIntelResult } from "../types.ts";
import { CodeHealthParameters } from "../workflow/schemas.ts";
import { executeAffectedTool } from "./execute-affected.ts";
import { executeBriefTool } from "./execute-brief.ts";
import { executeCallsTool } from "./execute-calls.ts";
import { executeHealthTool } from "./execute-health.ts";
import { executeImplementationsTool } from "./execute-implementations.ts";
import { executePatternTool } from "./execute-pattern.ts";
import { executeRefactorApplyTool } from "./execute-refactor-apply.ts";
import { executeRefactorPlanTool } from "./execute-refactor-plan.ts";
import { executeReferencesTool } from "./execute-references.ts";
import { executeResolveTool } from "./execute-resolve.ts";

const PathParam = Type.String({ description: "Scope path" });
const FileParam = Type.String({ description: "Target file" });
const LineParam = Type.Number({ description: "1-based line", minimum: 1 });
const CharacterParam = Type.Number({ description: "1-based UTF-16 column", minimum: 1 });
const SymbolParam = Type.String({ description: "Symbol name" });
const PatternParam = Type.String({ description: "Search pattern" });
const RegexParam = Type.Boolean({ description: "Regex search" });
const ExportedOnlyParam = Type.Boolean({ description: "Exported symbols only" });
const MaxResultsParam = Type.Number({ description: "Max results" });
const ContextLinesParam = Type.Number({ description: "Context lines" });
const SummaryParam = Type.Boolean({ description: "Summarize by directory" });
const StructuredPatternKindParam = Type.String({
  description: "Structured kind: definition | export | import",
});
const NewNameParam = Type.String({ description: "New name for rename operation" });
const OperationParam = Type.String({ description: "Refactor operation: rename" });
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

const CodeReferencesParameters = Type.Object(
  {
    targetId: Type.Optional(TargetIdParam),
    file: Type.Optional(FileParam),
    line: Type.Optional(LineParam),
    character: Type.Optional(CharacterParam),
    symbol: Type.Optional(SymbolParam),
    path: Type.Optional(PathParam),
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

const CodeCallsParameters = Type.Object(
  {
    targetId: Type.Optional(TargetIdParam),
    file: Type.Optional(FileParam),
    line: Type.Optional(LineParam),
    character: Type.Optional(CharacterParam),
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

const CodeImplementationsParameters = Type.Object(
  {
    targetId: Type.Optional(TargetIdParam),
    file: Type.Optional(FileParam),
    line: Type.Optional(LineParam),
    character: Type.Optional(CharacterParam),
    symbol: Type.Optional(SymbolParam),
    path: Type.Optional(PathParam),
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

const CodePatternParameters = Type.Object(
  {
    path: Type.Optional(PathParam),
    pattern: PatternParam,
    regex: Type.Optional(RegexParam),
    kind: Type.Optional(StructuredPatternKindParam),
    maxResults: Type.Optional(MaxResultsParam),
    contextLines: Type.Optional(ContextLinesParam),
    summary: Type.Optional(SummaryParam),
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
    newName: NewNameParam,
  },
  { additionalProperties: false },
);

const CodeRefactorApplyParameters = Type.Object(
  {
    planId: PlanIdParam,
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
      "Resolve human or code references into precise file/range/symbol targets and stable target handles. Use when a symbol, file, or code reference is ambiguous and needs precise resolution. Returns targetId and spanId handles that can be passed to code_references, code_calls, code_affected, and code_refactor_plan. Supports anchored (file + line + character), file-only, and query/symbol inputs. Does not fall back to text search for symbol resolution; ambiguous results return ranked candidates with target IDs for every shown item.",
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
      "Prioritized code orientation for a project, package, directory, file, or symbol. Use before deeper drill-down when you need a start-here recommendation. Returns a structured overview: for files, shows outline, imports, exports, and diagnostics; for packages, shows module graph and entry points. After code_brief, use code_references for usages or code_calls for outgoing calls.",
    promptSnippet: "code_brief — prioritized code orientation",
    basePromptGuidelines: [
      "Use code_brief for prioritized orientation on a project, package, file, or symbol.",
      "Use code_brief before deeper drill-down when you need a start-here recommendation.",
      "After code_brief, drill deeper with code_references (usages) or code_calls (outgoing calls).",
    ],
    parameters: CodeBriefParameters,
    run: (params, ctx) => executeBriefTool(params as Parameters<typeof executeBriefTool>[0], ctx),
  },
  {
    name: "code_references",
    label: "Code References",
    description:
      "Find all semantic usages/references of a symbol. Returns references grouped by file. For callers specifically, use code_calls instead. Requires an active language server; does not fall back to text search. Follow up with code_brief on individual reference sites for type/definition context.",
    promptSnippet: "code_references — semantic references/usages",
    basePromptGuidelines: [
      "Use code_references to find all semantic usages/references of a symbol.",
      "code_references returns usages grouped by file, not caller sites — use code_calls for outgoing call analysis.",
      "After code_references, follow up with code_brief on individual reference sites for type or definition context.",
    ],
    parameters: CodeReferencesParameters,
    run: (params, ctx) =>
      executeReferencesTool(params as Parameters<typeof executeReferencesTool>[0], ctx),
  },
  {
    name: "code_calls",
    label: "Code Calls",
    description:
      "List outgoing structural calls from the enclosing function or method at a file position. Supports outgoing calls only — does not report incoming callers. Use code_references for incoming usage analysis.",
    promptSnippet: "code_calls — outgoing calls from a function/method",
    basePromptGuidelines: [
      "Use code_calls to find outgoing structural calls from an enclosing function or method.",
      "code_calls reports outgoing calls only — for incoming usages, use code_references.",
    ],
    parameters: CodeCallsParameters,
    run: (params, ctx) => executeCallsTool(params as Parameters<typeof executeCallsTool>[0], ctx),
  },
  {
    name: "code_implementations",
    label: "Code Implementations",
    description:
      "Find semantic implementations of an interface, class, or abstract method. Requires an active language server. Does not fall back to text search.",
    promptSnippet: "code_implementations — semantic implementations",
    basePromptGuidelines: [
      "Use code_implementations to find semantic implementations of an interface, class, or abstract method.",
      "Use code_resolve first to get a targetId, then pass it to code_implementations.",
    ],
    parameters: CodeImplementationsParameters,
    run: (params, ctx) =>
      executeImplementationsTool(params as Parameters<typeof executeImplementationsTool>[0], ctx),
  },
  {
    name: "code_affected",
    label: "Code Affected",
    description:
      "Estimate blast radius and downstream impact for a target before making edits. Uses semantic evidence for impact assessment. Does not fall back to heuristic text search. Use code_references when you only need a plain reference list without impact analysis.",
    promptSnippet: "code_affected — blast radius and impact",
    basePromptGuidelines: [
      "Use code_affected before edits to estimate blast radius and follow-up checks.",
      "Use code_references instead of code_affected when you only need a plain reference list without impact analysis.",
    ],
    parameters: CodeAffectedParameters,
    run: (params, ctx) =>
      executeAffectedTool(params as Parameters<typeof executeAffectedTool>[0], ctx),
  },
  {
    name: "code_pattern",
    label: "Code Pattern",
    description:
      "Run explicit search with literal, regex, or structured matching in a bounded path. This is the only code_* tool that uses heuristic/text search. For structured or semantic precision, prefer code_resolve or code_brief.",
    promptSnippet: "code_pattern — explicit code search",
    basePromptGuidelines: [
      "Use code_pattern for literal, regex, or structured search in a bounded path.",
      "For structured or semantic precision, prefer code_resolve or code_brief over code_pattern.",
    ],
    parameters: CodePatternParameters,
    run: (params, ctx) =>
      executePatternTool(params as Parameters<typeof executePatternTool>[0], ctx),
  },
  {
    name: "code_refactor_plan",
    label: "Code Refactor Plan",
    description:
      "Preview a semantic rename without mutating files. Returns a plan ID for later use with code_refactor_apply. Requires a language server with rename support. Accepts targetId from code_resolve in place of file/line/character.",
    promptSnippet: "code_refactor_plan — preview a rename plan",
    basePromptGuidelines: [
      "Use code_refactor_plan to preview a rename before applying it.",
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
