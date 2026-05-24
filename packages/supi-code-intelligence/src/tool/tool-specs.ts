import { StringEnum } from "@earendil-works/pi-ai";
import { type TSchema, Type } from "typebox";
import type { CodeIntelResult } from "../types.ts";
import { executeAffectedTool } from "./execute-affected.ts";
import { executeBriefTool } from "./execute-brief.ts";
import { executeMapTool } from "./execute-map.ts";
import { executePatternTool } from "./execute-pattern.ts";
import { executeRelationsTool } from "./execute-relations.ts";

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

export const CODE_INTELLIGENCE_TOOL_NAMES = [
  "code_brief",
  "code_map",
  "code_relations",
  "code_affected",
  "code_pattern",
] as const;
export type CodeIntelligenceToolName = (typeof CODE_INTELLIGENCE_TOOL_NAMES)[number];

export const CODE_RELATION_KIND_NAMES = ["callers", "callees", "implementations"] as const;
export type CodeRelationsKind = (typeof CODE_RELATION_KIND_NAMES)[number];

const CodeRelationsKindEnum = StringEnum(CODE_RELATION_KIND_NAMES);

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

const CodeRelationsParameters = Type.Object(
  {
    kind: CodeRelationsKindEnum,
    path: Type.Optional(PathParam),
    file: Type.Optional(FileParam),
    line: Type.Optional(LineParam),
    character: Type.Optional(CharacterParam),
    symbol: Type.Optional(SymbolParam),
    exportedOnly: Type.Optional(ExportedOnlyParam),
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

export interface CodeIntelligenceToolDefinitionSpec {
  name: CodeIntelligenceToolName;
  label: string;
  description: string;
  promptSnippet: string;
  basePromptGuidelines: string[];
  parameters: TSchema;
  run: (params: unknown, ctx: { cwd: string }) => Promise<CodeIntelResult> | CodeIntelResult;
}

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
    name: "code_relations",
    label: "Code Relations",
    description: "Trace callers, callees, or implementations for a resolved target.",
    promptSnippet: "code_relations — callers, callees, or implementations",
    basePromptGuidelines: [
      "Use code_relations(kind) for `callers`, `callees`, or `implementations`.",
    ],
    parameters: CodeRelationsParameters,
    run: (params, ctx) =>
      executeRelationsTool(params as Parameters<typeof executeRelationsTool>[0], ctx),
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
] as const satisfies readonly CodeIntelligenceToolDefinitionSpec[];
