import { type TSchema, Type } from "typebox";
import type { CodeIntelligenceToolName } from "../intent/types.ts";
import type { CodeIntelResult } from "../types.ts";
import { executeAffectedTool } from "./execute-affected.ts";
import { executeBriefTool } from "./execute-brief.ts";
import { executeCallsTool } from "./execute-calls.ts";
import { executeImplementationsTool } from "./execute-implementations.ts";
import { executeMapTool } from "./execute-map.ts";
import { executePatternTool } from "./execute-pattern.ts";
import { executeRefactorApplyTool } from "./execute-refactor-apply.ts";
import { executeRefactorPlanTool } from "./execute-refactor-plan.ts";
import { executeReferencesTool } from "./execute-references.ts";

const PathParam = Type.String({ description: "Scope path" });
const FileParam = Type.String({ description: "Target file" });
const LineParam = Type.Number({ description: "1-based line" });
const CharacterParam = Type.Number({ description: "1-based UTF-16 column" });
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

const CodeBriefParameters = Type.Object(
  {
    path: Type.Optional(PathParam),
    file: Type.Optional(FileParam),
    line: Type.Optional(LineParam),
    character: Type.Optional(CharacterParam),
    symbol: Type.Optional(SymbolParam),
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

const CodeMapParameters = Type.Object(
  {
    path: Type.Optional(Type.String({ description: "Project/package/dir path" })),
  },
  { additionalProperties: false },
);

const CodeReferencesParameters = Type.Object(
  {
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
    file: FileParam,
    line: LineParam,
    character: CharacterParam,
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

const CodeImplementationsParameters = Type.Object(
  {
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
    operation: OperationParam,
    file: FileParam,
    line: LineParam,
    character: CharacterParam,
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
    name: "code_brief",
    label: "Code Brief",
    description: "Prioritized brief for a project, package, directory, file, or symbol.",
    promptSnippet: "code_brief — prioritized code orientation",
    basePromptGuidelines: [
      "Use code_brief for prioritized orientation on a project, package, file, or symbol.",
      "Use code_brief before deeper drill-down when you need a start-here recommendation.",
    ],
    parameters: CodeBriefParameters,
    run: (params, ctx) => executeBriefTool(params as Parameters<typeof executeBriefTool>[0], ctx),
  },
  {
    name: "code_map",
    label: "Code Map",
    description: "Factual map of a repo, package, or directory.",
    promptSnippet: "code_map — factual repo or directory map",
    basePromptGuidelines: ["Use code_map for counts, directories, language mix, and landmarks."],
    parameters: CodeMapParameters,
    run: (params, ctx) => executeMapTool(params as Parameters<typeof executeMapTool>[0], ctx),
  },
  {
    name: "code_references",
    label: "Code References",
    description: "Semantic usages of a resolved target.",
    promptSnippet: "code_references — semantic references/usages",
    basePromptGuidelines: [
      "Use code_references to find all semantic usages/references of a symbol.",
      "Returns references/usages grouped by file, not caller sites.",
    ],
    parameters: CodeReferencesParameters,
    run: (params, ctx) =>
      executeReferencesTool(params as Parameters<typeof executeReferencesTool>[0], ctx),
  },
  {
    name: "code_calls",
    label: "Code Calls",
    description: "Structural outgoing calls from the enclosing scope at a position.",
    promptSnippet: "code_calls — outgoing calls from a function/method",
    basePromptGuidelines: [
      "Use code_calls to find outgoing structural calls from an enclosing function or method.",
      "V1 supports outgoing calls only; does not claim incoming callers.",
    ],
    parameters: CodeCallsParameters,
    run: (params, ctx) => executeCallsTool(params as Parameters<typeof executeCallsTool>[0], ctx),
  },
  {
    name: "code_implementations",
    label: "Code Implementations",
    description: "Semantic implementation lookup for a resolved target.",
    promptSnippet: "code_implementations — semantic implementations",
    basePromptGuidelines: [
      "Use code_implementations to find semantic implementations of an interface, class, or method.",
    ],
    parameters: CodeImplementationsParameters,
    run: (params, ctx) =>
      executeImplementationsTool(params as Parameters<typeof executeImplementationsTool>[0], ctx),
  },
  {
    name: "code_affected",
    label: "Code Affected",
    description: "Estimate blast radius and downstream impact for a target.",
    promptSnippet: "code_affected — blast radius and impact",
    basePromptGuidelines: [
      "Use code_affected before edits to estimate blast radius and follow-up checks.",
    ],
    parameters: CodeAffectedParameters,
    run: (params, ctx) =>
      executeAffectedTool(params as Parameters<typeof executeAffectedTool>[0], ctx),
  },
  {
    name: "code_pattern",
    label: "Code Pattern",
    description: "Run explicit search with literal, regex, or structured matching.",
    promptSnippet: "code_pattern — explicit code search",
    basePromptGuidelines: [
      "Use code_pattern for literal, regex, or structured search in a bounded path.",
    ],
    parameters: CodePatternParameters,
    run: (params, ctx) =>
      executePatternTool(params as Parameters<typeof executePatternTool>[0], ctx),
  },
  {
    name: "code_refactor_plan",
    label: "Code Refactor Plan",
    description: "Preview a semantic rename without mutating files.",
    promptSnippet: "code_refactor_plan — preview a rename plan",
    basePromptGuidelines: [
      "Use code_refactor_plan to preview a rename before applying it.",
      "Does not mutate files; returns a plan ID for later use with code_refactor_apply.",
    ],
    parameters: CodeRefactorPlanParameters,
    run: (params, ctx) =>
      executeRefactorPlanTool(params as Parameters<typeof executeRefactorPlanTool>[0], ctx),
  },
  {
    name: "code_refactor_apply",
    label: "Code Refactor Apply",
    description: "Apply a previously generated refactor plan.",
    promptSnippet: "code_refactor_apply — apply a rename plan",
    basePromptGuidelines: [
      "Use code_refactor_apply to execute a plan generated by code_refactor_plan.",
      "Requires a valid planId; rejects stale or missing plans.",
    ],
    parameters: CodeRefactorApplyParameters,
    run: (params, ctx) =>
      executeRefactorApplyTool(params as Parameters<typeof executeRefactorApplyTool>[0], ctx),
  },
] as const satisfies readonly CodeIntelligenceToolDefinitionSpec[];
